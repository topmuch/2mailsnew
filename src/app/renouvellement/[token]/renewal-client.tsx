"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// ─── Page publique de renouvellement — interactions client (Task 49/49-b) ────
// Carte centrée mobile-first : échéance + montant, bouton de paiement Wave
// (fond #1DC8FF, texte noir, ≥ 48 px de haut pour le tactile), bouton
// « J'ai effectué le paiement » → POST /api/hosting/public/<token>/paid
// (URL relative, jamais d'URL absolue en dur).
// Task 49-b : signal SILENCIEUX au clic sur le bouton de paiement — le clic
// sur « Payer avec Wave » déclenche le même signal (badge admin + notif)
// sans aucune action supplémentaire du client ; le bouton « J'ai effectué
// le paiement » reste en secours (paiement par un autre canal, clic raté).
// Task 56 : variante ACHAT (status PENDING) — titre « Achat de domaine
// (et hébergement) », détail du montant (domaine / hébergement / total) et
// mention d'activation : le compte à rebours de renouvellement (1 an) ne
// démarre qu'après confirmation du paiement.

interface RenewalPublicClientProps {
  token: string;
  domainName: string;
  clientName: string | null;
  dueLabel: string;
  amountLabel: string | null;
  paymentUrl: string | null;
  paymentLabel: string | null;
  signaled: boolean;
  signaledAtLabel: string | null;
  companyName: string;
  telephone: string;
  logoUrl: string;
  // ── Task 56 : variante achat (toutes optionnelles, défaut = renouvellement)
  isPurchase?: boolean;
  hasHosting?: boolean;
  domainPriceLabel?: string | null;
  hostingPriceLabel?: string | null;
}

export default function RenewalPublicClient({
  token,
  domainName,
  clientName,
  dueLabel,
  amountLabel,
  paymentUrl,
  paymentLabel,
  signaled: initialSignaled,
  signaledAtLabel: initialSignaledLabel,
  companyName,
  telephone,
  logoUrl,
  isPurchase = false,
  hasHosting = false,
  domainPriceLabel = null,
  hostingPriceLabel = null,
}: RenewalPublicClientProps) {
  const [signaled, setSignaled] = useState(initialSignaled);
  const [signaledAtLabel, setSignaledAtLabel] = useState(initialSignaledLabel);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Verrou anti double-signal partagé (clic Wave + bouton manuel), sans
  // re-rendu : un simple ref suffit.
  const signalingRef = useRef(false);

  const payLabel = paymentLabel || "Wave";

  const applySignaled = (iso?: string) => {
    setSignaled(true);
    setSignaledAtLabel(
      iso
        ? new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Africa/Dakar",
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date(iso))
        : signaledAtLabel,
    );
  };

  const postPaid = async (source: "wave" | "button") => {
    const res = await fetch(`/api/hosting/public/${token}/paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
      // keepalive : le signal part même si l'onglet est fermé juste après le
      // clic (webview WhatsApp, navigation immédiate vers la page de paiement)
      keepalive: true,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      already?: boolean;
      signaledAt?: string;
      error?: string;
    };
    return { res, json };
  };

  // Signal silencieux au clic sur « Payer avec Wave » (Task 49-b) : le POST
  // part en arrière-plan SANT bloquer la navigation vers la page de paiement
  // (target=_blank conservé). Aucun message d'erreur affiché au client en cas
  // d'échec — le bouton « J'ai effectué le paiement » reste le secours.
  const handlePayClick = () => {
    if (signaled || signalingRef.current) return;
    signalingRef.current = true;
    postPaid("wave")
      .then(({ res, json }) => {
        if (res.ok && json.ok) applySignaled(json.signaledAt);
      })
      .catch(() => {
        // silencieux — pas de feedback d'erreur pour le client
      })
      .finally(() => {
        signalingRef.current = false;
      });
    // volontairement sans await : la navigation part immédiatement
  };

  const signalPaid = async () => {
    if (submitting || signaled || signalingRef.current) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const { res, json } = await postPaid("button");
      if (res.ok && json.ok) {
        applySignaled(json.signaledAt);
      } else {
        setFeedback(json.error || "Signalement impossible — contactez-nous par téléphone.");
      }
    } catch {
      setFeedback("Connexion impossible — vérifiez votre accès internet et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const telHref = telephone ? `tel:${telephone.replace(/[^\d+]/g, "")}` : null;

  return (
    <main
      className="flex min-h-dvh flex-col bg-stone-100"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}
    >
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Carte principale */}
          <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
            {/* Logo société */}
            <div className="flex justify-center">
              <img src={logoUrl} alt={`Logo ${companyName}`} className="h-16 w-auto max-w-[180px] object-contain" />
            </div>

            <h1 className="mt-5 text-center text-xl font-bold text-stone-900">
              {isPurchase
                ? hasHosting
                  ? "Achat de domaine et hébergement"
                  : "Achat de domaine"
                : "Renouvellement de domaine"}
            </h1>
            {clientName && <p className="mt-1 text-center text-sm text-stone-500">{clientName}</p>}

            {/* Détails du domaine */}
            <dl className="mt-5 space-y-3 rounded-xl bg-stone-50 p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-stone-500">Domaine</dt>
                <dd className="text-right font-bold text-stone-900">{domainName}</dd>
              </div>
              {/* Task 56 — achat : détail du montant + activation après paiement */}
              {isPurchase && domainPriceLabel && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-stone-500">Nom de domaine</dt>
                  <dd className="text-right text-stone-900">{domainPriceLabel}</dd>
                </div>
              )}
              {isPurchase && hostingPriceLabel && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-stone-500">Hébergement (1 an)</dt>
                  <dd className="text-right text-stone-900">{hostingPriceLabel}</dd>
                </div>
              )}
              {!isPurchase && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-stone-500">Échéance</dt>
                  <dd className="text-right text-stone-900">{dueLabel}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-stone-500">{isPurchase ? "Total à payer" : "Montant"}</dt>
                <dd className="text-right font-semibold text-stone-900">
                  {amountLabel || "À confirmer"}
                </dd>
              </div>
            </dl>

            {/* Task 56 — achat : le compte à rebours démarre après paiement */}
            {isPurchase && (
              <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-800">
                Dès que votre paiement est confirmé, votre domaine est activé et le compte à
                rebours de renouvellement (1 an) démarre automatiquement.
              </p>
            )}

            {/* Bandeau « paiement signalé » */}
            {signaled && (
              <p
                className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700"
                role="status"
              >
                ✔ Paiement signalé{signaledAtLabel ? ` le ${signaledAtLabel}` : ""} — en cours de
                vérification
              </p>
            )}

            {/* Bouton de paiement */}
            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handlePayClick}
                aria-label={`Payer avec ${payLabel} — le paiement sera signalé automatiquement`}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#1DC8FF] px-4 text-base font-bold text-black transition-[filter] hover:brightness-95 active:brightness-90"
              >
                💠 Payer avec {payLabel}
              </a>
            ) : (
              <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm">
                <p className="font-medium text-stone-700">
                  Contactez-nous pour régler votre renouvellement
                </p>
                {telHref ? (
                  <a
                    href={telHref}
                    className="mt-1.5 inline-flex min-h-[44px] items-center font-bold text-emerald-700 underline-offset-4 hover:underline"
                  >
                    📞 {telephone}
                  </a>
                ) : (
                  <p className="mt-1 text-stone-500">Numéro disponible sur demande.</p>
                )}
              </div>
            )}

            {/* Signaler le paiement (secours — le clic Wave signale déjà) */}
            <button
              type="button"
              onClick={signalPaid}
              disabled={signaled || submitting}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Envoi…
                </>
              ) : signaled ? (
                "Paiement déjà signalé ✔"
              ) : (
                "J'ai effectué le paiement"
              )}
            </button>

            {feedback && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700" role="alert">
                {feedback}
              </p>
            )}
          </div>

          {/* Pied de page */}
          <p className="mt-5 text-center text-xs text-stone-400">
            {companyName}
            {telephone ? ` — ${telephone}` : ""}
          </p>
        </div>
      </div>
    </main>
  );
}
