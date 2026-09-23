import { NextRequest, NextResponse } from "next/server";
import imapflowModule from "imapflow";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { describeMailError } from "@/lib/mail-diagnostics";
import { extractMailContent } from "@/lib/mail-mime";

// imapflow v2 expose la classe via l'export par défaut :
// `import imapflowModule from "imapflow"` → { ImapFlow, AuthenticationFailure }
const { ImapFlow } = imapflowModule;

const MAX_MESSAGES = 50;
/** Maximum d'anciens mails vides re-complétés par synchronisation (hors quota du jour). */
const MAX_BACKFILL = 20;

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

// ─── POST : synchronisation IMAP de la boîte de réception ───────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const setting = await db.setting.findFirst();
    if (!setting || !setting.imapHost || !setting.imapUser || !setting.imapPass) {
      return NextResponse.json(
        {
          error:
            "IMAP non configuré — renseignez les serveurs dans la configuration de la boîte mail",
        },
        { status: 400 }
      );
    }

    // Quota du jour : mails déjà importés aujourd'hui / limite configurable (défaut 15)
    const dailyLimit = Math.max(1, Math.min(500, setting.mailDailyImportLimit ?? 15));
    const alreadyToday = await importedTodayCount();
    const remaining = Math.max(0, dailyLimit - alreadyToday);

    if (remaining === 0) {
      return NextResponse.json({
        imported: 0,
        backfilled: 0,
        total: null,
        limit: dailyLimit,
        importedToday: alreadyToday,
        limitReached: true,
        message: `Limite quotidienne d'importation atteinte (${dailyLimit} mails/jour) — la synchronisation reprendra demain. Vous pouvez augmenter la limite dans la configuration de la boîte.`,
      });
    }

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
      // On s'arrête dès que le quota du jour est atteint (évite de télécharger inutilement)
      const maxImport = Math.min(remaining, MAX_MESSAGES);

      if (total > 0) {
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
        let backfilled = 0;

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

          // Quota du jour pour les NOUVEAUX messages uniquement
          if (imported >= maxImport) break;
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

        await client.logout();

        await db.setting.update({
          where: { id: setting.id },
          data: { lastMailSync: new Date() },
        });

        const importedToday = alreadyToday + imported;
        return NextResponse.json({
          imported,
          backfilled,
          total,
          limit: dailyLimit,
          importedToday,
          limitReached: importedToday >= dailyLimit,
        });
      }

      await client.logout();

      await db.setting.update({
        where: { id: setting.id },
        data: { lastMailSync: new Date() },
      });

      return NextResponse.json({
        imported,
        backfilled: 0,
        total,
        limit: dailyLimit,
        importedToday: alreadyToday,
        limitReached: alreadyToday >= dailyLimit,
      });
    } catch (error) {
      // Ferme proprement la connexion en cas d'échec IMAP
      try {
        client.close();
      } catch {
        // connexion déjà fermée
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/mails/sync", error);
    // Message clair en français : cause exacte (identifiants, hôte, port bloqué…)
    return NextResponse.json(
      { error: describeMailError("IMAP", error) },
      { status: 502 }
    );
  }
}
