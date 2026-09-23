import { db } from "@/lib/db";

// ─── Valeurs par défaut « productivité » (seed automatique) ─────────────────
// Créées à la première utilisation (aucune étape manuelle de seed nécessaire,
// y compris sur Coolify). Idempotent : ne duplique jamais.

let templatesSeeded = false;
let packsSeeded = false;

const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    name: "Relance facture",
    category: "RELANCE",
    content:
      "Bonjour {{clientName}},\n\n" +
      "Je me permets de vous relancer concernant la facture {{invoiceNumber}} d'un montant de {{amount}} FCFA, " +
      "qui arrive à échéance le {{dueDate}}.\n\n" +
      "N'hésitez pas à me contacter si vous avez des questions.\n\n" +
      "Cordialement,\n2MAILS",
  },
  {
    name: "Proposition commerciale",
    category: "PROPOSITION",
    content:
      "Bonjour {{clientName}},\n\n" +
      "J'espère que vous allez bien !\n\n" +
      "Nous avons actuellement une offre spéciale sur nos produits :\n" +
      "- Pack 50 : prix sur devis\n" +
      "- Pack 100 : prix sur devis\n" +
      "- Pack 500 : prix sur devis\n\n" +
      "Seriez-vous intéressé pour équiper votre établissement ?\n\n" +
      "Cordialement,\n2MAILS",
  },
  {
    name: "Support technique",
    category: "SUPPORT",
    content:
      "Bonjour {{clientName}},\n\n" +
      "Pour activer votre produit, voici la procédure :\n" +
      "1. Scannez le QR code avec votre téléphone\n" +
      "2. Remplissez vos coordonnées\n" +
      "3. Validez\n\n" +
      "En cas de problème, n'hésitez pas à me contacter.\n\n" +
      "Cordialement,\n2MAILS",
  },
];

const DEFAULT_PRODUCT_PACKS = [
  { name: "Pack 50 QRTags Standard", price: 45000, quantity: 50, type: "QRTAGS" },
  { name: "Pack 100 QRTags Standard", price: 85000, quantity: 100, type: "QRTAGS" },
  { name: "Pack 500 QRTags Standard", price: 400000, quantity: 500, type: "QRTAGS" },
  { name: "Pack 50 QRBags", price: 40000, quantity: 50, type: "QRBAGS" },
  { name: "Pack 100 QRBags", price: 75000, quantity: 100, type: "QRBAGS" },
  { name: "Abonnement CRM Mensuel", price: 15000, quantity: 1, type: "SUBSCRIPTION" },
];

export async function ensureWhatsAppTemplates() {
  if (templatesSeeded) return;
  const count = await db.whatsAppTemplate.count();
  if (count === 0) {
    await db.whatsAppTemplate.createMany({ data: DEFAULT_WHATSAPP_TEMPLATES });
  }
  templatesSeeded = true;
}

export async function ensureProductPacks() {
  if (packsSeeded) return;
  const count = await db.productPack.count();
  if (count === 0) {
    await db.productPack.createMany({ data: DEFAULT_PRODUCT_PACKS });
  }
  packsSeeded = true;
}

/** Remplace les variables {{...}} d'un modèle par les valeurs du contexte. */
export function renderTemplate(
  content: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
