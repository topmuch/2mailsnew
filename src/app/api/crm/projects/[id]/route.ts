import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── PUT : mise à jour d'un projet ───────────────────────────────────────────

const STATUSES = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, string | number | Date | null> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 200);
    if (typeof body.description === "string") data.description = body.description.slice(0, 2000) || null;
    if (body.clientId === "" || body.clientId === null) data.clientId = null;
    else if (typeof body.clientId === "string") data.clientId = body.clientId;
    if ((STATUSES as readonly string[]).includes(body.status)) data.status = body.status;
    if (body.budget !== undefined && Number.isFinite(Number(body.budget))) data.budget = Math.max(0, Number(body.budget));
    if (body.startDate === null || body.startDate === "") data.startDate = null;
    else if (body.startDate) data.startDate = new Date(body.startDate);
    if (body.endDate === null || body.endDate === "") data.endDate = null;
    else if (body.endDate) data.endDate = new Date(body.endDate);
    if (body.progress !== undefined) data.progress = Math.min(100, Math.max(0, parseInt(body.progress, 10) || 0));

    const project = await db.crmProject.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(project);
  } catch (error) {
    console.error("PUT /api/crm/projects/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── DELETE : suppression d'un projet (admin) ────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const { id } = await params;
    await db.crmProject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/projects/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
