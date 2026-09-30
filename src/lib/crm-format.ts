import type { CrmPieSlice, CrmPlatformStat } from "@/lib/types";

// ─── CRM Unifié — formateurs pour le dashboard (adapté de lib/api.ts du prompt) ──
// 3 plateformes : QRTAGS (or), QRBAGS (bleu), VERIFSCAN (sarcelle/teal).

/** Formate un montant en FCFA avec séparateurs (ex. 12 500 FCFA). */
export function formatFcfa(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0 FCFA";
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;
}

/** Formate un grand nombre (séparateurs d'espaces). */
export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR").format(Number(value ?? 0));
}

/** Date longue du jour en français (ex. « mardi 22 septembre 2026 »). */
export function formatTodayLong(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/**
 * Tonalité d'une carte selon la plateforme dominante (valeurs dans l'ordre :
 * QRTAGS, QRBAGS, VERIFSCAN — compatibilité : 2 arguments = ancien comportement) :
 * - « qrts » → or/jaune (QRTags dominant)
 * - « qrbg » → bleu (QRBags dominant)
 * - « global » → vert (équilibre, VerifScan dominant ou global)
 */
export type StatTone = "qrts" | "qrbg" | "global";

export function dominantTone(...values: number[]): StatTone {
  const a = values[0] ?? 0;
  const b = values[1] ?? 0;
  const c = values[2] ?? 0;
  const max = Math.max(a, b, c);
  if (max <= 0) return "global";
  if (max === a && a > b) return "qrts";
  if (max === b && b > a) return "qrbg";
  return "global";
}

/** Sous-valeur lisible « QRTags : 12 | QRBags : 8 | VerifScan : 3 » à partir des stats par plateforme. */
export function platformSubValue(
  platformStats: CrmPlatformStat[] | undefined,
  pick: (s: CrmPlatformStat) => number
): string {
  const list = platformStats ?? [];
  const part = (name: string) => {
    const s = list.find((x) => x.name === name);
    return s ? pick(s) : 0;
  };
  return `QRTags : ${formatNumber(part("QRTAGS"))} | QRBags : ${formatNumber(part("QRBAGS"))} | VerifScan : ${formatNumber(part("VERIFSCAN"))}`;
}

/** Somme d'un indicateur sur les deux plateformes. */
export function sumPlatforms(platformStats: CrmPlatformStat[] | undefined, pick: (s: CrmPlatformStat) => number): number {
  return (platformStats ?? []).reduce((acc, s) => acc + (pick(s) || 0), 0);
}

/** Transforme les données camembert en couleurs cohérentes (ambre = QRTAGS, bleu = QRBAGS, sarcelle = VERIFSCAN). */
export const PIE_COLORS: Record<string, string> = {
  QRTAGS: "var(--color-gold, #f59e0b)",
  QRBAGS: "#3b82f6", // bleu — distinctif QRBags (demandé par l'utilisateur)
  VERIFSCAN: "#0d9488", // sarcelle — distinctif VerifScan (verifscan.com)
};

export function pieColor(name: string): string {
  return PIE_COLORS[name] ?? "#0aa2c4";
}

/** Total du camembert (0 si vide). */
export function pieTotal(slices: CrmPieSlice[] | undefined): number {
  return (slices ?? []).reduce((acc, s) => acc + (s.value || 0), 0);
}
