import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { dakarDaysLeft, renewalPublicUrl } from "@/lib/hosting-notify";

// ─── Hosting : noms de domaine achetés & renouvellements (Task 46-d) ─────────
// GET  → liste triée par renewalDate asc + daysLeft (jours calendaires Dakar)
//        + renewalUrl (page publique) quand un jeton est actif (Task 49)
//        + achats en attente de paiement (status PENDING, Task 56) en tête
// POST → création { domain (requis), registrar?, clientName?, clientPhone?,
//                  renewalDate (requis), price?, notes?, clientEmail?,
//                  paymentUrl?, paymentLabel?, customReminder? }
//        Création d'ACHAT (Task 56) : { purchase: true, domainPrice?,
//        hostingPrice?, hasHosting? } → status PENDING, page de paiement à
//        générer ; renewalDate facultatif (placeholder +1 an, compte à
//        rebours caché jusqu'au paiement).

export const dynamic = "force-dynamic";

/** Parse un corps de requête en champs valides (renvoie une erreur ou null). */
function parseBody(body: Record<string, unknown>, requireAll: boolean, isPurchase = false): { data?: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};

  if (body.domain !== undefined || requireAll) {
    const domain = (body.domain ?? "").toString().trim();
    if (!domain) return { error: "Le nom de domaine est obligatoire" };
    if (domain.length > 253) return { error: "Nom de domaine trop long" };
    data.domain = domain;
  }
  if (body.renewalDate !== undefined || requireAll) {
    const raw = (body.renewalDate ?? "").toString().trim();
    if (!raw && isPurchase) {
      // Achat sans échéance connue (Task 56) : placeholder à +1 an — le vrai
      // compte à rebours ne démarre qu'à la confirmation du paiement.
      data.renewalDate = new Date(Date.now() + 365 * 86_400_000);
    } else {
      const date = new Date(raw);
      if (!raw || Number.isNaN(date.getTime())) {
        return { error: "La date de renouvellement est obligatoire (format valide requis)" };
      }
      data.renewalDate = date;
    }
  }
  if (body.registrar !== undefined) {
    data.registrar = body.registrar.toString().trim().slice(0, 120);
  }
  if (body.clientName !== undefined) {
    data.clientName = body.clientName.toString().trim().slice(0, 160) || null;
  }
  if (body.clientPhone !== undefined) {
    data.clientPhone = body.clientPhone.toString().trim().slice(0, 40) || null;
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return { error: "Le prix annuel doit être un nombre positif" };
    data.price = price;
  }
  // ── Achat de domaine + hébergement (Task 56) ──────────────────────────
  if (body.hasHosting !== undefined) {
    data.hasHosting = body.hasHosting === true || body.hasHosting === "true";
  }
  if (body.domainPrice !== undefined) {
    const p = Number(body.domainPrice);
    if (!Number.isFinite(p) || p < 0) return { error: "Le prix du domaine doit être un nombre positif" };
    data.domainPrice = p;
  }
  if (body.hostingPrice !== undefined) {
    const p = Number(body.hostingPrice);
    if (!Number.isFinite(p) || p < 0) return { error: "Le prix de l'hébergement doit être un nombre positif" };
    data.hostingPrice = p;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes.toString().trim().slice(0, 2000) || null;
  }
  // ── Rappel client + paiement en ligne (Task 49) ───────────────────────
  if (body.clientEmail !== undefined) {
    const email = body.clientEmail.toString().trim().slice(0, 160);
    if (email && !email.includes("@")) return { error: "L'e-mail du client doit contenir un @" };
    data.clientEmail = email || null;
  }
  if (body.paymentUrl !== undefined) {
    const url = body.paymentUrl.toString().trim().slice(0, 500);
    if (url && !/^https?:\/\//i.test(url)) {
      return { error: "Le lien de paiement doit commencer par http:// ou https://" };
    }
    data.paymentUrl = url || null;
  }
  if (body.paymentLabel !== undefined) {
    data.paymentLabel = body.paymentLabel.toString().trim().slice(0, 40) || null;
  }
  if (body.customReminder !== undefined) {
    data.customReminder = body.customReminder.toString().trim().slice(0, 5000) || null;
  }
  return { data };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const [domains, setting, now] = await Promise.all([
      // Achats en attente de paiement (PENDING) d'abord, puis par échéance :
      // les domaines existants (status ACTIVE) gardent leur ordre historique.
      db.hostingDomain.findMany({ orderBy: [{ status: "desc" }, { renewalDate: "asc" }] }),
      db.setting.findFirst(),
      Promise.resolve(new Date()),
    ]);
    return NextResponse.json({
      domains: domains.map((d) => ({
        ...d,
        daysLeft: dakarDaysLeft(d.renewalDate, now),
        // URL de la page publique de renouvellement (null sans jeton actif)
        renewalUrl: renewalPublicUrl(d.renewalToken, setting?.publicBaseUrl),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Chargement impossible" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await request.json();
    // Achat de domaine (+ hébergement) à faire payer (Task 56) : status
    // PENDING — la page de paiement est générée juste après la création.
    const isPurchase = body.purchase === true;
    const { data, error } = parseBody(body, true, isPurchase);
    if (error || !data) return NextResponse.json({ error }, { status: 400 });
    if (isPurchase) {
      data.status = "PENDING";
      // Prix total de l'achat = part domaine + part hébergement (source de
      // vérité pour l'achat — le prix annuel de renouvellement reprend ce
      // total après activation).
      const total =
        (Number(data.domainPrice ?? 0) || 0) + (Number(data.hostingPrice ?? 0) || 0);
      data.price = total;
      if (data.hasHosting === undefined) data.hasHosting = (Number(data.hostingPrice ?? 0) || 0) > 0;
    }
    const domain = await db.hostingDomain.create({
      data: { ...(data as { domain: string; renewalDate: Date }) },
    });
    return NextResponse.json(
      { domain: { ...domain, daysLeft: dakarDaysLeft(domain.renewalDate, new Date()) } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
