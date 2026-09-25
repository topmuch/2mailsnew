// ─── Traitement des mails programmés (Task 46-b) ────────────────────────────
// Appelé à CHAQUE tick du scheduler (src/lib/crm-scheduler.ts), indépendamment
// des heures ouvrées : un mail programmé par l'utilisateur part dès que sa
// date/heure planifiée est atteinte.
//
// Responsabilités :
//  1. Charger les Mail en status "PLANIFIE" avec scheduledAt <= now
//  2. Les envoyer via SMTP (nodemailer, mêmes réglages que POST /api/mails)
//     avec leurs pièces jointes (attachments JSON) — signature déjà dans body
//  3. Succès   → status "SENT", folder "SENT", sentAt = now
//     Échec    → status "ECHEC" + sendError (l'utilisateur peut réessayer :
//                repasser le statut à "PLANIFIE" via l'API)
//     SMTP non configuré → même règle que l'envoi immédiat : archivé "SENT"
//  4. Ne PAS renvoyer un mail déjà parti (status SENT/ECHEC jamais retouchés
//     automatiquement) + anti-doublon par « claim » conditionnel (updateMany
//     where status = "PLANIFIE") : un mail est traité par un seul worker.

import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import type { MailAttachment } from "@/lib/types";

/** Nombre maximal de mails traités par tick (protection anti-gel du scheduler). */
const MAX_PER_TICK = 25;

/** Parse le JSON des pièces jointes ; renvoie [] en cas d'absence ou d'erreur. */
function parseAttachments(json: string | null): MailAttachment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is MailAttachment =>
        Boolean(a) &&
        typeof a === "object" &&
        typeof (a as MailAttachment).name === "string" &&
        typeof (a as MailAttachment).data === "string"
    );
  } catch {
    return [];
  }
}

export async function processScheduledMails(
  now: Date
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    const due = await db.mail.findMany({
      where: { status: "PLANIFIE", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: MAX_PER_TICK,
    });
    if (!due.length) return { sent: 0, failed: 0 };

    const setting = await db.setting.findFirst();
    const smtpReady = Boolean(
      setting && setting.smtpHost && setting.smtpUser && setting.smtpPass
    );

    for (const mail of due) {
      // ─── Anti-doublon : « claim » conditionnel. On repousse scheduledAt 1 min
      // dans le futur : plus aucun autre tick/worker ne matche (scheduledAt <= now)
      // tant que l'envoi est en cours. Si le process crashait pendant l'envoi, le
      // mail resterait PLANIFIE et serait repris au tick suivant (at-least-once).
      const claimed = await db.mail.updateMany({
        where: { id: mail.id, status: "PLANIFIE", scheduledAt: { lte: now } },
        data: { scheduledAt: new Date(now.getTime() + 60_000) },
      });
      if (claimed.count === 0) continue;

      // SMTP non configuré → même règle que l'envoi immédiat : archivé "SENT"
      if (!smtpReady || !setting) {
        await db.mail.update({
          where: { id: mail.id },
          data: { status: "SENT", folder: "SENT", sentAt: now, sendError: null },
        });
        sent++;
        continue;
      }

      try {
        const transporter = nodemailer.createTransport({
          host: setting.smtpHost,
          port: setting.smtpPort,
          secure: setting.smtpSecure,
          auth: { user: setting.smtpUser, pass: setting.smtpPass },
        });
        const attachments = parseAttachments(mail.attachments).map((a) => ({
          filename: a.name,
          contentType: a.mime,
          content: Buffer.from(a.data, "base64"),
        }));
        await transporter.sendMail({
          from: `"${setting.mailFromName || "2MAILS"}" <${setting.smtpUser}>`,
          to: mail.to,
          subject: mail.subject,
          text: mail.body,
          attachments,
        });
        await db.mail.update({
          where: { id: mail.id },
          data: { status: "SENT", folder: "SENT", sentAt: now, sendError: null },
        });
        sent++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : "erreur inconnue";
        console.error(`[mail-schedule] échec d'envoi du mail ${mail.id}`, error);
        await db.mail.update({
          where: { id: mail.id },
          data: { status: "ECHEC", sendError: message },
        });
        failed++;
      }
    }
  } catch (error) {
    // Jamais de throw : le scheduler catche déjà, mais restons propres.
    console.error("[mail-schedule] erreur processScheduledMails", error);
  }

  return { sent, failed };
}
