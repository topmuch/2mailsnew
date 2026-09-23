import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── GET : liste des tâches CRM (filtres statut / priorité / q) ──────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const priority = searchParams.get("priority") ?? "";

    const where: Record<string, string> = {};
    if (["TODO", "IN_PROGRESS", "DONE"].includes(status)) where.status = status;
    if (["LOW", "MEDIUM", "HIGH"].includes(priority)) where.priority = priority;

    const tasks = await db.crmTask.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 300,
    });

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return NextResponse.json({
      tasks,
      counts: {
        todo: tasks.filter((t) => t.status === "TODO").length,
        inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
        done: tasks.filter((t) => t.status === "DONE").length,
        late: tasks.filter(
          (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < dayStart,
        ).length,
      },
    });
  } catch (error) {
    console.error("GET /api/crm/tasks", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : création d'une tâche ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Le titre de la tâche est requis" }, { status: 400 });

    const task = await db.crmTask.create({
      data: {
        title: title.slice(0, 200),
        description: body.description ? String(body.description).slice(0, 2000) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: ["TODO", "IN_PROGRESS", "DONE"].includes(body.status) ? body.status : "TODO",
        priority: ["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : "MEDIUM",
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/tasks", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
