import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { testImapConnection, testSmtpConnection } from "@/lib/mail-diagnostics";

// POST /api/mail-settings/test
// Teste les connexions IMAP (réception) et SMTP (envoi). Ne modifie rien — lecture seule.
//
// Deux modes :
//  1. Corps JSON avec les valeurs du formulaire (non enregistrées) → teste ces valeurs.
//     Les mots de passe vides retombent sur ceux déjà enregistrés en base.
//  2. Sans corps → teste la configuration enregistrée en base.
//
// Astuce SMTP : si le test échoue avec une erreur SSL/TLS (couple port / « TLS direct »
// incohérent), la connexion est automatiquement retentée avec l'autre mode (STARTTLS ↔
// TLS direct) et le message indique exactement quoi cocher.

interface TestBody {
  mailFromName?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number | string;
  imapUser?: string;
  imapPass?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const setting = await db.setting.findFirst();

    // Corps optionnel : valeurs du formulaire à tester sans enregistrer
    let body: TestBody = {};
    try {
      body = (await request.json()) as TestBody;
    } catch {
      // pas de corps valide → test de la config enregistrée
    }

    const str = (v: unknown, fb: string): string =>
      typeof v === "string" && v.trim() ? v.trim() : fb;
    const num = (v: unknown, fb: number): number => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fb;
    };
    const pass = (v: unknown, fb: string): string => {
      const s = typeof v === "string" ? v.trim() : "";
      if (!s) return fb;
      const compact = s.replace(/\s+/g, "");
      // Mot de passe d'application Gmail : « abcd efgh ijkl mnop » → espaces retirés
      return /^[a-zA-Z0-9]{16}$/.test(compact) ? compact : s;
    };

    const imap = await testImapConnection({
      host: str(body.imapHost, setting?.imapHost ?? ""),
      port: num(body.imapPort, setting?.imapPort ?? 993),
      user: str(body.imapUser, setting?.imapUser ?? ""),
      pass: pass(body.imapPass, setting?.imapPass ?? ""),
    });

    const smtpBase = {
      host: str(body.smtpHost, setting?.smtpHost ?? ""),
      port: num(body.smtpPort, setting?.smtpPort ?? 587),
      user: str(body.smtpUser, setting?.smtpUser ?? ""),
      pass: pass(body.smtpPass, setting?.smtpPass ?? ""),
      secure:
        typeof body.smtpSecure === "boolean"
          ? body.smtpSecure
          : (setting?.smtpSecure ?? false),
    };
    let smtp = await testSmtpConnection(smtpBase);

    // Réessai automatique en mode opposé si erreur SSL/TLS (mauvais couple port/mode)
    if (smtp.configured && !smtp.ok && /SSL|TLS/i.test(smtp.details)) {
      const alt = { ...smtpBase, secure: !smtpBase.secure };
      const altResult = await testSmtpConnection(alt);
      if (altResult.ok) {
        smtp = {
          ...altResult,
          details: `${altResult.details} Mode correct détecté automatiquement : ${
            alt.secure ? "COCHEZ" : "DÉCOCHEZ"
          } « TLS direct » avec le port ${alt.port} (le mode ${
            smtpBase.secure ? "TLS direct" : "STARTTLS"
          } ne fonctionne pas sur ce serveur).`,
        };
      }
    }

    return NextResponse.json({ imap, smtp });
  } catch (error) {
    console.error("POST /api/mail-settings/test", error);
    return NextResponse.json(
      { error: "Erreur serveur pendant le test" },
      { status: 500 }
    );
  }
}
