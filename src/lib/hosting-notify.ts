// ─── Rappels de renouvellement Hosting (Task 46-d) ──────────────────────────
// Appelé par le scheduler (src/lib/crm-scheduler.ts) toutes les 30 minutes.
// Pour chaque HostingDomain : calcule les jours restants avant renewalDate et
// envoie UN e-mail de rappel par étape atteinte (J-30, J-15, J-2, jour J),
// idempotent via la colonne notifiedStages (CSV « 30,15,2,0 » — réinitialisé
// quand renewalDate change).
//
// Responsabilités :
//  1. Lister les HostingDomain, calculer daysLeft (différence de DATES
//     CALENDARIËLLES en TZ Africa/Dakar — parties Y-M-D, pas timestamps bruts)
//  2. Si daysLeft ≤ 30 : envoyer le rappel pour l'étape la plus urgente
//     atteinte et absente de notifiedStages (SMTP de Setting, destination =
//     CrmAutomationConfig.recipientEmail ou Setting.email — même mécanique
//     que src/lib/crm-automation.ts via sendAutomationEmail)
//  3. Journaliser l'envoi dans CrmSentMessage (type "HOSTING", dedupeKey
//     unique par domaine+étape+cycle, @@unique([type, dedupeKey]) → P2002
//     = déjà journalisé, on ignore)
//  4. Succès → append TOUTES les étapes atteintes à notifiedStages (CSV
//     propre, trié) — ainsi un domaine ajouté en retard (ex. J-10) ne
//     génère pas de rattrapage en cascade aux ticks suivants
//  5. daysLeft > 30 → rien ; expiré (daysLeft < 0) → étape "0" une seule
//     fois (pas de spam après expiration) ; SMTP non configuré → compter
//     une erreur + CrmSentMessage FAILED sans faire planter le tick

import { db } from "@/lib/db";
import { getAutomationConfig, sendAutomationEmail } from "@/lib/crm-automation";

// ── Dates calendaires (TZ Africa/Dakar) ──────────────────────────────────────

const DAKAR_TZ = "Africa/Dakar";
const MS_PER_DAY = 86_400_000;

/** Parties Y-M-D d'une date dans une timezone donnée (calendrier local). */
function calendarParts(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(date).split("-").map(Number);
  return { y, m, d };
}

/**
 * Jours restants avant renewalDate en jours CALENDARIËLLES (TZ Africa/Dakar) :
 * compare les parties Y-M-D des deux dates (pas les timestamps bruts) pour
 * éviter les décalages d'heures. Positif = à venir, 0 = aujourd'hui,
 * négatif = expiré depuis |n| jours.
 */
export function dakarDaysLeft(renewalDate: Date, now: Date): number {
  const a = calendarParts(renewalDate, DAKAR_TZ);
  const b = calendarParts(now, DAKAR_TZ);
  const msA = Date.UTC(a.y, a.m - 1, a.d);
  const msB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((msA - msB) / MS_PER_DAY);
}

/** Clé Y-M-D (Dakar) d'une date — utilisée dans les dedupeKey. */
export function dakarDayKey(date: Date): string {
  const { y, m, d } = calendarParts(date, DAKAR_TZ);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

/** Date lisible fr-FR (fuseau Dakar) — ex. « 27 septembre 2026 ». */
export function formatRenewalFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DAKAR_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// ── Étapes de rappel & notifiedStages (CSV) ──────────────────────────────────

/** Étapes cibles, croissantes : J-30, J-15, J-2, jour J. */
const STAGES = [30, 15, 2, 0] as const;

function parseStages(csv: string): Set<number> {
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n)),
  );
}

/** Fusionne des étapes dans le CSV, trié en ordre décroissant (format « 30,15,2,0 »). */
function mergeStages(current: string, stages: number[]): string {
  const set = parseStages(current);
  for (const s of stages) set.add(s);
  return [...set].sort((a, b) => b - a).join(",");
}

// ── Construction de l'e-mail de rappel ───────────────────────────────────────

/** Prix annuel formaté FCFA (fr-SN) ou chaîne vide si non renseigné. */
function priceFr(price: number): string {
  if (!price || price <= 0) return "";
  return `${new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(price)} FCFA`;
}

/**
 * Sujet du rappel : « ⏰ Renouvellement domaine X — J-n »,
 * « — expire aujourd'hui » (jour J) ou « — expiré ».
 */
function reminderSubject(domain: string, daysLeft: number): string {
  if (daysLeft > 0) return `⏰ Renouvellement domaine ${domain} — J-${daysLeft}`;
  if (daysLeft === 0) return `⏰ Renouvellement domaine ${domain} — expire aujourd'hui`;
  return `⏰ Renouvellement domaine ${domain} — expiré`;
}

interface EmailInput {
  domain: string;
  registrar?: string | null;
  clientName?: string | null;
  renewalDate: Date;
  price?: number;
  daysLeft: number;
}

/** Corps HTML simple du rappel (charte verte 2MAILS). */
function reminderHtml(d: EmailInput): string {
  const rows: [string, string][] = [
    ["Nom de domaine", `<strong>${escapeHtml(d.domain)}</strong>`],
    ["Registrar", d.registrar ? escapeHtml(d.registrar) : "—"],
    [
      "Date de renouvellement",
      `<strong>${escapeHtml(formatRenewalFr(d.renewalDate))}</strong>${
        d.daysLeft > 0 ? ` (dans ${d.daysLeft} jour${d.daysLeft > 1 ? "s" : ""})` : ""
      }`,
    ],
  ];
  const p = priceFr(d.price ?? 0);
  if (p) rows.push(["Prix annuel", p]);
  rows.push(["Client rattaché", d.clientName ? escapeHtml(d.clientName) : "—"]);
  const action =
    d.daysLeft > 0
      ? "Pensez à relancer le client et à renouveler le domaine avant l'échéance."
      : d.daysLeft === 0
        ? "Le domaine expire AUJOURD'HUI : renouvelez-le sans attendre pour éviter la perte du nom."
        : "Le domaine est EXPIRÉ : renouvelez-le en urgence (risque de perte définitive du nom et de coupure des services).";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1f2937;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;width:40%;font-weight:600;">${label}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${value}</td></tr>`,
      )
      .join("")}
  </table>
  <p style="margin:16px 0 0;padding:10px 12px;background:#fef3c7;border-left:4px solid #d4af37;border-radius:6px;color:#7c5e00;">
    ✅ ${action}
  </p>
</div>`;
}

/** Résumé texte (journal CrmSentMessage + corps texte de secours). */
function reminderText(d: EmailInput): string {
  const bits = [
    `Domaine : ${d.domain}`,
    `Registrar : ${d.registrar || "—"}`,
    `Renouvellement : ${formatRenewalFr(d.renewalDate)}`,
  ];
  const p = priceFr(d.price ?? 0);
  if (p) bits.push(`Prix annuel : ${p}`);
  bits.push(`Client : ${d.clientName || "—"}`);
  return bits.join(" · ");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Destinataire : CrmAutomationConfig.recipientEmail sinon Setting.email. */
async function resolveRecipient(): Promise<string> {
  const config = await getAutomationConfig();
  const setting = await db.setting.findFirst();
  const target = (config.recipientEmail || setting?.email || "").trim();
  return target.includes("@") ? target : "";
}

/**
 * Journalise l'envoi dans CrmSentMessage (type HOSTING). Une clé
 * (type, dedupeKey) déjà prise (P2002) met simplement à jour la ligne
 * existante avec le résultat du dernier essai : un envoi d'abord FAILED
 * (ex. SMTP non configuré) puis réussi au tick suivant n'écrase pas le
 * journal d'une nouvelle ligne (contrainte @@unique) mais corrige son statut.
 */
async function logHosting(data: {
  subject: string;
  content: string;
  dedupeKey: string;
  ok: boolean;
  error?: string;
}): Promise<void> {
  const payload = {
    subject: data.subject,
    content: data.content.slice(0, 4000),
    channel: "EMAIL" as const,
    status: data.ok ? "SENT" : "FAILED",
    error: data.ok ? null : (data.error ?? "Erreur inconnue"),
  };
  await db.crmSentMessage
    .create({
      data: { type: "HOSTING", dedupeKey: data.dedupeKey, ...payload },
    })
    .catch(async () => {
      // (type, dedupeKey) déjà journalisé → synchroniser le statut du dernier essai
      await db.crmSentMessage
        .update({
          where: { type_dedupeKey: { type: "HOSTING", dedupeKey: data.dedupeKey } },
          data: payload,
        })
        .catch(() => {
          // best-effort — ne bloque pas le cycle
        });
    });
}

// ── Envoi manuel (rappel immédiat depuis l'interface) ────────────────────────

/**
 * Construit le rappel pour un domaine (sujet + corps html + texte) — réutilisé
 * par l'action « notify » manuelle de PUT /api/hosting/[id] (bypass des étapes,
 * dedupeKey unique `manual-<Date.now()>`).
 */
export function buildHostingReminder(d: {
  domain: string;
  registrar?: string | null;
  clientName?: string | null;
  renewalDate: Date;
  price?: number;
  daysLeft: number;
  manual?: boolean;
}): { subject: string; html: string; text: string } {
  const base = reminderSubject(d.domain, d.daysLeft);
  return {
    subject: d.manual ? base.replace("⏰ ", "⏰ Rappel manuel — ") : base,
    html: reminderHtml(d),
    text: reminderText(d),
  };
}

// ── Fonction principale (tick scheduler, toutes les 30 min) ──────────────────

export async function checkHostingRenewals(
  now: Date
): Promise<{ notified: number; errors: number }> {
  let notified = 0;
  let errors = 0;
  try {
    const domains = await db.hostingDomain.findMany({ orderBy: { renewalDate: "asc" } });
    for (const d of domains) {
      try {
        const daysLeft = dakarDaysLeft(d.renewalDate, now);
        if (daysLeft > 30) continue; // trop loin : rien à faire

        const already = parseStages(d.notifiedStages);
        // Expiré → uniquement l'étape "0" (une seule fois, pas de spam après expiration)
        const reached = daysLeft < 0 ? [0] : STAGES.filter((s) => daysLeft <= s);
        const missing = reached.filter((s) => !already.has(s));
        if (!missing.length) continue;
        const stage = missing[missing.length - 1]; // étape la plus urgente atteinte

        const input: EmailInput = {
          domain: d.domain,
          registrar: d.registrar,
          clientName: d.clientName,
          renewalDate: d.renewalDate,
          price: d.price,
          daysLeft,
        };
        const subject = reminderSubject(d.domain, daysLeft);
        const html = reminderHtml(input);
        const text = reminderText(input);
        const dedupeKey = `hosting-${d.id}-${stage}-${dakarDayKey(d.renewalDate)}`;

        const to = await resolveRecipient();
        let ok = false;
        let error: string | undefined;
        if (!to) {
          error = "Aucun destinataire configuré (Automatisations → e-mail ou Paramètres → e-mail société)";
        } else {
          const result = await sendAutomationEmail(to, subject, html);
          ok = result.ok;
          error = result.error;
        }
        await logHosting({ subject, content: text, dedupeKey, ok, error });
        if (ok) {
          notified++;
          // Marquer TOUTES les étapes atteintes (pas seulement celle envoyée)
          // pour éviter le rattrapage en cascade aux ticks suivants.
          const newStages = mergeStages(d.notifiedStages, reached);
          await db.hostingDomain.update({
            where: { id: d.id },
            data: { notifiedStages: newStages },
          });
        } else {
          errors++;
        }
      } catch (domainError) {
        errors++;
        console.error(
          `[hosting-notify] erreur sur le domaine ${d.domain} :`,
          domainError instanceof Error ? domainError.message : domainError,
        );
      }
    }
  } catch (error) {
    console.error(
      "[hosting-notify] échec du cycle de rappels :",
      error instanceof Error ? error.message : error,
    );
  }
  return { notified, errors };
}
