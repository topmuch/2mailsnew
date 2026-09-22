import { NextResponse } from "next/server";
import imapflowModule from "imapflow";
import { db } from "@/lib/db";

// imapflow v2 expose la classe via l'export par défaut :
// `import imapflowModule from "imapflow"` → { ImapFlow, AuthenticationFailure }
const { ImapFlow } = imapflowModule;

const MAX_MESSAGES = 50;
const MAX_BODY_LENGTH = 100_000;

// ─── Extraction du texte d'un message brut (MIME) ───────────────────────────

function decodeQuotedPrintable(input: string): string {
  const cleaned = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const hex = cleaned.slice(i + 1, i + 3);
    if (cleaned[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodePart(body: string, encoding: string, isHtml: boolean): string {
  let text = body;
  if (encoding === "base64") {
    text = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf-8");
  } else if (encoding === "quoted-printable") {
    text = decodeQuotedPrintable(body);
  }
  return isHtml ? stripHtml(text) : text.trim();
}

/**
 * Extrait un texte lisible du message source brut :
 * gère les cas courants (multipart 1..n, base64, quoted-printable, HTML).
 */
function extractTextFromSource(source: Buffer | undefined): string {
  if (!source || source.length === 0) return "";

  const raw = source.toString("utf-8");
  const sep = raw.indexOf("\r\n\r\n");
  const headerBlock = (sep >= 0 ? raw.slice(0, sep) : "").toLowerCase();
  const body = sep >= 0 ? raw.slice(sep + 4) : raw;

  const typeHeader = /content-type:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/.exec(headerBlock)?.[1] ?? "";
  const encoding = /content-transfer-encoding:\s*([^\r\n]+)/.exec(headerBlock)?.[1]?.trim() ?? "";

  if (typeHeader.includes("multipart/")) {
    const boundary = /boundary="?([^"\r\n;]+)"?/.exec(typeHeader)?.[1];
    if (boundary) {
      let plain = "";
      let html = "";
      for (const chunk of body.split(`--${boundary}`)) {
        const trimmed = chunk.trim();
        if (!trimmed || trimmed === "--") continue;
        const nestedType =
          (/content-type:\s*([^\r\n]+)/.exec(trimmed.toLowerCase())?.[1] ?? "").trim();
        const nested = extractTextFromSource(Buffer.from(trimmed));
        if (!nested) continue;
        if (nestedType.includes("text/html")) {
          if (!html) html = nested;
        } else if (!plain) {
          plain = nested;
        }
      }
      return (plain || html).slice(0, MAX_BODY_LENGTH);
    }
  }

  if (typeHeader.includes("text/html")) {
    return decodePart(body, encoding, true).slice(0, MAX_BODY_LENGTH);
  }
  if (typeHeader && !typeHeader.includes("text/")) {
    // Pièce jointe ou contenu binaire : pas de texte exploitable
    return "";
  }
  return decodePart(body, encoding, false).slice(0, MAX_BODY_LENGTH);
}

// ─── POST : synchronisation IMAP de la boîte de réception ───────────────────

export async function POST() {
  try {
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

    const client = new ImapFlow({
      host: setting.imapHost,
      port: setting.imapPort,
      secure: setting.imapPort === 993,
      auth: { user: setting.imapUser, pass: setting.imapPass },
    });

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen("INBOX");
      const total = mailbox.exists;

      let imported = 0;

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

        // Un seul findMany pour le dédoublonnage (évite N requêtes)
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
              select: { messageId: true },
            })
          : [];
        const existing = new Set(existingRows.map((row) => row.messageId));
        const seenInBatch = new Set<string>();

        for (const msg of messages) {
          if (!msg.uid) continue;
          if (!msg.messageId || existing.has(msg.messageId) || seenInBatch.has(msg.messageId)) {
            continue;
          }
          seenInBatch.add(msg.messageId);

          // Corps : source brute décodée en texte simple
          const full = await client.fetchOne(
            String(msg.uid),
            { source: true, uid: true },
            { uid: true }
          );
          const body =
            full && typeof full === "object" ? extractTextFromSource(full.source) : "";

          await db.mail.create({
            data: {
              direction: "IN",
              folder: "INBOX",
              from: msg.from,
              fromName: msg.fromName,
              to: setting.imapUser,
              subject: msg.subject,
              body,
              messageId: msg.messageId,
              read: false,
              sentAt: msg.date,
            },
          });
          imported += 1;
        }
      }

      await client.logout();

      await db.setting.update({
        where: { id: setting.id },
        data: { lastMailSync: new Date() },
      });

      return NextResponse.json({ imported, total });
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
    const message = error instanceof Error ? error.message : "erreur inconnue";
    return NextResponse.json({ error: `Échec IMAP : ${message}` }, { status: 502 });
  }
}
