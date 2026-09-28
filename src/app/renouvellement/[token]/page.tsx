import type { Metadata } from "next";
import { db } from "@/lib/db";
import RenewalPublicClient from "./renewal-client";

// ─── Page publique de renouvellement d'un domaine (Task 49, SANS auth) ───────
// Le client ouvre le lien /renouvellement/<token> (envoyé par WhatsApp ou
// e-mail) : il voit l'échéance et le montant de son domaine, peut payer via
// le lien Wave configuré et signaler « J'ai effectué le paiement ».
// Le jeton aléatoire (16 caractères base64url — 96 bits —, liens Task 49
// historiques à 48 caractères hexadécimaux toujours acceptés) est la seule clé
// d'accès — révocable depuis l'onglet Hosting (action revoke-link).
// Task 56 : la même page sert à l'ACHAT d'un domaine (+ hébergement) tant que
// le paiement n'est pas confirmé (status PENDING) — titre, détail du montant
// et message d'activation adaptés ; le compte à rebours de renouvellement
// démarre après confirmation (status repasse ACTIVE, page = renouvellement).
// NOTE : page volontairement HORS de l'AppShell → elle reste accessible même
// quand Setting.maintenanceMode est actif (l'écran de maintenance ne bloque
// que l'application interne, comme pour les documents partagés).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Renouvellement de domaine",
  robots: { index: false, follow: false },
};

const DAKAR_TZ = "Africa/Dakar";

function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DAKAR_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateHeure(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DAKAR_TZ,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function formatPrix(price: number): string | null {
  if (!price || price <= 0) return null;
  return `${new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(price)} FCFA`;
}

/** Page « Lien invalide ou expiré » — propre, sans erreur 500. */
function InvalidLink() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-stone-100 p-4"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <p className="text-4xl" aria-hidden>
          🔒
        </p>
        <h1 className="mt-3 text-lg font-bold text-stone-800">Lien invalide ou expiré</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Ce lien de renouvellement n&apos;est plus actif ou l&apos;adresse est incorrecte.
          <br />
          Contactez-nous pour obtenir un nouveau lien.
        </p>
      </div>
    </main>
  );
}

export default async function RenewalPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16) return <InvalidLink />;

  let domain: Awaited<ReturnType<typeof db.hostingDomain.findUnique>> = null;
  try {
    domain = await db.hostingDomain.findUnique({ where: { renewalToken: token } });
  } catch {
    return <InvalidLink />;
  }
  if (!domain) return <InvalidLink />;

  const setting = await db.setting.findFirst();
  const companyName = setting?.nomSociete?.trim() || "2MAILS";
  const telephone = setting?.telephone?.trim() || "";
  const logoUrl = setting?.logo || "/logo-2mails.png";

  return (
    <RenewalPublicClient
      token={token}
      domainName={domain.domain}
      clientName={domain.clientName?.trim() || null}
      dueLabel={formatDateLong(domain.renewalDate)}
      amountLabel={formatPrix(domain.price)}
      paymentUrl={domain.paymentUrl?.trim() || null}
      paymentLabel={domain.paymentLabel?.trim() || null}
      signaled={!!domain.paymentSignalAt}
      signaledAtLabel={domain.paymentSignalAt ? formatDateHeure(domain.paymentSignalAt) : null}
      companyName={companyName}
      telephone={telephone}
      logoUrl={logoUrl}
      isPurchase={domain.status === "PENDING"}
      hasHosting={domain.hasHosting}
      domainPriceLabel={formatPrix(domain.domainPrice)}
      hostingPriceLabel={formatPrix(domain.hostingPrice)}
    />
  );
}
