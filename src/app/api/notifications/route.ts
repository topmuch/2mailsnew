import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { formatMoney } from "@/lib/constants";
import type { AppNotification } from "@/lib/types";

// ─── Centre de notifications : alertes calculées en temps réel ──────────────
// Factures VENTE impayées/partielles en retard, RDV du jour, tâches CRM en
// retard, stock bas, relances automatiques créées aujourd'hui.
// Calcul à la volée (aucune table supplémentaire) — toujours à jour.

export const dynamic = "force-dynamic";

const JOUR_MS = 24 * 60 * 60 * 1000;

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const now = new Date();
    const today = startOfToday(now);
    const notifications: AppNotification[] = [];

    // ─── 1. Factures VENTE impayées / partielles en retard ──────────────────
    const overdueInvoices = await db.invoice.findMany({
      where: {
        type: "VENTE",
        paymentStatus: { in: ["NON_PAYE", "PARTIEL"] },
        dueDate: { lt: today },
      },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    for (const inv of overdueInvoices) {
      const days = Math.floor((today.getTime() - new Date(inv.dueDate as Date).getTime()) / JOUR_MS);
      notifications.push({
        id: `inv-${inv.id}`,
        type: "INVOICE_OVERDUE",
        title: `Facture ${inv.number} en retard de ${days} j`,
        description: `${inv.client?.name ?? inv.clientName} — reste ${formatMoney(inv.totalTTC - inv.amountPaid)}`,
        severity: days >= 15 ? "high" : "medium",
        view: "factures",
        date: new Date(inv.dueDate as Date).toISOString(),
      });
    }

    // ─── 2. RDV du jour (calendrier) ─────────────────────────────────────────
    const todayEvents = await db.calendarEvent.findMany({
      where: {
        date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)),
        done: false,
      },
      orderBy: { startTime: "asc" },
      take: 5,
    });
    for (const ev of todayEvents) {
      notifications.push({
        id: `evt-${ev.id}`,
        type: "RDV_TODAY",
        title: ev.startTime ? `RDV aujourd'hui à ${ev.startTime}` : "Événement aujourd'hui",
        description: ev.title,
        severity: ev.type === "RDV" ? "medium" : "low",
        view: "calendrier",
        date: ev.date.toISOString(),
      });
    }

    // ─── 3. Tâches CRM en retard ─────────────────────────────────────────────
    const overdueTasks = await db.crmTask.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: today },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    for (const t of overdueTasks) {
      const days = Math.floor((today.getTime() - new Date(t.dueDate as Date).getTime()) / JOUR_MS);
      notifications.push({
        id: `task-${t.id}`,
        type: "TASK_OVERDUE",
        title: `Tâche en retard de ${days} j`,
        description: t.title,
        severity: t.priority === "HIGH" ? "high" : "medium",
        view: "crm-tasks",
        date: new Date(t.dueDate as Date).toISOString(),
      });
    }

    // ─── 4. Relances automatiques créées aujourd'hui ─────────────────────────
    const followupsToday = await db.crmTask.findMany({
      where: {
        title: { startsWith: "Relance facture" },
        createdAt: { gte: today },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    for (const t of followupsToday) {
      notifications.push({
        id: `fu-${t.id}`,
        type: "FOLLOWUP_CREATED",
        title: "Relance automatique créée",
        description: t.title,
        severity: "low",
        view: "crm-tasks",
        date: t.createdAt.toISOString(),
      });
    }

    // ─── 5. Stock bas ────────────────────────────────────────────────────────
    const lowStock = await db.product.findMany({
      where: { stock: { lte: 3 } },
      orderBy: { stock: "asc" },
      take: 3,
    });
    for (const p of lowStock) {
      notifications.push({
        id: `stock-${p.id}`,
        type: "STOCK_LOW",
        title: `Stock faible : ${p.name}`,
        description: `${p.stock} ${p.unit}${p.stock > 1 ? "s" : ""} restant${p.stock > 1 ? "s" : ""}`,
        severity: p.stock <= 1 ? "high" : "low",
        view: "produits",
      });
    }

    // Tri : gravité puis date
    const severityOrder = { high: 0, medium: 1, low: 2 } as const;
    notifications.sort((a, b) => {
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return (b.date ?? "").localeCompare(a.date ?? "");
    });

    return NextResponse.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error("GET /api/notifications", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
