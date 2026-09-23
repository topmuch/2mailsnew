import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const s = await prisma.setting.findFirst({ select: { nomSociete: true, tagline: true, email: true, mailFromName: true, logo: true } });
console.log({ nomSociete: s.nomSociete, tagline: s.tagline, email: s.email, mailFromName: s.mailFromName, logoLen: s.logo?.length ?? 0 });
await prisma.$disconnect();
