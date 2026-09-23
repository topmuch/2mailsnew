import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Widget « Prochaine action » : 3 priorités calculées automatiquement ────
// Facture impayée en retard : 100 + 10/jour de retard
// RDV dans moins de 2 h      : 80
// Tâche en retard            : 70 + 5/jour de retard
// Client sans contact > 30 j : 50 (dernier contact = dernière facture)

export const dynamic = "force-dynamic";

interface NextAction {
  id: string;
  type: "INVOICE" | "EVENT" | "TASK" | "CLIENT";
  title: string;
  description: string;
  priority: number;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  action: string;
  context: string;
  targetView: string; // vue à ouvrir au clic (dashboard onNavigate)
}

function urgencyFor(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 100) return "HIGH";
  if (score >= 70) return "MEDIUM";
  return "LOW";
}

export async function GET(request: NextRequest) {
  try {
    await getAuthUser(request);
    const now = new Date();
    const actions: NextAction[] = [];

    // ─── 1. Factures VENTE impayées / partielles en retard ──────────────────
    const unpaid = await db.invoice.findMany({
      where: {
        type: "VENTE",
        paymentStatus: { in: ["NON_PAYE", "PARTIEL"] },
        dueDate: { not: null, lt: now },
      },
      include: { client: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
    for (const inv of unpaid) {
      const due = inv.dueDate ? new Date(inv.dueDate) : now;
      const daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
      const remaining = Math.max(0, Math.round(inv.totalTTC - inv.amountPaid));
      const score = 100 + daysOverdue * 10;
      actions.push({
        id: `INV-${inv.id}`,
        type: "INVOICE",
        title: `Facture ${inv.number} impayée`,
        description: `${inv.client?.name ?? (inv.clientName || "Client")} — ${remaining.toLocaleString("fr-FR")} FCFA en retard de ${daysOverdue} j`,
        priority: score,
        urgency: urgencyFor(score),
        action: "Relancer le paiement",
        context: `${inv.client?.name ?? (inv.clientName || "Client")} — ${inv.number}`,
        targetView: "factures",
      });
    }

    // ─── 2. Rendez-vous dans moins de 2 h (non terminés) ────────────────────
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 2);
    const events = await db.calendarEvent.findMany({
      where: { done: false, date: { gte: dayStart, lt: dayEnd } },
      orderBy: { date: "asc" },
      take: 20,
    });
    for (const ev of events) {
      const startH = ev.startTime ? ev.startTime.split(":") : null;
      const evDate = new Date(ev.date);
      if (startH) {
        evDate.setHours(Number(startH[0]) || 0, Number(startH[1]) || 0, 0, 0);
      }
      const hoursUntilH = (evDate.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntilH < 0 || hoursUntilH > 2) continue;
      actions.push({
        id: `EVT-${ev.id}`,
        type: "EVENT",
        title: ev.title,
        description: `RDV ${ev.startTime ?? ""} — dans ${Math.max(0, Math.round(hoursUntilH * 60))} min`,
        priority: 80,
        urgency: "HIGH",
        action: "Préparer",
        context: ev.title,
        targetView: "calendrier",
      });
    }

    // ─── 3. Tâches CRM en retard ────────────────────────────────────────────
    const tasks = await db.crmTask.findMany({
      where: { status: { not: "DONE" }, dueDate: { not: null, lt: now } },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
    for (const t of tasks) {
      const due = t.dueDate ? new Date(t.dueDate) : now;
      const daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
      const score = 70 + daysOverdue * 5;
      actions.push({
        id: `TSK-${t.id}`,
        type: "TASK",
        title: t.title,
        description: `Tâche en retard de ${daysOverdue} j — priorité ${t.priority.toLowerCase()}`,
        priority: score,
        urgency: urgencyFor(score),
        action: "Terminer",
        context: t.title,
        targetView: "crm-tasks",
      });
    }

    // ─── 4. Clients sans contact depuis plus de 30 jours ────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const clients = await db.client.findMany({
      select: { id: true, name: true, phone: true, createdAt: true },
      take: 500,
    });
    const lastInvoiceByClient = await db.invoice.groupBy({
      by: ["clientId"],
      where: { type: "VENTE", clientId: { not: null } },
      _max: { date: true },
    });
    const lastContact = new Map<string, Date>();
    for (const g of lastInvoiceByClient) {
      if (g.clientId && g._max.date) lastContact.set(g.clientId, new Date(g._max.date));
    }
    for (const c of clients) {
      const last = lastContact.get(c.id);
      const stale = last ? last < thirtyDaysAgo : false;
      if (!last) {
        // Client créé depuis plus de 30 jours mais jamais facturé → à relancer
        if (new Date(c.createdAt) >= thirtyDaysAgo) continue;
      } else if (!stale) {
        continue;
      }
      actions.push({
        id: `CLI-${c.id}`,
        type: "CLIENT",
        title: `Recontacter ${c.name}`,
        description: last
          ? `Dernière facture le ${last.toLocaleDateString("fr-FR")} (> 30 j)`
          : "Aucune facture enregistrée — prospect à relancer",
        priority: 50,
        urgency: "LOW",
        action: "Recontacter",
        context: c.name,
        targetView: "clients",
      });
    }

    actions.sort((a, b) => b.priority - a.priority);
    return NextResponse.json({ actions: actions.slice(0, 3), total: actions.length });
  } catch (err) {
    if (err instanceof Error && err.message.includes("auth")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    console.error("[next-actions]", err);
    return NextResponse.json({ error: "Erreur de calcul des priorités" }, { status: 500 });
  }
}
