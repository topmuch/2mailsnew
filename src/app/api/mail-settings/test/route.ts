import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { testImapConnection, testSmtpConnection } from "@/lib/mail-diagnostics";

// POST /api/mail-settings/test
// Teste les connexions IMAP (réception) et SMTP (envoi) avec la configuration
// enregistrée en base. Ne modifie rien — lecture seule. Renvoie pour chaque
// protocole { configured, ok, details } avec un message clair en français.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const setting = await db.setting.findFirst();

    const imap = await testImapConnection({
      host: setting?.imapHost ?? "",
      port: setting?.imapPort ?? 993,
      user: setting?.imapUser ?? "",
      pass: setting?.imapPass ?? "",
    });
    const smtp = await testSmtpConnection({
      host: setting?.smtpHost ?? "",
      port: setting?.smtpPort ?? 587,
      user: setting?.smtpUser ?? "",
      pass: setting?.smtpPass ?? "",
      secure: setting?.smtpSecure ?? false,
    });

    return NextResponse.json({ imap, smtp });
  } catch (error) {
    console.error("POST /api/mail-settings/test", error);
    return NextResponse.json(
      { error: "Erreur serveur pendant le test" },
      { status: 500 }
    );
  }
}
