import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const s = await prisma.setting.findFirst();
await prisma.setting.update({ where: { id: s.id }, data: { nomSociete: "2MAILS", mailFromName: "2MAILS", email: "contact@2mails.sn" } });
console.log("Setting mis à jour : 2MAILS / contact@2mails.sn");
await prisma.$disconnect();
