// ─── Utilitaires partagés Favoris (API + UI) ─────────────────────────────────

export const FAVORITE_CATEGORIES = [
  "GENERAL",
  "FOURNISSEUR",
  "CLIENT",
  "OUTIL",
  "CONCURRENT",
  "ADMINISTRATION",
  "AUTRE",
] as const;

export const FAVORITE_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "Général",
  FOURNISSEUR: "Fournisseur",
  CLIENT: "Client",
  OUTIL: "Outil en ligne",
  CONCURRENT: "Concurrent / veille",
  ADMINISTRATION: "Administration",
  AUTRE: "Autre",
};

// Normalise l'URL saisie : ajoute https:// si le schéma manque, valide le format
export function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// Extrait le domaine lisible d'une URL (ex. « wa.me », « qrtags.pro »)
export function urlDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

// Couleur de fallback (déterministe) pour le badge favicon d'un domaine
export function domainColor(raw: string): string {
  const colors = [
    "#1F3FBF",
    "#0F766E",
    "#B45309",
    "#B91C1C",
    "#7C3AED",
    "#0369A1",
    "#4D7C0F",
    "#BE185D",
  ];
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
