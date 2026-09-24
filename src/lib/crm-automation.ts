import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { ensureCoachMessagesSeeded } from "@/lib/crm-coach-seed";

// ─── Automatisations CRM : rapports quotidiens, coach virtuel, rappels RDV ──
// Contrainte horaire du prompt : arrêt le samedi à 13h, reprise le lundi.
// Dimanche = repos total. Toutes les exécutions sont idempotentes :
// la clé (type, dedupeKey) est VÉRIFIÉE AVANT l'envoi (alreadySent), puis
// journalisée après (CrmSentMessage @@unique([type, dedupeKey])) — un même
// e-mail ne peut donc partir qu'une seule fois, même sur une fenêtre de
// plusieurs minutes ou après redémarrage du serveur.

// ── isBusinessHours : vrai hors dimanche et hors samedi ≥ 13h ───────────────

export function isBusinessHours(date: Date): boolean {
  const day = date.getDay(); // 0 = dimanche, 6 = samedi
  const hour = date.getHours();
  if (day === 0) return false; // dimanche = repos total
  if (day === 6 && hour >= 13) return false; // samedi après 13h = repos
  return true;
}

// ── Helpers de dates locales ─────────────────────────────────────────────────

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}
function dayEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
function hhmm(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}
const fmtTimeFr = (d: Date) => hhmm(d).replace(":", "h");

// ── Configuration (singleton « main ») ───────────────────────────────────────

export async function getAutomationConfig() {
  const existing = await db.crmAutomationConfig.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return db.crmAutomationConfig.create({ data: { id: "main" } });
}

// ── Envoi d'e-mail (SMTP de la boîte mail 2mails — Setting) ──────────────────

export async function sendAutomationEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const setting = await db.setting.findFirst();
  const smtpReady = Boolean(setting && setting.smtpHost && setting.smtpUser && setting.smtpPass);
  if (!smtpReady || !setting) {
    return { ok: false, error: "SMTP non configuré (Paramètres → Boîte mail : serveur, utilisateur, mot de passe requis)" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: setting.smtpHost,
      port: setting.smtpPort,
      secure: setting.smtpSecure,
      auth: { user: setting.smtpUser, pass: setting.smtpPass },
    });
    await transporter.sendMail({
      from: `"${setting.mailFromName || setting.nomSociete || "2MAILS"}" <${setting.smtpUser}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    return { ok: false, error: `Échec d'envoi SMTP : ${message}` };
  }
}

function recipientEmail(config: { recipientEmail: string }, settingEmail: string | null | undefined): string {
  const target = (config.recipientEmail || settingEmail || "").trim();
  return target.includes("@") ? target : "";
}

// ── Journalisation (idempotence gérée par l'appelant via dedupeKey) ──────────

async function logSent(data: {
  type: string;
  subject: string;
  content: string;
  dedupeKey: string;
  ok: boolean;
  error?: string;
  channel?: string;
}) {
  await db.crmSentMessage.create({
    data: {
      type: data.type,
      subject: data.subject,
      content: data.content.slice(0, 4000),
      dedupeKey: data.dedupeKey,
      channel: data.channel ?? "EMAIL",
      status: data.ok ? "SENT" : "FAILED",
      error: data.ok ? null : (data.error ?? "Erreur inconnue"),
    },
  }).catch(() => {
    // Clé (type, dedupeKey) déjà utilisée → envoi déjà effectué, on ignore
  });
}

/**
 * Anti-doublon : true si un envoi (ou une tentative, même échouée) a déjà été
 * journalisé pour cette clé. À appeler AVANT tout envoi — sinon chaque tick
 * de la fenêtre renverrait l'e-mail (cause des doublons de rappels RDV).
 */
async function alreadySent(type: string, dedupeKey: string): Promise<boolean> {
  if (!dedupeKey) return false;
  const existing = await db.crmSentMessage.findUnique({
    where: { type_dedupeKey: { type, dedupeKey } },
    select: { id: true },
  });
  return Boolean(existing);
}

// Gabarit HTML commun (charte vert & or 2MAILS)
function wrapEmailHtml(title: string, bodyHtml: string): string {
  const societe = "2MAILS";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f4;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:14px 14px 0 0;padding:20px 24px;">
      <p style="margin:0;color:#d4af37;font-size:12px;letter-spacing:2px;font-weight:700;">${societe} — CRM UNIFIÉ</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;">${title}</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:24px;color:#1f2937;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:14px;">
      Message automatique — samedi après 13h & dimanche : repos total.
    </p>
  </div></body></html>`;
}

function sectionHtml(emoji: string, title: string, inner: string): string {
  return `<div style="margin-bottom:22px;">
    <h2 style="margin:0 0 10px;font-size:15px;color:#14532d;border-bottom:2px solid #d4af37;padding-bottom:6px;">${emoji} ${title}</h2>
    ${inner}
  </div>`;
}
const emptyHtml = (msg: string) => `<p style="margin:0;color:#6b7280;font-style:italic;">${msg}</p>`;

function listHtml(rows: string[]): string {
  if (!rows.length) return emptyHtml("Rien à signaler.");
  return `<ul style="margin:0;padding-left:18px;">${rows.map((r) => `<li style="margin-bottom:6px;">${r}</li>`).join("")}</ul>`;
}
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── KPIs CRM du jour (sources : CrmActivity + CrmItem + CrmPlatform) ─────────

export async function getDailyKpis(day: Date) {
  const start = dayStart(day);
  const end = dayEnd(day);
  const platforms = await db.crmPlatform.findMany();

  const [activations, scans, found, newItems] = await Promise.all([
    db.crmActivity.groupBy({
      by: ["platform"],
      where: { action: "ACTIVATION", timestamp: { gte: start, lte: end } },
      _count: true,
    }),
    db.crmActivity.count({ where: { action: "SCAN", timestamp: { gte: start, lte: end } } }),
    db.crmActivity.count({ where: { action: "FOUND", timestamp: { gte: start, lte: end } } }),
    db.crmItem.findMany({ where: { createdAt: { gte: start, lte: end } }, include: { platform: true } }),
  ]);

  const activationsBy = (name: string) => activations.find((a) => a.platform === name)?._count ?? 0;
  const packsBy = (name: string) => newItems.filter((i) => i.platform.name === name).length;
  const priceOf = (name: string) => platforms.find((p) => p.name === name)?.estimatedPackPrice ?? 0;
  const revenue =
    packsBy("QRTAGS") * priceOf("QRTAGS") + packsBy("QRBAGS") * priceOf("QRBAGS");

  return {
    activationsQrtags: activationsBy("QRTAGS"),
    activationsQrbags: activationsBy("QRBAGS"),
    activationsTotal: activations.reduce((s, a) => s + a._count, 0),
    scans,
    found,
    newItemsTotal: newItems.length,
    estimatedRevenue: revenue,
  };
}

function fcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;
}

// ── Objectifs du jour (aléatoires) ───────────────────────────────────────────

const DAILY_GOALS = [
  "Contacter au moins 5 prospects QRTags/QRBags avant 17h.",
  "Relancer tous les clients avec facture impayée aujourd'hui.",
  "Obtenir 2 nouveaux RDV confirmés avec des hôtels partenaires.",
  "Envoyer 3 devis (bracelets, bagages ou tags) avant midi.",
  "Activer au moins 1 nouveau pack et enregistrer le client dans le CRM.",
  "Appeler 2 partenaires transport (bus / agence de voyage) pour QRBags.",
  "Mettre à jour les tâches en retard et faire le point sur la semaine.",
  "Visiter 1 client existant pour proposer un pack supplémentaire.",
];

// ── Rapport du MATIN (08h30) — « Briefing du jour » ──────────────────────────

export async function generateMorningReport(now = new Date()) {
  await ensureCoachMessagesSeeded();
  const start = dayStart(now);
  const end = dayEnd(now);

  const [events, tasksLate, tasksToday, invoices, mails, setting, config] = await Promise.all([
    db.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.crmTask.findMany({
      where: { status: { not: "DONE" }, dueDate: { lt: start } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.crmTask.findMany({
      where: { status: { not: "DONE" }, dueDate: { gte: start, lte: end } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.invoice.findMany({
      where: { type: "VENTE", paymentStatus: { in: ["NON_PAYE", "PARTIEL"] } },
      orderBy: [{ dueDate: "asc" }],
      take: 10,
      include: { client: { select: { name: true } } },
    }),
    db.mail.findMany({ where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 5 }),
    db.setting.findFirst(),
    getAutomationConfig(),
  ]);

  const eventsRows = listHtml(
    events.map((e) =>
      `<b>${esc(e.startTime ? `${e.startTime.replace(":", "h")}` : "journée")}</b> — ${esc(e.title)} ` +
      `<span style="color:#9ca3af;">(${esc(e.type)}${e.done ? ", fait" : ""})</span>` +
      (e.description ? `<br/><span style="color:#6b7280;font-size:12px;">${esc(e.description)}</span>` : ""),
    ),
  );

  const lateRows = listHtml(
    tasksLate.map(
      (t) =>
        `<span style="color:#b91c1c;"><b>En retard</b></span> — ${esc(t.title)} ` +
        (t.dueDate ? `<span style="color:#9ca3af;">(échéance ${new Date(t.dueDate).toLocaleDateString("fr-FR")})</span>` : "") +
        `<span style="color:#9ca3af;"> [${esc(t.priority)}]</span>`,
    ),
  );
  const todayRows = listHtml(
    tasksToday.map(
      (t) =>
        `<b>Aujourd'hui</b> — ${esc(t.title)}<span style="color:#9ca3af;"> [${esc(t.priority)}]</span>`,
    ),
  );

  const invoiceRows = listHtml(
    invoices.map((f) => {
      const rest = Math.max(0, f.totalTTC - f.amountPaid);
      const overdue = f.dueDate && new Date(f.dueDate) < start;
      return `<b>${esc(f.number)}</b> — ${esc(f.clientName || f.client?.name || "Client")} : ` +
        `<b>${fcfa(rest)}</b> restant ` +
        (overdue ? `<span style="color:#b91c1c;"><b>(échue le ${new Date(f.dueDate as Date).toLocaleDateString("fr-FR")} — à relancer d'urgence)</b></span>` : "");
    }),
  );

  const mailRows = listHtml(
    mails.map((m) =>
      `<b>${esc(m.subject || "(sans objet)")}</b> — de ${esc(m.from)} ` +
      `<span style="color:#9ca3af;">(${new Date(m.sentAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })})</span>` +
      `<br/><span style="color:#6b7280;font-size:12px;">${esc(m.body.replace(/\s+/g, " ").slice(0, 120))}${m.body.length > 120 ? "…" : ""}</span>`,
    ),
  );

  const goal = config.dailyGoal.trim() || DAILY_GOALS[Math.floor(Math.random() * DAILY_GOALS.length)];

  const body =
    `<p style="margin:0 0 16px;">Bonjour ! Voici votre <b>briefing du ${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>.</p>` +
    sectionHtml("📅", "RDV du jour", eventsRows) +
    sectionHtml("⚠️", "Tâches en retard ou dues aujourd'hui", lateRows + todayRows) +
    sectionHtml("💰", "Factures impayées à relancer", invoiceRows) +
    sectionHtml("📧", "5 derniers e-mails reçus", mailRows) +
    sectionHtml("🎯", "Objectif du jour", `<p style="margin:0;background:#fef9e7;border-left:4px solid #d4af37;padding:10px 14px;border-radius:6px;"><b>${esc(goal)}</b></p>`);

  return {
    subject: `📅 Votre briefing du jour — ${setting?.nomSociete || "2MAILS"}`,
    html: wrapEmailHtml("Briefing du jour", body),
  };
}

// ── Rapport du SOIR (19h) — « Bilan de la journée » ──────────────────────────

export async function generateEveningReport(now = new Date()) {
  await ensureCoachMessagesSeeded();
  const start = dayStart(now);
  const end = dayEnd(now);

  const [kpis, tasksDone, events, mailsIn, mailsOut, setting] = await Promise.all([
    getDailyKpis(now),
    db.crmTask.findMany({
      where: { status: "DONE", updatedAt: { gte: start, lte: end } },
      orderBy: { updatedAt: "asc" },
      take: 15,
    }),
    db.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.mail.count({ where: { direction: "IN", sentAt: { gte: start, lte: end } } }),
    db.mail.count({ where: { direction: "OUT", sentAt: { gte: start, lte: end } } }),
    db.setting.findFirst(),
  ]);

  const kpiRow = (label: string, value: string, color = "#14532d") =>
    `<td style="padding:10px 14px;border:1px solid #e5e7eb;text-align:center;">
       <div style="font-size:20px;font-weight:800;color:${color};">${value}</div>
       <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">${label}</div>
     </td>`;

  const kpiTable = `<table style="border-collapse:collapse;width:100%;"><tbody><tr>
    ${kpiRow("Activations QRTags", String(kpis.activationsQrtags), "#a16207")}
    ${kpiRow("Activations QRBags", String(kpis.activationsQrbags), "#1d4ed8")}
    ${kpiRow("Total scans", String(kpis.scans))}
    ${kpiRow("Objets retrouvés", String(kpis.found), "#15803d")}
  </tr><tr>
    ${kpiRow("Packs vendus (est.)", String(kpis.newItemsTotal), "#a16207")}
    ${kpiRow("CA estimé du jour", fcfa(kpis.estimatedRevenue), "#a16207")}
    ${kpiRow("E-mails reçus", String(mailsIn))}
    ${kpiRow("E-mails envoyés", String(mailsOut))}
  </tr></tbody></table>`;

  const doneRows = listHtml(tasksDone.map((t) => `✅ ${esc(t.title)}`));

  const eventRows = listHtml(
    events.map((e) =>
      `<b>${esc(e.startTime ? e.startTime.replace(":", "h") : "journée")}</b> — ${esc(e.title)} ` +
      (e.done ? `<span style="color:#15803d;">(fait ✔)</span>` : `<span style="color:#b45309;">(non fait)</span>`),
    ),
  );

  // Suggestion dynamique pour demain
  const [tasksLateCount, invoicesLateCount] = await Promise.all([
    db.crmTask.count({ where: { status: { not: "DONE" }, dueDate: { lt: start } } }),
    db.invoice.count({
      where: { type: "VENTE", paymentStatus: { in: ["NON_PAYE", "PARTIEL"] }, dueDate: { lt: start } },
    }),
  ]);
  let suggestion: string;
  if (tasksLateCount > 0) {
    suggestion = `Traitez les ${tasksLateCount} tâche(s) en retard dès le début de journée — elles freinent le reste.`;
  } else if (invoicesLateCount > 0) {
    suggestion = `${invoicesLateCount} facture(s) échue(s) sont encore impayées : prévoyez une tournée de relances matinales.`;
  } else if (kpis.activationsTotal === 0) {
    suggestion = "Aucune activation aujourd'hui : contactez 3 prospects dès demain matin pour relancer le pipeline QRTags/QRBags.";
  } else {
    suggestion = "Bonne dynamique ! Capitalisez : demandez un parrainage à un client satisfait et préparez la tournée de demain.";
  }

  const body =
    `<p style="margin:0 0 16px;">Voici le <b>bilan de votre journée</b> du ${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.</p>` +
    sectionHtml("📈", "KPIs du jour", kpiTable) +
    sectionHtml("✅", "Tâches terminées aujourd'hui", doneRows) +
    sectionHtml("📅", "RDV de la journée", eventRows) +
    sectionHtml("💡", "Suggestion pour demain", `<p style="margin:0;background:#fef9e7;border-left:4px solid #d4af37;padding:10px 14px;border-radius:6px;"><b>${esc(suggestion)}</b></p>`);

  return {
    subject: `📊 Votre bilan de la journée — ${setting?.nomSociete || "2MAILS"}`,
    html: wrapEmailHtml("Bilan de la journée", body),
  };
}

// ── Coach Virtuel ─────────────────────────────────────────────────────────────

const COACH_TITLES: Record<string, string> = {
  "11h": "🎯 Focus Business",
  "14h": "💪 Motivation",
  "17h": "🏁 Closing",
};

/** Pioche un message actif du créneau et personnalise la salutation. */
export async function getRandomCoachMessage(timeSlot: "11h" | "14h" | "17h", now = new Date()) {
  await ensureCoachMessagesSeeded();
  const config = await getAutomationConfig();
  const pool = await db.crmCoachMessage.findMany({ where: { timeSlot, isActive: true } });
  if (!pool.length) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  const owner = config.ownerName.trim() || "Monsieur Diop";
  const content = picked.content.replace(/Monsieur Diop/g, owner).replace(/Bonjour Monsieur/g, `Bonjour ${owner.split(" ").pop() ?? owner}`);
  const setting = await db.setting.findFirst();
  const title = COACH_TITLES[timeSlot] ?? "Coach";
  const body =
    `<p style="margin:0 0 16px;">${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} — ${fmtTimeFr(now)}</p>` +
    `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:5px solid #d4af37;border-radius:10px;padding:18px 20px;font-size:15px;line-height:1.7;">${esc(content)}</div>`;
  return {
    subject: `${title} — ${setting?.nomSociete || "2MAILS"}`,
    html: wrapEmailHtml(title, body),
    content,
    messageId: picked.id,
  };
}

// ── Rappels de RDV (J-1 18h, H-1, H-15min) sur CalendarEvent ─────────────────

function eventDateTime(event: { date: Date; startTime: string | null }): Date | null {
  if (!event.startTime) return null;
  const [h, m] = event.startTime.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h)) return null;
  return new Date(event.date.getFullYear(), event.date.getMonth(), event.date.getDate(), h, m || 0, 0, 0);
}

async function sendReminder(
  event: { id: string; title: string; description: string | null; date: Date; startTime: string | null },
  slot: "J1" | "H1" | "H15",
  subject: string,
  now: Date,
  config: Awaited<ReturnType<typeof getAutomationConfig>>,
  force = false,
): Promise<boolean> {
  const dedupeKey = `REM-${event.id}-${slot}-${event.date.toISOString().slice(0, 10)}${force ? `-TEST-${now.getTime()}` : ""}`;
  // Anti-doublon : un seul envoi par RDV + créneau + jour (même si le tick
  // repasse 20 fois dans la fenêtre, ou après redémarrage du serveur).
  if (!force && (await alreadySent("REMINDER", dedupeKey))) return false;

  const setting = await db.setting.findFirst();
  const to = recipientEmail(config, setting?.email);
  if (!to) {
    await logSent({
      type: "REMINDER", subject, dedupeKey,
      content: event.title, ok: false, error: "Aucun e-mail destinataire configuré (Automatisations ou Paramètres société)",
    });
    return false;
  }
  const details = event.description ? `<p style="color:#6b7280;">${esc(event.description)}</p>` : "";
  const body = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:5px solid #d4af37;border-radius:10px;padding:16px 20px;">
      <p style="margin:0;font-size:15px;"><b>${esc(event.title)}</b>${details}</p>
    </div>`;
  const res = await sendAutomationEmail(to, subject, wrapEmailHtml("Rappel de rendez-vous", body));
  await logSent({ type: "REMINDER", subject, dedupeKey, content: event.title, ok: res.ok, error: res.error });
  return res.ok;
}

/** Cherche les rappels dus à l'instant et les envoie (idempotent par dedupeKey).
 *  Seuls les créneaux cochés dans reminderSlots (J1, H1, H15) sont actifs. */
export async function runReminders(now: Date, config?: Awaited<ReturnType<typeof getAutomationConfig>>, force = false) {
  const cfg = config ?? (await getAutomationConfig());
  const sent: string[] = [];
  const slotsActive = new Set(
    (cfg.reminderSlots ?? "H1").split(",").map((s) => s.trim()).filter(Boolean),
  );
  if (!slotsActive.size) return sent; // aucun créneau coché → aucun rappel

  // J-1 à 18h : tous les RDV de demain, fenêtre 18h00–18h14
  const curHm = hhmm(now);
  if (slotsActive.has("J1") && curHm >= "18:00" && curHm <= "18:14") {
    const tomorrowStart = dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const tomorrowEnd = dayEnd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const events = await db.calendarEvent.findMany({
      where: { date: { gte: tomorrowStart, lte: tomorrowEnd }, done: false },
    });
    for (const e of events) {
      const at = e.startTime ? ` à ${e.startTime.replace(":", "h")}` : "";
      const ok = await sendReminder(e, "J1", `⏰ Rappel : RDV demain${at} — ${e.title}`, now, cfg, force);
      if (ok) sent.push(`J-1 ${e.title}`);
    }
  }

  // H-1 et H-15 : basés sur l'heure exacte de l'événement (nécessite startTime)
  if (slotsActive.has("H1") || slotsActive.has("H15")) {
    const eventsWithTime = await db.calendarEvent.findMany({
      where: {
        date: { gte: dayStart(now), lte: dayEnd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) },
        startTime: { not: null },
        done: false,
      },
    });
    for (const e of eventsWithTime) {
      const t = eventDateTime(e);
      if (!t) continue;
      const deltaMin = Math.round((t.getTime() - now.getTime()) / 60000);
      if (slotsActive.has("H1") && deltaMin >= 50 && deltaMin <= 71) {
        const ok = await sendReminder(e, "H1", `⏰ Dans 1 heure : ${e.title}`, now, cfg, force);
        if (ok) sent.push(`H-1 ${e.title}`);
      } else if (slotsActive.has("H15") && deltaMin >= 8 && deltaMin <= 21) {
        const ok = await sendReminder(e, "H15", `⏰ Dans 15 minutes : ${e.title}`, now, cfg, force);
        if (ok) sent.push(`H-15 ${e.title}`);
      }
    }
  }
  return sent;
}

// ── Tick principal : exécute ce qui est dû à l'instant t ─────────────────────

export type TickResult = { ran: string[]; skipped: string[]; errors: string[] };

export async function runDueJobs(now = new Date(), opts?: { force?: boolean }): Promise<TickResult> {
  const force = opts?.force ?? false;
  const config = await getAutomationConfig();
  const setting = await db.setting.findFirst();
  const to = recipientEmail(config, setting?.email);
  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const business = isBusinessHours(now);
  const curHm = hhmm(now);
  const today = dayKey(now);

  const deliver = async (
    type: string,
    dedupeKey: string,
    content: { subject: string; html: string },
  ): Promise<boolean> => {
    // Anti-doublon : déjà envoyé (ou tenté) pour cette clé → on ignore
    if (!force && (await alreadySent(type, dedupeKey))) {
      skipped.push(`${type} : déjà envoyé (${dedupeKey})`);
      return false;
    }
    if (!to) {
      await logSent({ type, subject: content.subject, dedupeKey, content: "—", ok: false, error: "Aucun e-mail destinataire configuré (Automatisations ou Paramètres société)" });
      errors.push(`${type} : aucun destinataire configuré`);
      return false;
    }
    const res = await sendAutomationEmail(to, content.subject, content.html);
    await logSent({ type, subject: content.subject, dedupeKey, content: "Rapport envoyé", ok: res.ok, error: res.error });
    if (!res.ok) errors.push(`${type} : ${res.error}`);
    return res.ok;
  };

  // Rapport du matin
  if (curHm === config.reportMorningTime && config.reportMorningEnabled) {
    if (!business && !force) {
      skipped.push("Rapport matin (hors heures ouvrées)");
    } else {
      const key = force ? `MORNING-${today}-TEST-${now.getTime()}` : `MORNING-${today}`;
      const report = await generateMorningReport(now);
      if (await deliver("REPORT_MORNING", key, report)) ran.push("Rapport du matin");
    }
  }

  // Rapport du soir
  if (curHm === config.reportEveningTime && config.reportEveningEnabled) {
    if (!business && !force) {
      skipped.push("Rapport soir (hors heures ouvrées)");
    } else {
      const key = force ? `EVENING-${today}-TEST-${now.getTime()}` : `EVENING-${today}`;
      const report = await generateEveningReport(now);
      if (await deliver("REPORT_EVENING", key, report)) ran.push("Rapport du soir");
    }
  }

  // Coach virtuel : 11h, 14h, 17h
  const slots: { slot: "11h" | "14h" | "17h"; time: string; enabled: boolean }[] = [
    { slot: "11h", time: "11:00", enabled: config.coach11Enabled },
    { slot: "14h", time: "14:00", enabled: config.coach14Enabled },
    { slot: "17h", time: "17:00", enabled: config.coach17Enabled },
  ];
  for (const s of slots) {
    if (curHm !== s.time || !config.coachEnabled || !s.enabled) continue;
    if (!business && !force) {
      skipped.push(`Coach ${s.slot} (hors heures ouvrées)`);
      continue;
    }
    const msg = await getRandomCoachMessage(s.slot, now);
    if (!msg) {
      skipped.push(`Coach ${s.slot} (aucun message actif)`);
      continue;
    }
    const key = force ? `COACH-${s.slot}-${today}-TEST-${now.getTime()}` : `COACH-${s.slot}-${today}`;
    if (await deliver("COACH", key, msg)) ran.push(`Coach ${s.slot}`);
  }

  // Rappels de RDV (vérifiés à chaque tick ; fenêtres + dedupeKey internes)
  if (config.remindersEnabled) {
    const reminders = await runReminders(now, config, force);
    ran.push(...reminders);
  }

  return { ran, skipped, errors };
}

// ── Test manuel (boutons « Tests manuels » de l'admin Automatisations) ──────
// Envoi immédiat avec des clés dédoublées -TEST-<timestamp> : un test ne
// consomme JAMAIS le rappel/l'envoi réel du jour.

export async function runManualTest(
  kind: string,
  now = new Date(),
): Promise<{ ok: boolean; preview?: string; error?: string }> {
  const config = await getAutomationConfig();
  const setting = await db.setting.findFirst();
  const to = recipientEmail(config, setting?.email);
  if (!to) {
    return { ok: false, error: "Aucun e-mail destinataire configuré (Automatisations ou Paramètres société)" };
  }
  const ts = now.getTime();
  const sendTest = async (
    dedupeKey: string,
    subject: string,
    html: string,
    contentLabel: string,
  ): Promise<{ ok: boolean; preview?: string; error?: string }> => {
    const res = await sendAutomationEmail(to, subject, html);
    await logSent({ type: "TEST", subject, dedupeKey, content: contentLabel, ok: res.ok, error: res.error });
    return res.ok ? { ok: true, preview: subject } : { ok: false, error: res.error ?? "Échec d'envoi" };
  };

  switch (kind) {
    case "MORNING": {
      const c = await generateMorningReport(now);
      return sendTest(`TEST-MORNING-${ts}`, c.subject, c.html, "Test manuel — briefing du jour");
    }
    case "EVENING": {
      const c = await generateEveningReport(now);
      return sendTest(`TEST-EVENING-${ts}`, c.subject, c.html, "Test manuel — bilan du jour");
    }
    case "COACH_11":
    case "COACH_14":
    case "COACH_17": {
      const slot = kind === "COACH_11" ? "11h" : kind === "COACH_14" ? "14h" : "17h";
      const msg = await getRandomCoachMessage(slot, now);
      if (!msg) return { ok: false, error: `Aucun message coach actif pour le créneau ${slot}` };
      return sendTest(`TEST-${kind}-${ts}`, msg.subject, msg.html, `Test manuel — coach ${slot}`);
    }
    case "REMINDERS": {
      const sent = await runReminders(now, config, true);
      return sent.length
        ? { ok: true, preview: `Rappel(s) envoyé(s) : ${sent.join(", ")}` }
        : { ok: true, preview: "Aucun RDV dans une fenêtre de rappel actuellement (J-1 18h, H-1 ou H-15min) — rien à envoyer." };
    }
    default:
      return { ok: false, error: "Type de test inconnu" };
  }
}
