import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── PUT : mise à jour d'un lead (statut pipeline, champs) ───────────────────

const SOURCES = ["QRTAGS", "QRBAGS", "VERIFSCAN", "RECOMMANDATION", "SITE_WEB", "AUTRE"] as const;
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, string | number | null> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 160);
    if (typeof body.company === "string") data.company = body.company.trim().slice(0, 160) || null;
    if (typeof body.email === "string") data.email = body.email.trim().slice(0, 160) || null;
    if (typeof body.phone === "string") data.phone = body.phone.trim().slice(0, 60) || null;
    if ((SOURCES as readonly string[]).includes(body.source)) data.source = body.source;
    if ((STATUSES as readonly string[]).includes(body.status)) data.status = body.status;
    if (body.value !== undefined && Number.isFinite(Number(body.value))) data.value = Math.max(0, Number(body.value));
    if (typeof body.notes === "string") data.notes = body.notes.slice(0, 2000) || null;

    const lead = await db.crmLead.update({ where: { id }, data });
    return NextResponse.json(lead);
  } catch (error) {
    console.error("PUT /api/crm/leads/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── DELETE : suppression d'un lead (admin) ──────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const { id } = await params;
    await db.crmLead.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/leads/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
