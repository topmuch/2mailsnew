import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// ─── Ajout rapide flottant : Client | Tâche | RDV | Note ────────────────────
// POST { type: "CLIENT" | "TASK" | "EVENT" | "NOTE", ...champs }
// GET  ?notes=1 → 10 dernières notes
// DELETE ?id=…&type=NOTE → supprime une note

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await request.json();
    const type = String(body.type ?? "").toUpperCase();
    const str = (v: unknown) => (v ?? "").toString().trim();

    if (type === "CLIENT") {
      const name = str(body.name);
      if (!name) return NextResponse.json({ error: "Le nom est obligatoire" }, { status: 400 });
      const client = await db.client.create({
        data: {
          name,
          email: str(body.email) || null,
          phone: str(body.phone) || null,
          address: str(body.company) || null,
        },
      });
      await logAudit(request, "CREATE", "Client", client.id, name);
      return NextResponse.json({ ok: true, id: client.id, message: `Client « ${name} » créé` });
    }

    if (type === "TASK") {
      const title = str(body.title);
      if (!title) return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
      const priority = ["LOW", "MEDIUM", "HIGH"].includes(str(body.priority)) ? str(body.priority) : "MEDIUM";
      const task = await db.crmTask.create({
        data: {
          title,
          description: str(body.description) || null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          priority,
          status: "TODO",
        },
      });
      await logAudit(request, "CREATE", "CrmTask", task.id, title);
      return NextResponse.json({ ok: true, id: task.id, message: `Tâche « ${title} » créée` });
    }

    if (type === "EVENT") {
      const title = str(body.title);
      if (!title || !body.date) {
        return NextResponse.json({ error: "Titre et date sont obligatoires" }, { status: 400 });
      }
      const d = new Date(body.date);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Date invalide" }, { status: 400 });
      }
      const event = await db.calendarEvent.create({
        data: {
          title,
          date: d,
          startTime: str(body.startTime) || null,
          endTime: str(body.endTime) || null,
          description: str(body.location) || null,
          color: "gold",
          type: "RDV",
        },
      });
      await logAudit(request, "CREATE", "CalendarEvent", event.id, title);
      return NextResponse.json({ ok: true, id: event.id, message: `RDV « ${title} » créé` });
    }

    if (type === "NOTE") {
      const content = str(body.content);
      if (!content) return NextResponse.json({ error: "La note est vide" }, { status: 400 });
      const note = await db.note.create({
        data: { content, author: user.name },
      });
      return NextResponse.json({ ok: true, id: note.id, message: "Note enregistrée" });
    }

    return NextResponse.json({ error: "Type inconnu" }, { status: 400 });
  } catch (err) {
    console.error("[quick-add POST]", err);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await getAuthUser(request);
    const notes = await db.note.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
    await db.note.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
