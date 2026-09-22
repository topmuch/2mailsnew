import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { DailyReport } from "@/lib/types";

/**
 * GET /api/reports/daily?date=AAAA-MM-JJ
 * Rapport du jour : factures de vente du jour, versements encaissés
 * et répartition par mode.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const dateParam = sp.get("date")?.trim() ?? "";
    const now = new Date();
    const date = iso.test(dateParam)
      ? dateParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
          now.getDate()
        ).padStart(2, "0")}`;

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const [invoices, proformaCount, paymentsRaw] = await Promise.all([
      db.invoice.findMany({
        where: { type: "VENTE", date: { gte: dayStart, lte: dayEnd } },
        include: { items: true },
        orderBy: { date: "asc" },
      }),
      db.invoice.count({ where: { type: "PROFORMA", date: { gte: dayStart, lte: dayEnd } } }),
      db.payment.findMany({
        where: { paidAt: { gte: dayStart, lte: dayEnd } },
        include: { invoice: { select: { number: true, clientName: true } } },
        orderBy: { paidAt: "asc" },
      }),
    ]);

    let totalHT = 0;
    let totalTTC = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    for (const f of invoices) {
      totalHT += f.totalHT;
      totalTTC += f.totalTTC;
      if (f.paymentStatus === "PAYE") paidCount += 1;
      else if (f.paymentStatus === "PARTIEL") partialCount += 1;
      else unpaidCount += 1;
    }

    const receivedTotal = paymentsRaw.reduce((s, p) => s + p.amount, 0);

    // Répartition des encaissements du jour par mode
    const methodMap = new Map<string, { amount: number; count: number }>();
    for (const p of paymentsRaw) {
      const entry = methodMap.get(p.method) ?? { amount: 0, count: 0 };
      entry.amount += p.amount;
      entry.count += 1;
      methodMap.set(p.method, entry);
    }
    const byMethod = [...methodMap.entries()]
      .map(([method, v]) => ({
        method,
        label: PAYMENT_METHOD_LABELS[method] ?? method,
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    const report: DailyReport = {
      date,
      summary: {
        invoiceCount: invoices.length,
        proformaCount,
        totalHT: Math.round(totalHT),
        totalTTC: Math.round(totalTTC),
        vatTotal: Math.round(totalTTC - totalHT),
        receivedTotal: Math.round(receivedTotal),
        paidCount,
        partialCount,
        unpaidCount,
      },
      invoices: invoices.map((f) => ({
        ...f,
        date: f.date.toISOString(),
        dueDate: f.dueDate?.toISOString() ?? null,
        createdAt: f.createdAt.toISOString(),
        items: f.items.map((it) => ({ ...it })),
      })),
      payments: paymentsRaw.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        note: p.note,
        invoiceNumber: p.invoice?.number ?? "—",
        clientName: p.invoice?.clientName ?? "Client comptoir",
      })),
      byMethod,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("GET /api/reports/daily", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
