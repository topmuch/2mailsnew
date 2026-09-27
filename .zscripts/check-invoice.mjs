import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const inv = await db.invoice.findFirst({
  where: { number: "FV-2026-0004" },
  include: { items: true, payments: true },
});
console.log(JSON.stringify({
  number: inv.number, type: inv.type, clientName: inv.clientName,
  paymentStatus: inv.paymentStatus, amountPaid: inv.amountPaid,
  totalHT: inv.totalHT, totalTTC: inv.totalTTC, taxRate: inv.taxRate,
  notes: inv.notes,
  items: inv.items.map(i => ({ name: i.productName, qty: i.quantity, price: i.unitPrice, total: i.total })),
  payments: inv.payments.map(p => ({ amount: p.amount, method: p.method, note: p.note })),
}, null, 1));
await db.$disconnect();
