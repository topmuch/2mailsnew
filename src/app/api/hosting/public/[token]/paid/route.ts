import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAutomationConfig, sendAutomationEmail } from "@/lib/crm-automation";
import { publicBaseUrl as requestPublicBaseUrl } from "@/lib/doc-share";

// ─── Page publique de renouvellement : signaler « J'ai payé » (Task 49) ──────
// POST /api/hosting/public/<token>/paid — SANS authentification : le jeton
// aléatoire de la page publique est la seule clé. Deux sources (Task 49-b) :
//  - source "wave"   : signal SILENCIEUX déclenché automatiquement quand le
//                      client clique sur « Payer avec Wave » (aucune action
//                      supplémentaire demandée au client) ;
//  - source "button" : bouton « J'ai effectué le paiement » (secours).
// L'admin est notifié puis vérifie dans Wave (ou autre) et confirme via
// l'action `confirm-paid` de PUT /api/hosting/[id].
// Garde-fous : token inconnu → 404 ; rate-limit mémoire 1 signal / 30 s /
// token ; notification admin best-effort (ne bloque jamais la réponse).

export const dynamic = "force-dynamic";

// Rate-limit mémoire simple : dernier signal par token (Map module).
const SIGNAL_INTERVAL_MS = 30_000;
const lastSignalAt = new Map<string, number>();

function rateLimited(token: string): boolean {
  const now = Date.now();
  const last = lastSignalAt.get(token) ?? 0;
  if (now - last < SIGNAL_INTERVAL_MS) return true;
  // Nettoyage périodique pour éviter la fuite mémoire
  if (lastSignalAt.size > 500) {
    for (const [k, t] of lastSignalAt) {
      if (now - t > SIGNAL_INTERVAL_MS) lastSignalAt.delete(k);
    }
  }
  lastSignalAt.set(token, now);
  return false;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const domain = await db.hostingDomain.findUnique({ where: { renewalToken: token } });
    if (!domain) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    // Déjà signalé → idempotent (la page affiche le bandeau vert)
    if (domain.paymentSignalAt) {
      return NextResponse.json({ ok: true, already: true });
    }

    if (rateLimited(token)) {
      return NextResponse.json(
        { error: "Trop de signalements — patientez 30 secondes avant de réessayer" },
        { status: 429 },
      );
    }

    const signaledAt = new Date();

    // Source du signal : "wave" = clic silencieux sur le bouton de paiement,
    // "button" = bouton « J'ai effectué le paiement », absent = appel direct
    // (ancien client, curl). Corps JSON optionnel et tolérant aux erreurs.
    let source: "wave" | "button" = "button";
    try {
      const body = (await request.json()) as { source?: string } | null;
      if (body?.source === "wave") source = "wave";
    } catch {
      // pas de corps JSON exploitable → source par défaut
    }

    const updated = await db.hostingDomain.update({
      where: { id: domain.id },
      data: { paymentSignalAt: signaledAt },
    });

    // ── Notification admin (best-effort — n'échoue jamais la réponse) ────────
    try {
      const [config, setting] = await Promise.all([
        getAutomationConfig(),
        db.setting.findFirst(),
      ]);
      const to = (config.recipientEmail || setting?.email || "").trim();
      if (to.includes("@")) {
        const prix = domain.price
          ? `${new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(domain.price)} FCFA`
          : "à confirmer";
        const label = (domain.paymentLabel ?? "").trim() || "Wave";
        const clientLabel = domain.clientName?.trim() || "client";
        // Libellé selon la source : clic sur le bouton de paiement (silencieux)
        // ou signalement explicite du client.
        const actionText =
          source === "wave"
            ? `a cliqué sur « Payer avec ${label} »`
            : "a signalé avoir effectué le paiement";
        const journalText =
          source === "wave"
            ? `Paiement signalé (clic ${label}) — ${domain.domain} (${clientLabel}) — ${prix}`
            : `Paiement signalé — ${domain.domain} (${clientLabel}) — ${prix} — à vérifier dans ${label}`;
        const subject = `💳 Paiement signalé — ${domain.domain} (${clientLabel}) — ${prix} — à vérifier dans ${label}`;
        const base = (setting?.publicBaseUrl ?? "").trim().replace(/\/+$/, "") || requestPublicBaseUrl(request);
        const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;">
  <p style="margin:0 0 10px;">Le client ${actionText} depuis la page publique de renouvellement :</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Domaine</td><td style="padding:6px 10px;border:1px solid #e5e7eb;"><strong>${domain.domain}</strong></td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Client</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${domain.clientName?.trim() || "—"}</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Montant</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${prix}</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Signalé le</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" }).format(signaledAt)} (Dakar)</td></tr>
  </table>
  <p style="margin:12px 0 0;padding:10px 12px;background:#fef3c7;border-left:4px solid #d4af37;border-radius:6px;color:#7c5e00;">Vérifiez la réception dans ${label} puis confirmez le renouvellement depuis l'onglet Hosting.</p>
  <p style="margin:12px 0 0;"><a href="${base}/" style="color:#059669;font-weight:600;">Ouvrir l'application</a></p>
</div>`;
        const result = await sendAutomationEmail(to, subject, html);
        await db.crmSentMessage
          .create({
            data: {
              type: "HOSTING",
              subject,
              content: journalText,
              channel: "EMAIL",
              dedupeKey: `paid-${token}`,
              status: result.ok ? "SENT" : "FAILED",
              error: result.ok ? null : (result.error ?? "Erreur inconnue"),
            },
          })
          .catch(async () => {
            // (type, dedupeKey) déjà journalisé (signalement précédent du même
            // lien) → synchroniser la ligne avec le dernier résultat
            await db.crmSentMessage
              .update({
                where: { type_dedupeKey: { type: "HOSTING", dedupeKey: `paid-${token}` } },
                data: {
                  subject,
                  status: result.ok ? "SENT" : "FAILED",
                  error: result.ok ? null : (result.error ?? "Erreur inconnue"),
                },
              })
              .catch(() => {
                // best-effort
              });
          });
      }
    } catch {
      // notification admin best-effort — le signal du client reste enregistré
    }

    return NextResponse.json({
      ok: true,
      already: false,
      signaledAt: updated.paymentSignalAt?.toISOString() ?? signaledAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Signalement impossible" }, { status: 500 });
  }
}
