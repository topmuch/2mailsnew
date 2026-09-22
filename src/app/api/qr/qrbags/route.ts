import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { QrBagsResult } from "@/lib/types";

/**
 * GET /api/qr/qrbags?ref=HAJJ25-ABC123
 * Vérifie une référence d'étiquette bagages QRBags.
 * - Format attendu : HAJJ|VOL + 2 chiffres + tiret + 6 caractères [A-Z0-9].
 * - La page publique https://qrbags.com/suivi/{REF} est rendue côté client :
 *   on récupère l'état de la page, son <title> et quelques indices textuels ;
 *   le détail complet reste sur la page officielle (lien fourni).
 * - Format invalide ou service injoignable → 200 avec result explicite
 *   (seule une erreur serveur interne renvoie 500).
 */

const REF_REGEX = /^(HAJJ|VOL)\d{2}-[A-Z0-9]{6}$/;
const FORMAT_ATTENDU =
  "HAJJ25-ABC123 ou VOL25-ABC123 (préfixe HAJJ ou VOL, 2 chiffres, tiret, 6 caractères)";
const MESSAGE_INVALIDE =
  "Format de référence invalide — attendu HAJJ25-ABC123 ou VOL25-ABC123 (préfixe HAJJ ou VOL, 2 chiffres, tiret, 6 caractères)";

/** Décode les entités HTML courantes (nommées et numériques). */
function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    eacute: "é",
    egrave: "è",
    agrave: "à",
    ccedil: "ç",
    ecirc: "ê",
    ocirc: "ô",
    ugrave: "ù",
    rsquo: "’",
    mdash: "—",
    ndash: "–",
  };
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

/** Extrait et nettoie le <title> d'une page HTML. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
  return title || null;
}

/** Recherche d'indices textuels dans le HTML de la page de suivi. */
function extractHints(html: string): string | null {
  const lower = html.toLowerCase();
  if (lower.includes("not_found") || lower.includes("introuvable")) {
    return "la page semble indiquer une étiquette introuvable";
  }
  if (lower.includes("étiquette") || lower.includes("etiquette")) {
    return "page de suivi d'étiquette détectée";
  }
  if (lower.includes("bagage") || lower.includes("luggage") || lower.includes("whatsapp")) {
    return "page QRBags (étiquettes bagages / alerte WhatsApp) détectée";
  }
  if (lower.includes("suivi")) {
    return "page de suivi détectée";
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const ref = (sp.get("ref") ?? "").trim().toUpperCase();

    // 1) Format invalide → 200 avec result explicite + historique en ERREUR
    if (!REF_REGEX.test(ref)) {
      const result: QrBagsResult = {
        provider: "QRBAGS",
        reference: ref,
        validFormat: false,
        formatAttendu: FORMAT_ATTENDU,
        reachable: false,
        info: null,
        sourceUrl: "",
        message: MESSAGE_INVALIDE,
      };
      try {
        await db.qrLookup.create({
          data: {
            provider: "QRBAGS",
            query: ref,
            options: null,
            result: JSON.stringify(result),
            status: "ERREUR",
          },
        });
      } catch (err) {
        console.error("GET /api/qr/qrbags (enregistrement QrLookup)", err);
      }
      return NextResponse.json({ result });
    }

    // 2) Format valide → vérification de la page officielle de suivi
    const sourceUrl = `https://qrbags.com/suivi/${encodeURIComponent(ref)}`;
    let reachable = false;
    let info: string | null = null;

    try {
      const res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
        cache: "no-store",
      });
      reachable = res.ok;
      if (res.ok) {
        const html = await res.text();
        const title = extractTitle(html);
        const hint = extractHints(html);
        const parts: string[] = [];
        if (title) parts.push(`Page : « ${truncate(title, 100)} »`);
        if (hint) parts.push(hint);
        if (parts.length > 0) info = truncate(parts.join(" — "), 200);
      }
    } catch (err) {
      console.error("GET /api/qr/qrbags (fetch page de suivi)", err);
    }

    const result: QrBagsResult = {
      provider: "QRBAGS",
      reference: ref,
      validFormat: true,
      formatAttendu: FORMAT_ATTENDU,
      reachable,
      info,
      sourceUrl,
      message: reachable
        ? "Étiquette vérifiable sur la page officielle de suivi QRBags"
        : "Service QRBags injoignable pour le moment — réessayez plus tard",
    };

    // 3) Historique
    try {
      await db.qrLookup.create({
        data: {
          provider: "QRBAGS",
          query: ref,
          options: null,
          result: JSON.stringify(result),
          status: reachable ? "OK" : "ERREUR",
        },
      });
    } catch (err) {
      console.error("GET /api/qr/qrbags (enregistrement QrLookup)", err);
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("GET /api/qr/qrbags", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
