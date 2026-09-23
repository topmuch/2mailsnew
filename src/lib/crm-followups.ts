import { db } from "@/lib/db";

// ─── Relances automatiques (pipeline auto-piloté) ────────────────────────────
// Chaque jour à partir de 09h00 : toute facture VENTE en retard de plus de
// 10 jours (NON_PAYE ou PARTIEL) reçoit une tâche de relance prioritaire.
// Idempotence : une seule tâche ouverte par facture (titre « Relance facture N »).

const globalForFollowups = globalThis as unknown as { __followupsLastDay?: string };

export async function runAutomaticFollowups(
  now = new Date(),
  force = false,
): Promise<{ created: string[]; checked: number }> {
  // Une seule exécution par jour, à partir de 09h00 (heure locale du serveur).
  // force=true (test manuel admin) ignore la garde horaire/quotidienne ;
  // l'idempotence par tâche existante reste toujours garantie.
  if (!force) {
    if (now.getHours() < 9) return { created: [], checked: 0 };
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (globalForFollowups.__followupsLastDay === dayKey) return { created: [], checked: 0 };
    globalForFollowups.__followupsLastDay = dayKey;
  }

  const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);
  const overdue = await db.invoice.findMany({
    where: {
      type: "VENTE",
      paymentStatus: { in: ["NON_PAYE", "PARTIEL"] },
      dueDate: { lt: tenDaysAgo },
    },
    include: { client: true },
    take: 100,
  });

  const created: string[] = [];
  for (const inv of overdue) {
    const title = `Relance facture ${inv.number}`;
    const existing = await db.crmTask.findFirst({
      where: { title, status: { not: "DONE" } },
    });
    if (existing) continue;

    const due = inv.dueDate ? new Date(inv.dueDate) : now;
    const daysLate = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
    const remaining = Math.max(0, Math.round(inv.totalTTC - inv.amountPaid));
    const clientName = inv.client?.name ?? inv.clientName ?? "client";

    await db.crmTask.create({
      data: {
        title,
        description: `La facture de ${clientName} est en retard de ${daysLate} jour(s). Montant restant : ${remaining.toLocaleString("fr-FR")} FCFA. Appeler ou envoyer un WhatsApp de relance.`,
        dueDate: now,
        status: "TODO",
        priority: "HIGH",
      },
    });
    created.push(title);
  }

  return { created, checked: overdue.length };
}
