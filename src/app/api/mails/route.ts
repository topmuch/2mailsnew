import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

const FOLDERS = ["INBOX", "SENT", "TRASH"] as const;
type Folder = (typeof FOLDERS)[number];

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
    const [mails, inbox, unread, sent, trash] = await Promise.all([
      db.mail.findMany({ where, orderBy: { sentAt: "desc" }, take: 200, omit: { bodyHtml: true } }),
      db.mail.count({ where: { folder: "INBOX" } }),
      db.mail.count({ where: { folder: "INBOX", read: false } }),
      db.mail.count({ where: { folder: "SENT" } }),
      db.mail.count({ where: { folder: "TRASH" } }),
    ]);

    return NextResponse.json({
      mails,
      counts: { inbox, unread, sent, trash },
    });
  } catch (error) {
    console.error("GET /api/mails", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : envoi d'un message (SMTP si configuré, sinon local) ─────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const to = (body.to ?? "").toString().trim();
    const subject = (body.subject ?? "").toString().trim();
    const text = (body.body ?? "").toString();

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Adresse du destinataire invalide" }, { status: 400 });
    }

    const setting = await db.setting.findFirst();
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
        from: setting?.smtpUser || "local@2mails",
        fromName: setting?.mailFromName || null,
        to,
        subject,
        body: text,
        messageId,
        read: true,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ mail, delivered }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mails", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
