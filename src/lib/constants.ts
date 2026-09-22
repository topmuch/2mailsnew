// ─── Catégories de produits ETS LAMP FALL ───────────────────────────────────

export const PRODUCT_CATEGORIES = [
  "SANITAIRE",
  "PLOMBERIE",
  "LUMINAIRE",
  "ELECTRICITE",
  "GOUTTE_A_GOUTTE",
  "TUYAUTERIE",
  "MIROITERIE",
  "ROBINETTERIE",
  "POMPE",
  "CHASSE_DOUCHE",
  "RESERVOIR_EAU",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  SANITAIRE: "Sanitaire",
  PLOMBERIE: "Plomberie",
  LUMINAIRE: "Luminaire",
  ELECTRICITE: "Électricité",
  GOUTTE_A_GOUTTE: "Goutte à goutte",
  TUYAUTERIE: "Tuyauterie",
  MIROITERIE: "Miroiterie",
  ROBINETTERIE: "Robinetterie",
  POMPE: "Pompe",
  CHASSE_DOUCHE: "Chasse de douche",
  RESERVOIR_EAU: "Réservoir d'eau",
};

// ─── Statuts ────────────────────────────────────────────────────────────────

export const INVOICE_TYPES = ["VENTE", "PROFORMA"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const DELIVERY_STATUSES = ["LIVRE", "NON_LIVRE"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const PAYMENT_STATUSES = ["PAYE", "PARTIEL", "NON_PAYE"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = ["EN_COURS", "CONFIRMEE", "LIVREE", "ANNULEE"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  EN_COURS: "En cours",
  CONFIRMEE: "Confirmée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

export const DELIVERY_LABELS: Record<string, string> = {
  LIVRE: "Livré",
  NON_LIVRE: "Non livré",
};

export const PAYMENT_LABELS: Record<string, string> = {
  PAYE: "Payé",
  PARTIEL: "Partiel",
  NON_PAYE: "Non payé",
};

export const CLIENT_TYPES = ["PARTICULIER", "ENTREPRISE"] as const;

// ─── Versements (méthodes de paiement) ──────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ESPECES: "Espèces",
  WAVE: "Wave",
  ORANGE_MONEY: "Orange Money",
  FREE_MONEY: "Free Money",
  VIREMENT: "Virement bancaire",
  CHEQUE: "Chèque",
};

// ─── Mouvements de stock ────────────────────────────────────────────────────

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  AJUSTEMENT: "Ajustement",
};

// ─── Journal d'audit ────────────────────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Invoice: "Facture",
  Client: "Client",
  Product: "Produit",
  Purchase: "Achat",
  Supplier: "Fournisseur",
  Payment: "Versement",
  User: "Utilisateur",
  Settings: "Paramètres",
  Stock: "Stock",
};

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2026-07 » → « juillet 2026 » */
export function monthLabel(month: string | null | undefined): string {
  if (!month) return "—";
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES[idx]} ${m[1]}`;
}

/** Mois courant au format AAAA-MM */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Infos société ──────────────────────────────────────────────────────────

export const COMPANY = {
  name: "ETS LAMP FALL",
  tagline: "Plomberie - Sanitaire - Luminaire",
  address: "Dakar, Sénégal",
  phone: "+221 77 000 00 00",
  email: "contact@etslampfall.sn",
  ninea: "NINEA : 00000000 0000",
};

export const CURRENCY = "FCFA";

// ─── Formatters ─────────────────────────────────────────────────────────────

export function formatMoney(value: number | null | undefined): string {
  const n = value ?? 0;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)} ${CURRENCY}`;
}

/** Format compact pour les indicateurs : 2,49 M FCFA · 829 k FCFA */
export function formatMoneyCompact(value: number | null | undefined): string {
  const n = value ?? 0;
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M ${CURRENCY}`;
  }
  if (Math.abs(n) >= 100_000) {
    return `${Math.round(n / 1000).toLocaleString("fr-FR")} k ${CURRENCY}`;
  }
  return formatMoney(n);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function toISODate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ─── Numérotation ───────────────────────────────────────────────────────────

export function nextNumber(prefix: string, count: number, year: number): string {
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

export const NUMBER_PREFIXES = {
  VENTE: "FV",
  PROFORMA: "PF",
  ACHAT: "FA",
  COMMANDE: "CMD",
} as const;
