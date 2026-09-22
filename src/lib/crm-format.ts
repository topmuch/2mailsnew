import type { CrmPieSlice, CrmPlatformStat } from "@/lib/types";

// ─── CRM Unifié — formateurs pour le dashboard (adapté de lib/api.ts du prompt) ──

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
 * Tonalité d'une carte selon la plateforme dominante :
 * - « qrts » → or/jaune (QRTags dominant)
 * - « qrbg » → bleu (QRBags dominant)
 * - « global » → vert (équilibre ou global)
 */
export type StatTone = "qrts" | "qrbg" | "global";

export function dominantTone(a: number, b: number): StatTone {
  if (a > b) return "qrts";
  if (b > a) return "qrbg";
  return "global";
}

/** Sous-valeur lisible « QRTags : 12 | QRBags : 8 » à partir des stats par plateforme. */
export function platformSubValue(
  platformStats: CrmPlatformStat[] | undefined,
  pick: (s: CrmPlatformStat) => number
): string {
  const list = platformStats ?? [];
  const part = (name: string) => {
    const s = list.find((x) => x.name === name);
    return s ? pick(s) : 0;
  };
  return `QRTags : ${formatNumber(part("QRTAGS"))} | QRBags : ${formatNumber(part("QRBAGS"))}`;
}

/** Somme d'un indicateur sur les deux plateformes. */
export function sumPlatforms(platformStats: CrmPlatformStat[] | undefined, pick: (s: CrmPlatformStat) => number): number {
  return (platformStats ?? []).reduce((acc, s) => acc + (pick(s) || 0), 0);
}

/** Transforme les données camembert en couleurs cohérentes (or = QRTAGS, bleu = QRBAGS). */
export const PIE_COLORS: Record<string, string> = {
  QRTAGS: "var(--color-gold, #d4a017)",
  QRBAGS: "#3b82f6", // bleu — distinctif QRBags (demandé par l'utilisateur)
};

export function pieColor(name: string): string {
  return PIE_COLORS[name] ?? "#22c55e";
}

/** Total du camembert (0 si vide). */
export function pieTotal(slices: CrmPieSlice[] | undefined): number {
  return (slices ?? []).reduce((acc, s) => acc + (s.value || 0), 0);
}
