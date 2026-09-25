import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { dakarDaysLeft } from "@/lib/hosting-notify";

// ─── Hosting : noms de domaine achetés & renouvellements (Task 46-d) ─────────
// GET  → liste triée par renewalDate asc + daysLeft (jours calendaires Dakar)
// POST → création { domain (requis), registrar?, clientName?, clientPhone?,
//                  renewalDate (requis), price?, notes? }

export const dynamic = "force-dynamic";

/** Parse un corps de requête en champs valides (renvoie une erreur ou null). */
function parseBody(body: Record<string, unknown>, requireAll: boolean): { data?: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};

  if (body.domain !== undefined || requireAll) {
    const domain = (body.domain ?? "").toString().trim();
    if (!domain) return { error: "Le nom de domaine est obligatoire" };
    if (domain.length > 253) return { error: "Nom de domaine trop long" };
    data.domain = domain;
  }
  if (body.renewalDate !== undefined || requireAll) {
    const raw = (body.renewalDate ?? "").toString().trim();
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) {
      return { error: "La date de renouvellement est obligatoire (format valide requis)" };
    }
    data.renewalDate = date;
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
  if (body.notes !== undefined) {
    data.notes = body.notes.toString().trim().slice(0, 2000) || null;
  }
  return { data };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const [domains, now] = await Promise.all([
      db.hostingDomain.findMany({ orderBy: { renewalDate: "asc" } }),
      Promise.resolve(new Date()),
    ]);
    return NextResponse.json({
      domains: domains.map((d) => ({ ...d, daysLeft: dakarDaysLeft(d.renewalDate, now) })),
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
    const { data, error } = parseBody(body, true);
    if (error || !data) return NextResponse.json({ error }, { status: 400 });
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
