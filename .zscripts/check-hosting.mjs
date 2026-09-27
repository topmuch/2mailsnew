import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.hostingDomain.findMany({
  orderBy: { createdAt: "desc" },
  take: 5,
  select: { domain: true, status: true, clientName: true, domainPrice: true, hostingPrice: true, price: true, hasHosting: true, renewalToken: true, purchasedAt: true, renewalDate: true, createdAt: true },
});
for (const r of rows) console.log(JSON.stringify({ ...r, createdAt: r.createdAt.toISOString().slice(0, 16) }));
await db.$disconnect();
