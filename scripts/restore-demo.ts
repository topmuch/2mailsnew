/**
 * Restauration après réinitialisation du sandbox / base vide.
 * ─────────────────────────────────────────────────────────────────────────────
 * Recrée le compte admin et le jeu de données de démonstration vu dans l'app
 * (client Hôtel Terrou-Bi, 3 factures de vente, 1 tâche de relance, plateformes
 * CRM QRTAGS/QRBAGS, note de blog + favori de démo).
 *
 * Idempotent : relancer ne duplique rien.
 * Usage : bun run scripts/restore-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
};

const JOUR = 24 * 60 * 60 * 1000;
/** Date à minuit (locale), décalée de N jours — évite les retards « à 0 j » liés à l'heure. */
const shiftDays = (days: number) => {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(midnight.getTime() + days * JOUR);
};

async function main() {
  // ── 1. Utilisateur administrateur ──────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrateur",
      username: "admin",
      password: hashPassword("admin123"),
      role: "ADMIN",
      actif: true,
    },
  });
  console.log(`✓ Utilisateur admin prêt (admin / admin123) — ${admin.id}`);

  // ── 2. Client de démonstration ────────────────────────────────────────────
  let client = await db.client.findFirst({ where: { name: "Hôtel Terrou-Bi" } });
  if (!client) {
    client = await db.client.create({
      data: {
        name: "Hôtel Terrou-Bi",
        phone: "+221 33 839 60 00",
        email: "contact@terrou-bi.com",
        address: "Route de la Corniche Ouest, Dakar",
        type: "ENTREPRISE",
      },
    });
    console.log("✓ Client « Hôtel Terrou-Bi » créé");
  }

  // ── 3. Factures de vente (HT propres × 1,18 = TTC) ────────────────────────
  const factures = [
    {
      number: "FV-2026-0001",
      totalHT: 45000,
      totalTTC: 53100,
      date: shiftDays(-1),
      dueDate: shiftDays(6),
      produit: "Pack 50 bracelets QR Tags",
    },
    {
      number: "FV-2026-0002",
      totalHT: 50000,
      totalTTC: 59000,
      date: shiftDays(-1),
      dueDate: shiftDays(-21), // échue → notification + priorité dashboard
      produit: "Pack 100 bracelets QRTags",
    },
    {
      number: "FV-2026-0003",
      totalHT: 40000,
      totalTTC: 47200,
      date: shiftDays(-1),
      dueDate: shiftDays(6),
      produit: "Pack QR Bags bagages",
    },
  ];
  for (const f of factures) {
    const exists = await db.invoice.findUnique({ where: { number: f.number } });
    if (exists) {
      console.log(`• Facture ${f.number} déjà présente`);
      continue;
    }
    const invoice = await db.invoice.create({
      data: {
        number: f.number,
        type: "VENTE",
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientAddress: client.address,
        date: f.date,
        dueDate: f.dueDate,
        deliveryStatus: "NON_LIVRE",
        paymentStatus: "NON_PAYE",
        amountPaid: 0,
        taxRate: 18,
        totalHT: f.totalHT,
        totalTTC: f.totalTTC,
      },
    });
    await db.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        productName: f.produit,
        unit: "pack",
        quantity: 1,
        unitPrice: f.totalHT,
        total: f.totalHT,
      },
    });
    console.log(`✓ Facture ${f.number} créée (${f.totalTTC} FCFA TTC)`);
  }

  // ── 4. Tâche CRM de relance (en retard) ───────────────────────────────────
  const taskTitle = "Relance facture FV-2026-0002";
  const task = await db.crmTask.findFirst({ where: { title: taskTitle } });
  if (!task) {
    await db.crmTask.create({
      data: {
        title: taskTitle,
        description: "Appeler l'Hôtel Terrou-Bi pour encaisser le solde de la facture échue.",
        dueDate: shiftDays(-1),
        status: "TODO",
        priority: "HIGH",
      },
    });
    console.log("✓ Tâche « Relance facture FV-2026-0002 » créée (HIGH, en retard)");
  }

  // ── 5. Plateformes CRM QRTAGS / QRBAGS ────────────────────────────────────
  for (const p of [
    { name: "QRTAGS", label: "qrtags.pro", price: 15000 },
    { name: "QRBAGS", label: "qrbags.com", price: 25000 },
  ]) {
    await db.crmPlatform.upsert({
      where: { name: p.name },
      update: {},
      create: { name: p.name, label: p.label, estimatedPackPrice: p.price },
    });
  }
  console.log("✓ Plateformes QRTAGS (15 000 FCFA/pack) et QRBAGS (25 000 FCFA/pack) prêtes");

  // ── 6. Blog note + favori de démonstration ────────────────────────────────
  const noteTitle = "Astuce WhatsApp relance";
  const note = await db.blogPost.findFirst({ where: { title: noteTitle } });
  if (!note) {
    await db.blogPost.create({
      data: {
        title: noteTitle,
        content:
          "Script de relance WhatsApp qui fonctionne : « Bonjour [Client], j'espère que vous allez bien ! " +
          "Petit rappel gentil : la facture [N°] arrive à échéance. Si besoin, je peux vous envoyer à nouveau le détail. " +
          "Bonne journée ! » — court, poli, avec le numéro de facture : 3 relances sur 4 obtiennent une réponse le jour même.",
      tags: "commercial,astuce",
        color: "amber",
        pinned: true,
        author: "Administrateur",
      },
    });
    console.log("✓ Blog note « Astuce WhatsApp relance » créée");
  }

  const favUrl = "https://wa.me/221771234567";
  const fav = await db.favorite.findFirst({ where: { url: favUrl } });
  if (!fav) {
    await db.favorite.create({
      data: {
        title: "WhatsApp Business — grossiste",
        url: favUrl,
        description: "Contact grossiste pour les commandes de bracelets et bagages QR.",
        category: "FOURNISSEUR",
        author: "Administrateur",
      },
    });
    console.log("✓ Favori « WhatsApp Business — grossiste » créé");
  }

  // ── 7. Messages du Coach Virtuel (30 messages, auto-seed idempotent) ──────
  const { COACH_SEED_MESSAGES } = await import("../src/lib/crm-coach-seed");
  if ((await db.crmCoachMessage.count()) === 0) {
    await db.crmCoachMessage.createMany({ data: COACH_SEED_MESSAGES });
  }
  console.log("✓ Messages du Coach Virtuel en place");

  // ── 8. Leads de démonstration (pipeline commercial) ───────────────────────
  for (const l of [
    { name: "Ibrahima Fall", company: "Hôtel Terrou-Bi", status: "NEW", value: 150000 },
    { name: "Awa Ndiaye", company: "Radisson Blu", status: "NEW", value: 250000 },
    { name: "Omar Sy", company: "Palais Dakar", status: "CONTACTED", value: 180000 },
    { name: "Fatou Ba", company: "King Fahd Palace", status: "CONTACTED", value: 90000 },
    { name: "Moussa Diop", company: "AGV Voyages", status: "QUALIFIED", value: 320000 },
    { name: "Aminata Sow", company: "Sénégal Airlines", status: "PROPOSAL", value: 500000 },
    { name: "Cheikh Mbaye", company: "Coralie Chaussures", status: "WON", value: 75000 },
    { name: "Ndeye Diagne", company: "Lamantin Beach", status: "LOST", value: 210000 },
  ]) {
    const existing = await db.crmLead.findFirst({ where: { name: l.name, company: l.company } });
    if (!existing) {
      await db.crmLead.create({ data: { ...l, source: "QRTAGS" } });
    }
  }
  console.log("✓ Leads de démonstration (8 prospects répartis dans le pipeline) prêts");

  console.log("\n🎉 Restauration terminée — connectez-vous avec admin / admin123");
}

main()
  .catch((e) => {
    console.error("✗ Erreur de restauration :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
