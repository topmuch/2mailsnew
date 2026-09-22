// ─────────────────────────────────────────────────────────────────────────────
// ETS LAMP FALL — seed de premier démarrage (conteneur Docker / Coolify)
// Crée : les paramètres société par défaut + le compte administrateur.
// Idempotent : exécutable à chaque démarrage sans effet de bord.
// Exécuté par scripts/docker-entrypoint.sh avec Node.js (aucune dépendance TS).
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

async function main() {
  // Paramètres société par défaut (les valeurs du schéma s'appliquent)
  await prisma.setting.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
  console.log("• Paramètres société présents");

  // Compte administrateur par défaut
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    const password = process.env.ADMIN_PASSWORD || "admin123";
    await prisma.user.create({
      data: {
        username: "admin",
        name: "Administrateur",
        password: hashPassword(password),
        role: "ADMIN",
        actif: true,
      },
    });
    console.log(
      process.env.ADMIN_PASSWORD
        ? "✔ Compte admin créé : admin / (mot de passe défini via ADMIN_PASSWORD)"
        : "✔ Compte admin créé : admin / admin123 — à changer après la première connexion"
    );
  } else {
    console.log("• Compte admin déjà présent");
  }
}

main()
  .catch((e) => {
    console.error("✘ Initialisation échouée :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
