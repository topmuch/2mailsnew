import imapflowModule from "imapflow";
import { db } from "@/lib/db";
import { extractMailContent } from "@/lib/mail-mime";

// imapflow v2 expose la classe via l'export par défaut :
// `import imapflowModule from "imapflow"` → { ImapFlow, AuthenticationFailure }
const { ImapFlow } = imapflowModule;

const MAX_MESSAGES = 50;
/** Maximum d'anciens mails vides re-complétés par synchronisation (hors quota du jour). */
const MAX_BACKFILL = 20;
/**
 * Fenêtre « temps réel » : un mail reçu dans les dernières 48 h contourne le
 * quota quotidien — la réception des nouveaux messages ne doit jamais attendre.
 * Le quota ne limite que le rattrapage de l'historique (mails plus anciens).
 */
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type MailSyncResult = {
  imported: number;
  backfilled: number;
  total: number | null;
  limit: number;
  importedToday: number;
  limitReached: boolean;
  skipped: boolean;
  message?: string;
};

const globalForMailSync = globalThis as unknown as { __mailSyncRunning?: boolean };

/**
 * Limite quotidienne d'importation (anti-saturation de la boîte) :
 * on ne dépasse pas Setting.mailDailyImportLimit mails reçus importés par jour.
 */
async function importedTodayCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db.mail.count({
    where: { direction: "IN", createdAt: { gte: startOfDay } },
  });
}

/**
 * Synchronisation IMAP de la boîte de réception — utilisée par la route manuelle
 * ET par le scheduler automatique (toutes les 2 minutes).
 *
 * Garanties :
 * - les mails les PLUS RÉCENTS sont importés en premier (tri par date décroissante) ;
 * - les mails reçus depuis moins de 48 h arrivent même si le quota du jour est
 *   épuisé (temps réel), le quota ne ralentit que l'historique ;
 * - aucune suppression : les mails s'accumulent (dédoublonnage par messageId) ;
 * - un seul processus de synchronisation à la fois (verrou global).
 */
export async function runMailSync(): Promise<MailSyncResult> {
  const setting = await db.setting.findFirst();
  if (!setting || !setting.imapHost || !setting.imapUser || !setting.imapPass) {
    return {
      imported: 0,
      backfilled: 0,
      total: null,
      limit: 0,
      importedToday: 0,
      limitReached: false,
      skipped: true,
      message: "IMAP non configuré — renseignez les serveurs dans la configuration de la boîte mail",
    };
  }

  if (globalForMailSync.__mailSyncRunning) {
    return {
      imported: 0,
      backfilled: 0,
      total: null,
      limit: 0,
      importedToday: 0,
      limitReached: false,
      skipped: true,
      message: "Une synchronisation est déjà en cours",
    };
  }
  globalForMailSync.__mailSyncRunning = true;

  const client = new ImapFlow({
    host: setting.imapHost,
    port: setting.imapPort,
    secure: setting.imapPort === 993,
    auth: { user: setting.imapUser, pass: setting.imapPass },
    logger: false,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 40_000,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    const total = mailbox.exists;

    let imported = 0;
    let backfilled = 0;
    let limitReached = false;

    if (total > 0) {
      // Quota du jour : mails déjà importés aujourd'hui / limite configurable (défaut 15)
      const dailyLimit = Math.max(1, Math.min(500, setting.mailDailyImportLimit ?? 15));
      const alreadyToday = await importedTodayCount();
      const remaining = Math.max(0, dailyLimit - alreadyToday);
      // Plafond d'historique par passage : le reste reprendra aux passages suivants
      const maxHistoryImport = Math.min(remaining, MAX_MESSAGES);

      // Les MAX_MESSAGES derniers messages de la boîte
      const range = total > MAX_MESSAGES ? `${total - MAX_MESSAGES + 1}:*` : "1:*";

      const messages: Array<{
        uid: number;
        messageId: string | null;
        from: string;
        fromName: string | null;
        subject: string;
        date: Date;
      }> = [];

      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true },
        { uid: true }
      )) {
        const envelope = msg.envelope;
        messages.push({
          uid: msg.uid ?? 0,
          messageId: envelope?.messageId ?? null,
          from: envelope?.from?.[0]?.address ?? "",
          fromName: envelope?.from?.[0]?.name ?? null,
          subject: envelope?.subject ?? "",
          date: envelope?.date ? new Date(envelope.date) : new Date(),
        });
      }

      // Du plus récent au plus ancien : les nouveaux mails arrivent immédiatement,
      // même quand le quota d'historique du jour est déjà consommé.
      messages.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Un seul findMany : dédoublonnage + détection des corps vides à re-compléter
      const ids = [
        ...new Set(
          messages
            .map((m) => m.messageId)
            .filter((v): v is string => Boolean(v))
        ),
      ];
      const existingRows = ids.length
        ? await db.mail.findMany({
            where: { messageId: { in: ids } },
            select: { messageId: true, body: true },
          })
        : [];
      // messageId des mails déjà importés mais au corps vide (ancien extracteur)
      const emptyBodyIds = new Set(
        existingRows.filter((row) => !row.body.trim()).map((row) => row.messageId)
      );
      const existing = new Set(existingRows.map((row) => row.messageId));
      const seenInBatch = new Set<string>();

      const nowMs = Date.now();

      for (const msg of messages) {
        if (!msg.uid || !msg.messageId) continue;

        if (existing.has(msg.messageId) || seenInBatch.has(msg.messageId)) {
          // Déjà importé : si le corps était vide, on le re-complète avec le
          // nouvel extracteur (texte + HTML/images) — hors quota du jour.
          if (
            emptyBodyIds.has(msg.messageId) &&
            !seenInBatch.has(msg.messageId) &&
            backfilled < MAX_BACKFILL
          ) {
            seenInBatch.add(msg.messageId);
            const full = await client.fetchOne(
              String(msg.uid),
              { source: true, uid: true },
              { uid: true }
            );
            const content = extractMailContent(full?.source);
            if (content.text || content.html) {
              await db.mail.updateMany({
                where: { messageId: msg.messageId, folder: "INBOX" },
                data: { body: content.text, bodyHtml: content.html },
              });
              backfilled += 1;
            }
          }
          continue;
        }

        // Les mails récents (moins de 48 h) passent toujours ; l'historique
        // plus ancien respecte le quota du jour. Tri décroissant : dès qu'on
        // sort de la fenêtre récente avec le quota épuisé, inutile de continuer.
        const isRecent = msg.date.getTime() >= nowMs - RECENT_WINDOW_MS;
        if (!isRecent && imported >= maxHistoryImport) break;

        seenInBatch.add(msg.messageId);

        // Corps : texte lisible + HTML assaini (images externes conservées)
        const full = await client.fetchOne(
          String(msg.uid),
          { source: true, uid: true },
          { uid: true }
        );
        const content = extractMailContent(full?.source);

        await db.mail.create({
          data: {
            direction: "IN",
            folder: "INBOX",
            from: msg.from,
            fromName: msg.fromName,
            to: setting.imapUser,
            subject: msg.subject,
            body: content.text,
            bodyHtml: content.html,
            messageId: msg.messageId,
            read: false,
            sentAt: msg.date,
          },
        });
        imported += 1;
      }

      limitReached = alreadyToday + imported >= dailyLimit;
    }

    await client.logout();

    await db.setting.update({
      where: { id: setting.id },
      data: { lastMailSync: new Date() },
    });

    const dailyLimit = Math.max(1, Math.min(500, setting.mailDailyImportLimit ?? 15));
    const importedToday = await importedTodayCount();

    return {
      imported,
      backfilled,
      total,
      limit: dailyLimit,
      importedToday,
      limitReached,
      skipped: false,
    };
  } catch (error) {
    // Ferme proprement la connexion en cas d'échec IMAP
    try {
      client.close();
    } catch {
      // connexion déjà fermée
    }
    throw error;
  } finally {
    globalForMailSync.__mailSyncRunning = false;
  }
}
