import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Seed incrémental (v2) :
//  1. Catégories en base (gestion dynamique) — 11 catégories d'origine

const CATEGORIES: { code: string; label: string }[] = [
  { code: "SANITAIRE", label: "Sanitaire" },
  { code: "PLOMBERIE", label: "Plomberie" },
  { code: "LUMINAIRE", label: "Luminaire" },
  { code: "ELECTRICITE", label: "Électricité" },
  { code: "GOUTTE_A_GOUTTE", label: "Goutte à goutte" },
  { code: "TUYAUTERIE", label: "Tuyauterie" },
  { code: "MIROITERIE", label: "Miroiterie" },
  { code: "ROBINETTERIE", label: "Robinetterie" },
  { code: "POMPE", label: "Pompe" },
  { code: "CHASSE_DOUCHE", label: "Chasse de douche" },
  { code: "RESERVOIR_EAU", label: "Réservoir d'eau" },
];

async function main() {
  // ─── 1. Catégories ────────────────────────────────────────────────────────
  console.log("Catégories…");
  for (const cat of CATEGORIES) {
    await db.category.upsert({
      where: { code: cat.code },
      update: { label: cat.label },
      create: cat,
    });
  }
  console.log(`  ${CATEGORIES.length} catégories prêtes.`);

  console.log("Seed v2 terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
