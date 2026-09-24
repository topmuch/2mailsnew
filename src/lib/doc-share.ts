import type { NextRequest } from "next/server";

// ─── Partage externe des documents (lien public téléchargeable) ──────────────
// Principe : chaque document peut recevoir un jeton aléatoire (imdevinable,
// révocable) qui sert de seule clé d'accès à des routes 100 % publiques :
//   /api/documents/shared/<token>            → page de consultation
//   /api/documents/shared/<token>/download   → fichier PDF (instantané) / Word
// Aucune authentification sur ces routes : le lien peut être envoyé à un
// client (WhatsApp, e-mail…) qui le consulte sans compte.

/** URL de base publique reconstruite depuis les en-têtes de la requête
 *  (fonctionne derrière Coolify, le gateway de prévisualisation, un reverse
 *  proxy…). Priorité à l'en-tête x-forwarded-* envoyé par le proxy, sinon
 *  l'hôte de la requête. Surcharge possible via NEXT_PUBLIC_APP_URL. */
export function publicBaseUrl(request: NextRequest): string {
  const override = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (!host) return new URL("/", request.url).origin;
  const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0].trim() || "https";
  return `${proto}://${host}`;
}

/** URL publique complète d'un document partagé (à copier dans le dialogue). */
export function sharedDocUrl(request: NextRequest, token: string): string {
  return `${publicBaseUrl(request)}/api/documents/shared/${token}`;
}

/** Version sérialisable d'un document pour les réponses JSON :
 *  les octets du PDF partagé ne sortent JAMAIS de la base, le jeton est
 *  résumé en booléen `shared` (le client n'a jamais besoin du jeton brut). */
export function serializeDoc<T extends { shareToken?: string | null; sharedPdfAt?: Date | string | null }>(
  doc: T,
) {
  const { sharedPdf, ...rest } = doc as T & { sharedPdf?: unknown };
  void sharedPdf;
  return {
    ...rest,
    sharedPdf: undefined,
    shared: !!doc.shareToken,
    sharedPdfAt: doc.sharedPdfAt ? new Date(doc.sharedPdfAt).toISOString() : null,
  };
}

/** Nom de fichier propre pour l'en-tête Content-Disposition. */
export function safeDocFilename(title: string, ext: string): string {
  const safe = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, " ") || "document";
  return `${safe}.${ext}`;
}
