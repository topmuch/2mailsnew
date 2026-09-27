import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const groups = await db.crmCoachMessage.groupBy({ by: ["timeSlot"], _count: true });
console.log(groups.map(g => `${g.timeSlot}: ${g._count}`).join("\n"));
await db.$disconnect();
