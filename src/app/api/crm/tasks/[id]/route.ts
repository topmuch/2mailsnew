import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── PUT : mise à jour d'une tâche (statut, priorité, champs) ────────────────

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, string | Date | null> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
    if (typeof body.description === "string") data.description = body.description.slice(0, 2000);
    if (body.dueDate === null || body.dueDate === "") data.dueDate = null;
    else if (body.dueDate) data.dueDate = new Date(body.dueDate);
    if (["TODO", "IN_PROGRESS", "DONE"].includes(body.status)) data.status = body.status;
    if (["LOW", "MEDIUM", "HIGH"].includes(body.priority)) data.priority = body.priority;

    const task = await db.crmTask.update({ where: { id }, data });
    return NextResponse.json(task);
  } catch (error) {
    console.error("PUT /api/crm/tasks/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── DELETE : suppression d'une tâche (admin) ────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const { id } = await params;
    await db.crmTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/tasks/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
