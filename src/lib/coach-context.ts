import { db } from "@/lib/db";
import { getAutomationConfig, getDailyKpis } from "@/lib/crm-automation";

// ─── Coach Virtuel IA : contexte business réel injecté dans le prompt ────────

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function dayEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;

export interface CoachChatRow {
  id: string;
  role: string; // "user" | "coach"
  content: string;
  createdAt: Date;
}

/** Salutation affichée à l'ouverture du chat (composée côté serveur avec les vrais chiffres). */
export async function buildCoachGreeting(): Promise<string> {
  const now = new Date();
  const [config, setting, kpis] = await Promise.all([
    getAutomationConfig(),
    db.setting.findFirst(),
    getDailyKpis(now),
  ]);
  const owner = config.ownerName.trim() || "Monsieur Diop";
  const lateTasks = await db.crmTask.count({ where: { status: { not: "DONE" }, dueDate: { lt: dayStart(now) } } });
  const unpaid = await db.invoice.count({ where: { type: "VENTE", paymentStatus: { in: ["NON_PAYE", "PARTIEL"] } } });
  const company = setting?.nomSociete || "2MAILS";
  const heure = new Date().getHours();
  const salut = heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    `${salut} ${owner} ! 👋 Je suis votre coach ${company}. ` +
    `En un coup d'œil aujourd'hui : ${kpis.activationsTotal} activation(s), ` +
    `${kpis.newItemsTotal} pack(s) vendu(s) pour un CA estimé à ${fcfa(kpis.estimatedRevenue)}, ` +
    `${lateTasks} tâche(s) en retard et ${unpaid} facture(s) impayée(s). ` +
    `Posez-moi vos questions ou choisissez une suggestion ci-dessous — je suis là pour faire avancer la journée !`
  );
}

/** Prompt système enrichi avec les données réelles du jour (tasks, factures, RDV, KPIs, mails). */
export async function buildCoachSystemPrompt(): Promise<string> {
  const now = new Date();
  const start = dayStart(now);
  const end = dayEnd(now);

  const [config, setting, kpis, tasksLate, tasksToday, invoices, events, mailsIn, mailsOut] = await Promise.all([
    getAutomationConfig(),
    db.setting.findFirst(),
    getDailyKpis(now),
    db.crmTask.findMany({
      where: { status: { not: "DONE" }, dueDate: { lt: start } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.crmTask.findMany({
      where: { status: { not: "DONE" }, dueDate: { gte: start, lte: end } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.invoice.findMany({
      where: { type: "VENTE", paymentStatus: { in: ["NON_PAYE", "PARTIEL"] } },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { client: { select: { name: true } } },
    }),
    db.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.mail.count({ where: { direction: "IN", sentAt: { gte: start, lte: end } } }),
    db.mail.count({ where: { direction: "OUT", sentAt: { gte: start, lte: end } } }),
  ]);

  const owner = config.ownerName.trim() || "Monsieur Diop";
  const company = setting?.nomSociete || "2MAILS";
  const dateFr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = now.getHours();

  const tasksLateLines = tasksLate.map(
    (t) => `  - ${t.title} (échéance ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("fr-FR") : "?"}, priorité ${t.priority})`,
  );
  const tasksTodayLines = tasksToday.map((t) => `  - ${t.title} (priorité ${t.priority})`);
  const invoiceLines = invoices.map((f) => {
    const rest = Math.max(0, f.totalTTC - f.amountPaid);
    const overdue = f.dueDate && new Date(f.dueDate) < start;
    return `  - ${f.number} — ${f.clientName || f.client?.name || "Client"} : ${fcfa(rest)} restant${overdue ? " (ÉCHUE, à relancer d'urgence)" : ""}`;
  });
  const eventLines = events.map(
    (e) => `  - ${e.startTime ? e.startTime.replace(":", "h") : "journée"} — ${e.title}${e.done ? " (fait)" : ""}`,
  );

  const dataBlock = [
    `📅 Nous sommes le ${dateFr} (${heure}h).`,
    `🎯 Objectif du jour : ${config.dailyGoal.trim() || "(non défini — propose un objectif adapté si l'utilisateur le demande)"}`,
    `📈 KPIs du jour : ${kpis.activationsTotal} activation(s) QRTags/QRBags, ${kpis.scans} scan(s), ${kpis.found} objet(s) retrouvé(s), ${kpis.newItemsTotal} pack(s) vendu(s), CA estimé ${fcfa(kpis.estimatedRevenue)}.`,
    `⚠️ Tâches en retard (${tasksLate.length}) :`,
    ...tasksLateLines,
    `🗓️ Tâches à échéance aujourd'hui (${tasksToday.length}) :`,
    ...tasksTodayLines,
    `💰 Factures de vente impayées (${invoices.length} — top ancienneté) :`,
    ...invoiceLines,
    `📅 RDV aujourd'hui (${events.length}) :`,
    ...eventLines,
    `📧 E-mails aujourd'hui : ${mailsIn} reçu(s), ${mailsOut} envoyé(s).`,
  ].join("\n");

  return [
    `Tu es « Coach Virtuel », le coach business personnel de ${owner}, intégré au CRM de ${company} (Sénégal, Dakar).`,
    `L'activité : vente de bracelets connectés QR Tags (qrtags.pro) et d'étiquettes QR pour bagages (qrbags.com) — les clients activent un pack en ligne pour retrouver leurs objets perdus. Les montants sont en FCFA.`,
    `Ton rôle : motiver, prioriser, débloquer. Tu connais les données réelles ci-dessous et tu t'y réfères avec des chiffres précis.`,
    ``,
    `Style :`,
    `- Tu vouvoies ${owner.split(" ")[0] ?? owner} avec chaleur, ton direct et énergique de coach senior.`,
    `- Réponses COURTES (5 à 8 phrases maximum), en français, actionnables.`,
    `- Format texte simple : retours à la ligne et puces avec « - ». Jamais de markdown (pas de **, #, ni tableaux).`,
    `- Termine par une question courte ou un défi pour garder l'élan (sauf question purement factuelle).`,
    `- Si les données montrent un problème (retards, impayés), priorise-le clairement : une seule action n°1.`,
    `- N'invente jamais de chiffres : utilise uniquement ceux du contexte. Si une information manque, dis-le.`,
    ``,
    `── DONNÉES RÉELLES DU JOUR ──`,
    dataBlock,
  ].join("\n");
}
