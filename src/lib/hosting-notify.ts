// ─── Rappels de renouvellement Hosting (Task 46-d, étendu Task 49) ──────────
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
//
// ── Extensions Task 49 (rappel client + lien public + renouvellement) ──────
//  6. À chaque étape atteinte, si Setting.hostingAdminCopy → mail admin
//     ci-dessus INCHANGÉ ; EN PLUS, si domain.clientEmail est valide → mail
//     CLIENT via buildHostingClientReminder, idempotence via la colonne
//     clientNotifiedStages (CSV indépendant), journal dedupeKey
//     `client-<domainId>-<stage>`. L'échec d'un des deux mails ne bloque
//     pas l'autre. Un clientEmail ajouté en cours de cycle rattrape UNE fois
//     les étapes déjà passées pour l'admin mais encore applicables.
//  7. markRenewed(domainId, method) : confirmation de renouvellement —
//     renewalDate +1 an (calendrier Dakar), réarmement des deux cycles
//     (notifiedStages + clientNotifiedStages), effacement du signalement
//     de paiement, ligne d'historique HostingRenewal.

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

// ── Rappel CLIENT (paramétrable + lien de paiement, Task 49) ────────────────

export interface ClientReminderDomainInput {
  domain: string;
  clientName?: string | null;
  renewalDate: Date;
  price?: number;
  daysLeft: number;
  customReminder?: string | null; // surcharge le modèle global
  paymentLabel?: string | null; // libellé du bouton (défaut « Wave »)
  renewalToken?: string | null; // jeton de la page publique
}

export interface ClientReminderSettingInput {
  nomSociete?: string | null;
  telephone?: string | null;
  hostingReminderSubject?: string | null;
  hostingReminderBody?: string | null;
  publicBaseUrl?: string | null;
}

/** URL publique de la page de renouvellement (null si jeton ou base absents). */
export function renewalPublicUrl(
  renewalToken: string | null | undefined,
  publicBaseUrl: string | null | undefined,
): string | null {
  const base = (publicBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!renewalToken || !base) return null;
  return `${base}/renouvellement/${renewalToken}`;
}

/** Complément de phrase selon le nombre de jours restants. */
function whenText(daysLeft: number): string {
  if (daysLeft > 0) return ` (dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""})`;
  if (daysLeft === 0) return " (échéance aujourd'hui)";
  return ` (échéance dépassée depuis ${Math.abs(daysLeft)} jour${Math.abs(daysLeft) > 1 ? "s" : ""})`;
}

const CLIENT_P_STYLE = "margin:0 0 12px;";

/**
 * Rend un modèle TEXTE (customReminder ou Setting.hostingReminderBody) en
 * HTML inline : variables échappées, sauf {lienPaiement} qui reçoit le HTML
 * de confiance (bouton de paiement ou phrase de contact).
 */
function renderClientTemplate(
  template: string,
  vars: Record<string, string>,
  lienHtml: string,
): string {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;">`,
  ];
  for (const raw of lines) {
    const line = raw.replace(/\{(\w+)\}/g, (m, key: string) => {
      if (key === "lienPaiement") return m; // placeholder conservé, remplacé brut
      const v = vars[key];
      return v !== undefined ? escapeHtml(v) : m;
    });
    if (line.trim() === "{lienPaiement}") {
      out.push(lienHtml); // HTML du bouton / encart contact, seul sur sa ligne
    } else if (line.trim() === "") {
      out.push(`<div style="height:10px;line-height:10px;">&nbsp;</div>`);
    } else if (line.includes("{lienPaiement}")) {
      out.push(`<p style="${CLIENT_P_STYLE}">${line.replace("{lienPaiement}", lienHtml)}</p>`);
    } else {
      out.push(`<p style="${CLIENT_P_STYLE}">${line}</p>`);
    }
  }
  out.push(`</div>`);
  return out.join("\n");
}

/** Version texte brut d'un modèle (journal + corps texte de secours). */
function replaceVarsText(
  template: string,
  vars: Record<string, string>,
  lienText: string,
): string {
  return template
    .replace(/\{lienPaiement\}/g, lienText)
    .replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

/** Corps HTML par défaut du rappel client (quand aucun modèle n'est défini). */
function defaultClientHtml(
  vars: Record<string, string>,
  daysLeft: number,
  lienHtml: string,
): string {
  return [
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;">`,
    `<p style="${CLIENT_P_STYLE}">Bonjour ${escapeHtml(vars.client)},</p>`,
    `<p style="${CLIENT_P_STYLE}">Le domaine <strong>${escapeHtml(vars.domaine)}</strong> arrive à échéance le <strong>${escapeHtml(vars.dateRenouvellement)}</strong>${escapeHtml(whenText(daysLeft))}.</p>`,
    `<p style="${CLIENT_P_STYLE}">Montant du renouvellement : <strong>${escapeHtml(vars.prix)}</strong>.</p>`,
    lienHtml,
    `<p style="margin:12px 0 0;">Cordialement,<br><strong>${escapeHtml(vars.societe)}</strong>${vars.telephone ? ` — ${escapeHtml(vars.telephone)}` : ""}</p>`,
    `</div>`,
  ].join("\n");
}

/**
 * Construit le rappel e-mail destiné AU CLIENT (Task 49).
 * Sujet  : Setting.hostingReminderSubject si non vide (variables remplacées),
 *          sinon sujet par défaut du code.
 * Corps  : priorité domain.customReminder > Setting.hostingReminderBody >
 *          modèle HTML du code (paragraphe poli + montant + bouton de
 *          paiement si lien public présent, sinon phrase de contact +
 *          signature {societe} — {telephone}).
 * Variables remplacées : {client} {domaine} {dateRenouvellement}
 * {joursRestants} {prix} {lienPaiement} {societe} {telephone}
 * ({joursRestants} : nombre de jours, « aujourd'hui » à J-0 ; {lienPaiement}
 * : bouton HTML inline — fond #1DC8FF texte noir si libellé Wave, vert
 * société sinon — quand renewalToken + Setting.publicBaseUrl existent,
 * sinon phrase de contact téléphonique).
 */
export function buildHostingClientReminder(
  d: ClientReminderDomainInput,
  setting?: ClientReminderSettingInput | null,
): { subject: string; html: string; text: string } {
  const societe = (setting?.nomSociete ?? "").trim() || "2MAILS";
  const telephone = (setting?.telephone ?? "").trim();
  const client = (d.clientName ?? "").trim() || "Madame, Monsieur";
  const dateStr = formatRenewalFr(d.renewalDate);
  const prix = priceFr(d.price ?? 0) || "à confirmer";
  const joursRestants = d.daysLeft > 0 ? String(d.daysLeft) : d.daysLeft === 0 ? "aujourd'hui" : String(d.daysLeft);

  // {lienPaiement} : bouton HTML stylé si le lien public existe, sinon contact
  const url = renewalPublicUrl(d.renewalToken, setting?.publicBaseUrl);
  const label = (d.paymentLabel ?? "").trim() || "Wave";
  const waveStyle = /wave/i.test(label);
  const lienHtml = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin:14px 0;padding:13px 26px;border-radius:10px;background:${waveStyle ? "#1DC8FF" : "#059669"};color:${waveStyle ? "#000000" : "#ffffff"};font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;">Renouveler / payer en ligne</a>`
    : `<p style="margin:14px 0;padding:10px 12px;background:#f0fdf4;border-left:4px solid #059669;border-radius:6px;color:#14532d;">Pour renouveler votre domaine ou effectuer le paiement, contactez-nous${telephone ? ` au <strong>${escapeHtml(telephone)}</strong>` : ""}.</p>`;
  const lienText = url
    ? `Renouveler / payer en ligne : ${url}`
    : `Pour renouveler votre domaine, contactez-nous${telephone ? ` au ${telephone}` : ""}.`;

  const vars: Record<string, string> = {
    client,
    domaine: d.domain,
    dateRenouvellement: dateStr,
    joursRestants,
    prix,
    societe,
    telephone,
  };

  // ── Sujet ──
  const customSubject = (setting?.hostingReminderSubject ?? "").trim();
  let subject: string;
  if (customSubject) {
    subject = customSubject.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
  } else if (d.daysLeft > 0) {
    subject = `Renouvellement de votre domaine ${d.domain} — dans ${d.daysLeft} jour${d.daysLeft > 1 ? "s" : ""}`;
  } else if (d.daysLeft === 0) {
    subject = `Renouvellement de votre domaine ${d.domain} — échéance aujourd'hui`;
  } else {
    subject = `Renouvellement de votre domaine ${d.domain} — échéance dépassée`;
  }

  // ── Corps ──
  const template = (d.customReminder ?? "").trim() || (setting?.hostingReminderBody ?? "").trim();
  const html = template
    ? renderClientTemplate(template, vars, lienHtml)
    : defaultClientHtml(vars, d.daysLeft, lienHtml);
  const text = template
    ? replaceVarsText(template, vars, lienText)
    : [
        `Bonjour ${client},`,
        "",
        `Le domaine ${d.domain} arrive à échéance le ${dateStr}${whenText(d.daysLeft)}.`,
        `Montant du renouvellement : ${prix}.`,
        "",
        lienText,
        "",
        "Cordialement,",
        `${societe}${telephone ? ` — ${telephone}` : ""}`,
      ].join("\n");

  return { subject, html, text };
}

// ── Fonction principale (tick scheduler, toutes les 30 min) ──────────────────

export async function checkHostingRenewals(
  now: Date
): Promise<{ notified: number; errors: number }> {
  let notified = 0;
  let errors = 0;
  try {
    const [domains, setting] = await Promise.all([
      db.hostingDomain.findMany({ orderBy: { renewalDate: "asc" } }),
      db.setting.findFirst(),
    ]);
    // Interrupteur « Copie à l'admin » (Task 49) — défaut true (comportement historique)
    const adminCopy = setting ? setting.hostingAdminCopy : true;

    for (const d of domains) {
      try {
        // Achats en attente de paiement (Task 56) : aucun rappel de
        // renouvellement tant que l'achat n'est pas payé/activé (status
        // repasse ACTIVE à la confirmation, avec cycles réarmés).
        if (d.status === "PENDING") continue;

        const daysLeft = dakarDaysLeft(d.renewalDate, now);
        if (daysLeft > 30) continue; // trop loin : rien à faire

        // Expiré → uniquement l'étape "0" (une seule fois, pas de spam après expiration)
        const reached = daysLeft < 0 ? [0] : STAGES.filter((s) => daysLeft <= s);

        // ── 1) Rappel ADMIN (inchangé quand hostingAdminCopy est actif) ─────
        if (adminCopy) {
          const already = parseStages(d.notifiedStages);
          const missing = reached.filter((s) => !already.has(s));
          if (missing.length) {
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
              await db.hostingDomain.update({
                where: { id: d.id },
                data: { notifiedStages: mergeStages(d.notifiedStages, reached) },
              });
            } else {
              errors++;
            }
          }
        }

        // ── 2) Rappel CLIENT (indépendant, Task 49) ──────────────────────────
        // Idempotence via clientNotifiedStages (CSV séparé de notifiedStages) ;
        // l'échec du mail client ne bloque pas l'admin et inversement.
        // Un clientEmail ajouté en cours de cycle rattrape UNE fois les étapes
        // déjà passées pour l'admin mais encore applicables (daysLeft ≤ étape).
        const clientEmail = (d.clientEmail ?? "").trim();
        if (clientEmail.includes("@")) {
          const clientAlready = parseStages(d.clientNotifiedStages);
          const clientMissing = reached.filter((s) => !clientAlready.has(s));
          if (clientMissing.length) {
            const stage = clientMissing[clientMissing.length - 1];
            const reminder = buildHostingClientReminder(
              {
                domain: d.domain,
                clientName: d.clientName,
                renewalDate: d.renewalDate,
                price: d.price,
                daysLeft,
                customReminder: d.customReminder,
                paymentLabel: d.paymentLabel,
                renewalToken: d.renewalToken,
              },
              setting,
            );
            const result = await sendAutomationEmail(clientEmail, reminder.subject, reminder.html);
            await logHosting({
              subject: reminder.subject,
              content: reminder.text,
              dedupeKey: `client-${d.id}-${stage}`,
              ok: result.ok,
              error: result.error,
            });
            if (result.ok) {
              notified++;
              // Toutes les étapes atteintes sont marquées (pas de cascade au tick suivant)
              await db.hostingDomain.update({
                where: { id: d.id },
                data: { clientNotifiedStages: mergeStages(d.clientNotifiedStages, reached) },
              });
            } else {
              errors++;
            }
          }
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

// ── Confirmation de renouvellement (Task 49) ─────────────────────────────────

/**
 * Marque un domaine comme RENOUVELÉ :
 *  - renewalDate repoussée d'un an (même jour/mois, calendrier Dakar — le
 *    29 février recule au 28 février les années non bissextiles) ;
 *  - les deux cycles de rappels sont réarmés (notifiedStages admin ET
 *    clientNotifiedStages remis à "") ;
 *  - le signalement de paiement (paymentSignalAt) est effacé ;
 *  - une ligne d'historique HostingRenewal est créée
 *    (« <ancienne année>-<nouvelle année> », montant = prix du domaine,
 *    méthode Manuel | Wave | Autre).
 * Retourne le domaine mis à jour + la ligne d'historique créée.
 */
export async function markRenewed(domainId: string, method = "Manuel", amount?: number) {
  const domain = await db.hostingDomain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error("Domaine introuvable");

  const parts = calendarParts(domain.renewalDate, DAKAR_TZ);
  const newY = parts.y + 1;
  // Dernier jour du même mois l'année suivante (clamp 29/02 → 28/02)
  const maxDay = new Date(Date.UTC(newY, parts.m, 0)).getUTCDate();
  const newDate = new Date(Date.UTC(newY, parts.m - 1, Math.min(parts.d, maxDay)));

  const updated = await db.hostingDomain.update({
    where: { id: domainId },
    data: {
      renewalDate: newDate,
      notifiedStages: "",
      clientNotifiedStages: "",
      paymentSignalAt: null,
    },
  });
  const renewal = await db.hostingRenewal.create({
    data: {
      domainId,
      renewedFor: `${parts.y}-${newY}`,
      amount: amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : domain.price,
      method,
    },
  });
  return { domain: updated, renewal };
}

// ── Confirmation d'achat de domaine + hébergement (Task 56) ──────────────────

/**
 * Active un ACHAT payé (domaine + hébergement éventuel, status PENDING) :
 *  - purchasedAt = maintenant (jour du paiement, calendrier Dakar) ;
 *  - renewalDate fixée à MÊME jour/mois l'année suivante (clamp 29/02 → 28/02)
 *    → le compte à rebours de renouvellement démarre ;
 *  - status repasse ACTIVE (les rappels J-30/15/2/J s'arment naturellement) ;
 *  - les deux cycles de rappels sont réarmés (notifiedStages admin ET
 *    clientNotifiedStages remis à "") ;
 *  - le signalement de paiement (paymentSignalAt) est effacé ;
 *  - une ligne d'historique HostingRenewal est créée
 *    (« Achat <année>-<année+1> », montant = prix total de l'achat,
 *    méthode Manuel | Wave | Autre).
 * Retourne le domaine mis à jour + la ligne d'historique créée.
 */
export async function activatePurchase(domainId: string, method = "Manuel", amount?: number) {
  const domain = await db.hostingDomain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error("Domaine introuvable");

  const now = new Date();
  const parts = calendarParts(now, DAKAR_TZ);
  const newY = parts.y + 1;
  // Dernier jour du même mois l'année suivante (clamp 29/02 → 28/02)
  const maxDay = new Date(Date.UTC(newY, parts.m, 0)).getUTCDate();
  const newDate = new Date(Date.UTC(newY, parts.m - 1, Math.min(parts.d, maxDay)));

  const updated = await db.hostingDomain.update({
    where: { id: domainId },
    data: {
      status: "ACTIVE",
      purchasedAt: now,
      renewalDate: newDate,
      notifiedStages: "",
      clientNotifiedStages: "",
      paymentSignalAt: null,
    },
  });
  const renewal = await db.hostingRenewal.create({
    data: {
      domainId,
      renewedFor: `Achat ${parts.y}-${newY}`,
      amount: amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : domain.price,
      method,
    },
  });
  return { domain: updated, renewal };
}
