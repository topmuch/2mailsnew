import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { MailConfig } from "@/lib/types";

type SettingRow = NonNullable<Awaited<ReturnType<typeof db.setting.findFirst>>>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convertit la ligne Setting en MailConfig SANS mots de passe. */
function toConfig(setting: SettingRow | null): MailConfig {
  const mailFromName = setting?.mailFromName ?? "2MAILS";
  const smtpHost = setting?.smtpHost ?? "";
  const smtpUser = setting?.smtpUser ?? "";
  const smtpPass = setting?.smtpPass ?? "";
  const imapHost = setting?.imapHost ?? "";
  const imapUser = setting?.imapUser ?? "";
  const imapPass = setting?.imapPass ?? "";

  return {
    mailFromName,
    smtpHost,
    smtpPort: setting?.smtpPort ?? 587,
    smtpUser,
    smtpSecure: setting?.smtpSecure ?? false,
    imapHost,
    imapPort: setting?.imapPort ?? 993,
    imapUser,
    smtpConfigured: Boolean(smtpHost && smtpUser && smtpPass),
    imapConfigured: Boolean(imapHost && imapUser && imapPass),
    lastMailSync: setting?.lastMailSync ? setting.lastMailSync.toISOString() : null,
  };
}

const strField = (value: unknown, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
};

const numField = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
};

/** Mot de passe : vide ou absent → conserver l'ancien. */
const passField = (value: unknown, fallback: string): string => {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : fallback;
};

// ─── GET : configuration de la boîte (sans mots de passe) ───────────────────

export async function GET() {
  try {
    const setting = await db.setting.findFirst();
    return NextResponse.json({ config: toConfig(setting) });
  } catch (error) {
    console.error("GET /api/mail-settings", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── PUT : mise à jour de la configuration (réservé ADMIN) ──────────────────

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé à l'administrateur" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const current = await db.setting.findFirst();

    const data = {
      mailFromName: strField(body.mailFromName, current?.mailFromName ?? "2MAILS"),
      smtpHost: strField(body.smtpHost, current?.smtpHost ?? ""),
      smtpPort: numField(body.smtpPort, current?.smtpPort ?? 587),
      smtpUser: strField(body.smtpUser, current?.smtpUser ?? ""),
      smtpPass: passField(body.smtpPass, current?.smtpPass ?? ""),
      smtpSecure:
        typeof body.smtpSecure === "boolean" ? body.smtpSecure : (current?.smtpSecure ?? false),
      imapHost: strField(body.imapHost, current?.imapHost ?? ""),
      imapPort: numField(body.imapPort, current?.imapPort ?? 993),
      imapUser: strField(body.imapUser, current?.imapUser ?? ""),
      imapPass: passField(body.imapPass, current?.imapPass ?? ""),
    };

    const setting = await db.setting.upsert({
      where: { id: "main" },
      update: data,
      create: data,
    });

    return NextResponse.json({ config: toConfig(setting) });
  } catch (error) {
    console.error("PUT /api/mail-settings", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
