// Diagnostics de connexion IMAP / SMTP — messages d'erreur en français clair
// afin que l'utilisateur sache exactement quoi corriger (hôte, port, mot de passe d'application…).
import nodemailer from "nodemailer";
import imapflowModule from "imapflow";

const { ImapFlow } = imapflowModule as unknown as {
  ImapFlow: new (opts: Record<string, unknown>) => {
    connect: () => Promise<boolean>;
    logout: () => Promise<void>;
    close: () => void;
    mailboxOpen: (path: string) => Promise<{ exists: number; path: string }>;
  };
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MailDiagResult {
  configured: boolean;
  ok: boolean;
  /** Message humain : succès ou explication précise du problème. */
  details: string;
  /** Détail technique brut (pour le journal serveur / support). */
  raw?: string;
}

interface ErrLike {
  code?: string;
  text?: string;
  response?: string;
  responseCode?: number;
  message?: string;
  command?: string;
  authentication?: boolean;
}

const GmailHint =
  "Pour Gmail ou Google Workspace : activez la validation en deux étapes puis générez un « Mot de passe d'application » (16 caractères) sur myaccount.google.com → Sécurité — votre mot de passe habituel ne fonctionne pas.";

// ─── Traduction des erreurs en langage clair ────────────────────────────────

export function describeMailError(protocol: "IMAP" | "SMTP", error: unknown): string {
  const err = (error ?? {}) as ErrLike;
  const raw = [err.code, err.text, err.response, err.message]
    .filter((v): v is string => Boolean(v))
    .join(" — ");
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  const authFailed =
    code === "AUTHENTICATIONFAILED" ||
    err.responseCode === 535 ||
    /authenticationfailed|invalid credentials|authentication.*failed|username and password/i.test(raw);

  if (protocol === "IMAP") {
    if (authFailed)
      return `Authentification refusée par le serveur : l'utilisateur ou le mot de passe est incorrect. ${GmailHint}`;
    if (code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT" || /timeout|timed out/.test(msg))
      return "Délai dépassé : le serveur IMAP ne répond pas. Vérifiez l'hôte et le port — le port 993 peut être bloqué par un pare-feu ou par l'hébergeur.";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN")
      return "Serveur IMAP introuvable : l'adresse de l'hôte est incorrecte ou la connexion Internet est indisponible (ex. imap.gmail.com).";
    if (code === "ECONNREFUSED")
      return "Connexion refusée : rien n'écoute sur ce port. Utilisez 993 pour SSL/TLS (recommandé) ou 143 pour STARTTLS.";
    if (code === "ECONNRESET" || code === "EPIPE")
      return "Connexion interrompue par le serveur : vérifiez que le port correspond au bon mode de sécurité (993 = SSL/TLS).";
    if (/certificate|self.signed|tls|ssl|handshake/i.test(raw))
      return "Échec de la négociation TLS avec le serveur IMAP : le port et le mode de sécurité ne correspondent pas (993 = SSL/TLS, 143 = STARTTLS).";
    return `Erreur IMAP : ${raw || "inconnue"}`;
  }

  // SMTP
  if (authFailed)
    return `Authentification SMTP refusée : utilisateur ou mot de passe incorrect. ${GmailHint}`;
  if (err.responseCode === 534 || /5\.7\.14|5\.7\.9/.test(raw))
    return `Connexion refusée par le fournisseur (protection Google). ${GmailHint}`;
  if (code === "ESOCKET" || /ssl|tls|wrong version number/i.test(raw))
    return "Erreur SSL/TLS SMTP : cochez « TLS direct (SSL/TLS) » si le port est 465, décochez-le pour 587 (STARTTLS).";
  if (code === "ECONNREFUSED")
    return "Connexion SMTP refusée : rien n'écoute sur ce port. Utilisez 587 (STARTTLS), 465 (SSL/TLS) ou 25.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "Serveur SMTP introuvable : vérifiez l'adresse de l'hôte (ex. smtp.gmail.com).";
  if (code === "ETIMEDOUT" || /timeout|timed out/.test(msg))
    return "Délai dépassé : le serveur SMTP ne répond pas — le port est peut-être bloqué par un pare-feu ou l'hébergeur.";
  return `Erreur SMTP : ${raw || "inconnue"}`;
}

// ─── Test IMAP ──────────────────────────────────────────────────────────────

export async function testImapConnection(cfg: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<MailDiagResult> {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { configured: false, ok: false, details: "IMAP non configuré (hôte, utilisateur ou mot de passe manquant)." };
  }
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 40_000,
  });
  try {
    await client.connect();
    const box = await client.mailboxOpen("INBOX");
    await client.logout();
    return {
      configured: true,
      ok: true,
      details: `Connexion IMAP réussie sur ${cfg.host}:${cfg.port} — ${box.exists} message(s) dans INBOX.`,
    };
  } catch (error) {
    try {
      client.close();
    } catch {
      /* connexion jamais ouverte */
    }
    const err = (error ?? {}) as ErrLike;
    const raw = [err.code, err.text, err.message].filter(Boolean).join(" — ");
    console.error("testImapConnection", error);
    return { configured: true, ok: false, details: describeMailError("IMAP", error), raw };
  }
}

// ─── Test SMTP ──────────────────────────────────────────────────────────────

export async function testSmtpConnection(cfg: {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}): Promise<MailDiagResult> {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { configured: false, ok: false, details: "SMTP non configuré (hôte, utilisateur ou mot de passe manquant)." };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 40_000,
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    return {
      configured: true,
      ok: true,
      details: `Connexion SMTP réussie sur ${cfg.host}:${cfg.port} — l'envoi d'emails fonctionnera.`,
    };
  } catch (error) {
    const err = (error ?? {}) as ErrLike;
    const raw = [err.code, err.response, err.message].filter(Boolean).join(" — ");
    console.error("testSmtpConnection", error);
    return { configured: true, ok: false, details: describeMailError("SMTP", error), raw };
  }
}
