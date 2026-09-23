// Seed v3 — Paramètres société par défaut + compte administrateur
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

async function main() {
  // Paramètres société par défaut
  await prisma.setting.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      nomSociete: "2MAILS",
      tagline: "Plomberie - Sanitaire - Luminaire",
      adresse: "Dakar, Sénégal",
      telephone: "+221 77 000 00 00",
      email: "contact@2mails.sn",
      rc: "",
      ninea: "",
    },
  });

  // Compte administrateur par défaut
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    await prisma.user.create({
      data: {
        username: "admin",
        name: "Administrateur",
        password: hashPassword("admin123"),
        role: "ADMIN",
        actif: true,
      },
    });
    console.log("✔ Compte admin créé : admin / admin123");
  } else {
    console.log("• Compte admin déjà présent");
  }

  console.log("✔ Seed v3 terminé");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
