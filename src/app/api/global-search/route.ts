import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { formatMoney } from "@/lib/constants";

// ─── Recherche globale : clients, factures, produits, tâches, RDV, leads ────
// GET /api/global-search?q=terme → résultats groupés par type, chaque résultat
// porte la vue à ouvrir (navigation du shell).

export const dynamic = "force-dynamic";

export interface GlobalSearchItem {
  id: string;
  type: "CLIENT" | "INVOICE" | "PRODUCT" | "TASK" | "EVENT" | "LEAD" | "MAIL";
  title: string;
  sub?: string;
  view: string;
}

const TYPE_LABELS: Record<GlobalSearchItem["type"], string> = {
  CLIENT: "Clients",
  INVOICE: "Factures",
  PRODUCT: "Produits",
  TASK: "Tâches CRM",
  EVENT: "Calendrier",
  LEAD: "Leads",
  MAIL: "E-mails",
};

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ groups: [] });
    }
    const like = { contains: q };

    const [clients, invoices, products, tasks, events, leads, mails] = await Promise.all([
      db.client.findMany({
        where: { OR: [{ name: like }, { phone: like }, { email: like }] },
        take: 5,
        orderBy: { name: "asc" },
      }),
      db.invoice.findMany({
        where: { OR: [{ number: like }, { clientName: like }] },
        take: 5,
        orderBy: { date: "desc" },
      }),
      db.product.findMany({
        where: { OR: [{ name: like }, { reference: like }] },
        take: 5,
        orderBy: { name: "asc" },
      }),
      db.crmTask.findMany({
        where: { title: like },
        take: 4,
        orderBy: { createdAt: "desc" },
      }),
      db.calendarEvent.findMany({
        where: { title: like },
        take: 4,
        orderBy: { date: "desc" },
      }),
      db.crmLead.findMany({
        where: { OR: [{ name: like }, { company: like }, { phone: like }] },
        take: 4,
        orderBy: { createdAt: "desc" },
      }),
      db.mail.findMany({
        where: { OR: [{ subject: like }, { from: like }] },
        take: 3,
        orderBy: { sentAt: "desc" },
      }),
    ]);

    const items: GlobalSearchItem[] = [
      ...clients.map((c) => ({
        id: c.id,
        type: "CLIENT" as const,
        title: c.name,
        sub: [c.telephone, c.email].filter(Boolean).join(" · ") || undefined,
        view: "clients",
      })),
      ...invoices.map((i) => ({
        id: i.id,
        type: "INVOICE" as const,
        title: `${i.number}${i.type === "PROFORMA" ? " (proforma)" : ""}`,
        sub: `${i.clientName} — ${formatMoney(i.totalTTC)}`,
        view: i.type === "PROFORMA" ? "proforma" : "factures",
      })),
      ...products.map((p) => ({
        id: p.id,
        type: "PRODUCT" as const,
        title: p.name,
        sub: `Stock : ${p.stock} ${p.unit}${p.stock > 1 ? "s" : ""} — ${formatMoney(p.salePrice)}`,
        view: "produits",
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: "TASK" as const,
        title: t.title,
        sub: t.status === "DONE" ? "Terminée" : t.dueDate ? `Échéance : ${new Date(t.dueDate).toLocaleDateString("fr-FR")}` : undefined,
        view: "crm-tasks",
      })),
      ...events.map((e) => ({
        id: e.id,
        type: "EVENT" as const,
        title: e.title,
        sub: `${new Date(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}${e.startTime ? ` · ${e.startTime}` : ""}`,
        view: "calendrier",
      })),
      ...leads.map((l) => ({
        id: l.id,
        type: "LEAD" as const,
        title: l.name,
        sub: [l.company, l.phone].filter(Boolean).join(" · ") || undefined,
        view: "crm-leads",
      })),
      ...mails.map((m) => ({
        id: m.id,
        type: "MAIL" as const,
        title: m.subject || "(sans objet)",
        sub: m.direction === "IN" ? m.from : m.to,
        view: "mails",
      })),
    ];

    // Regroupe en conservant un ordre logique
    const order: GlobalSearchItem["type"][] = ["CLIENT", "INVOICE", "LEAD", "TASK", "EVENT", "PRODUCT", "MAIL"];
    const groups = order
      .map((type) => ({
        type,
        label: TYPE_LABELS[type],
        items: items.filter((i) => i.type === type),
      }))
      .filter((g) => g.items.length > 0);

    return NextResponse.json({ groups, total: items.length });
  } catch (error) {
    console.error("GET /api/global-search", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
