import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, actif: true } });
console.log(JSON.stringify(users, null, 1));
await prisma.$disconnect();
