import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import type { MailAttachment } from "@/lib/types";

const FOLDERS = ["INBOX", "SENT", "TRASH", "PLANIFIES"] as const;
type Folder = (typeof FOLDERS)[number];

/** Limite totale des pièces jointes : 9 Mo de base64 (≈ 6,7 Mo de fichiers réels). */
const MAX_ATTACHMENTS_BASE64 = 9 * 1024 * 1024;

// ─── Helpers pièces jointes ─────────────────────────────────────────────────

/** Valide et normalise les pièces jointes reçues du client ; renvoie une erreur ou null. */
function parseAttachments(input: unknown): { attachments: MailAttachment[] } | { error: string } {
  if (input === undefined || input === null) return { attachments: [] };
  if (!Array.isArray(input)) return { error: "Pièces jointes invalides" };

  const attachments: MailAttachment[] = [];
  let totalBase64 = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { error: "Pièce jointe invalide" };
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 255) : "";
    const data = typeof item.data === "string" ? item.data : "";
    if (!name || !data) return { error: `Pièce jointe incomplète : ${name || "(sans nom)"}` };
    const mime =
      typeof item.mime === "string" && item.mime.trim() ? item.mime.trim() : "application/octet-stream";
    // Taille réelle déduite du base64 (4 chars → 3 octets) si non fournie
    const size =
      typeof item.size === "number" && Number.isFinite(item.size) && item.size > 0
        ? Math.trunc(item.size)
        : Math.floor((data.length * 3) / 4);
    totalBase64 += data.length;
    if (totalBase64 > MAX_ATTACHMENTS_BASE64) {
      return { error: "Pièces jointes trop volumineuses (maximum 9 Mo au total)" };
    }
    attachments.push({ name, mime, size, data });
  }
  return { attachments };
}

/** JSON des pièces jointes à stocker en base (null si aucune). */
const attachmentsJson = (attachments: MailAttachment[]): string | null =>
  attachments.length ? JSON.stringify(attachments) : null;

/**
 * Allège les pièces jointes pour les listes : on retire le contenu base64 (lourd),
 * on conserve nom/type/taille pour l'affichage (icône trombone, détail).
 */
function lightenAttachments(json: string | null): string | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Array<{ name?: string; mime?: string; size?: number }>;
    if (!Array.isArray(parsed)) return null;
    return JSON.stringify(
      parsed.map((a) => ({ name: a.name ?? "", mime: a.mime ?? "", size: a.size ?? 0 }))
    );
  } catch {
    return null;
  }
}

// ─── GET : liste des mails d'un dossier + compteurs globaux ─────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderParam = (searchParams.get("folder") ?? "INBOX").toUpperCase();
    const folder: Folder = (FOLDERS as readonly string[]).includes(folderParam)
      ? (folderParam as Folder)
      : "INBOX";
    const q = (searchParams.get("q") ?? "").trim();

    // SQLite : LIKE (donc contains) est déjà insensible à la casse pour l'ASCII
    const where: {
      folder: string;
      OR?: Array<
        | { subject: { contains: string } }
        | { from: { contains: string } }
        | { to: { contains: string } }
        | { body: { contains: string } }
      >;
    } = { folder };
    if (q) {
      where.OR = [
        { subject: { contains: q } },
        { from: { contains: q } },
        { to: { contains: q } },
        { body: { contains: q } },
      ];
    }

    // Les compteurs portent sur TOUS les dossiers, pas sur le dossier filtré.
    // La liste omet bodyHtml (lourd) : le panneau de lecture charge le détail à l'ouverture.
    // Dossier PLANIFIES : tri par date d'envoi programmé (prochain en premier).
    const [mails, inbox, unread, sent, trash, planifies] = await Promise.all([
      db.mail.findMany({
        where,
        orderBy: folder === "PLANIFIES" ? { scheduledAt: "asc" } : { sentAt: "desc" },
        take: 200,
        omit: { bodyHtml: true },
      }),
      db.mail.count({ where: { folder: "INBOX" } }),
      db.mail.count({ where: { folder: "INBOX", read: false } }),
      db.mail.count({ where: { folder: "SENT" } }),
      db.mail.count({ where: { folder: "TRASH" } }),
      db.mail.count({ where: { folder: "PLANIFIES" } }),
    ]);

    return NextResponse.json({
      mails: mails.map((m) => ({ ...m, attachments: lightenAttachments(m.attachments) })),
      counts: { inbox, unread, sent, trash, planifies },
    });
  } catch (error) {
    console.error("GET /api/mails", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : envoi immédiat ou programmé (SMTP si configuré, sinon local) ────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const to = (body.to ?? "").toString().trim();
    const subject = (body.subject ?? "").toString().trim();
    const text = (body.body ?? "").toString();

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Adresse du destinataire invalide" }, { status: 400 });
    }

    const att = parseAttachments(body.attachments);
    if ("error" in att) {
      return NextResponse.json({ error: att.error }, { status: 400 });
    }
    const nodemailerAttachments = att.attachments.map((a) => ({
      filename: a.name,
      contentType: a.mime,
      content: Buffer.from(a.data, "base64"),
    }));

    const setting = await db.setting.findFirst();
    const from = setting?.smtpUser || "local@2mails";
    const fromName = setting?.mailFromName || null;

    // ─── Envoi programmé : date/heure future obligatoire, aucun envoi maintenant ───
    if (body.scheduledAt !== undefined && body.scheduledAt !== null && body.scheduledAt !== "") {
      const scheduled = new Date(String(body.scheduledAt));
      if (Number.isNaN(scheduled.getTime())) {
        return NextResponse.json({ error: "Date d'envoi programmé invalide" }, { status: 400 });
      }
      if (scheduled.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "La date d'envoi programmé doit être dans le futur" },
          { status: 400 }
        );
      }
      const mail = await db.mail.create({
        data: {
          direction: "OUT",
          folder: "PLANIFIES",
          status: "PLANIFIE",
          scheduledAt: scheduled,
          from,
          fromName,
          to,
          subject,
          body: text,
          read: true,
          attachments: attachmentsJson(att.attachments),
        },
      });
      return NextResponse.json({ mail, delivered: false, scheduled: true }, { status: 201 });
    }

    // ─── Envoi immédiat (comportement historique) ───
    const smtpReady = Boolean(
      setting && setting.smtpHost && setting.smtpUser && setting.smtpPass
    );

    let delivered = false;
    let messageId: string | null = null;

    if (smtpReady && setting) {
      // Envoi réel via SMTP
      try {
        const transporter = nodemailer.createTransport({
          host: setting.smtpHost,
          port: setting.smtpPort,
          secure: setting.smtpSecure,
          auth: { user: setting.smtpUser, pass: setting.smtpPass },
        });
        const info = await transporter.sendMail({
          from: `"${setting.mailFromName || "2MAILS"}" <${setting.smtpUser}>`,
          to,
          subject,
          text,
          attachments: nodemailerAttachments,
        });
        delivered = true;
        messageId = info.messageId ?? null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "erreur inconnue";
        console.error("POST /api/mails (SMTP)", error);
        return NextResponse.json(
          { error: `Échec d'envoi SMTP : ${message}` },
          { status: 502 }
        );
      }
    }

    // Enregistré dans "Envoyés" en cas de succès OU si SMTP n'est pas configuré
    const mail = await db.mail.create({
      data: {
        direction: "OUT",
        folder: "SENT",
        from,
        fromName,
        to,
        subject,
        body: text,
        messageId,
        read: true,
        sentAt: new Date(),
        attachments: attachmentsJson(att.attachments),
      },
    });

    return NextResponse.json({ mail, delivered }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mails", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
