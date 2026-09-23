import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── GET : liste des projets ─────────────────────────────────────────────────

const STATUSES = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const q = (searchParams.get("q") ?? "").trim();

    const where: {
      status?: string;
      OR?: Array<{ name: { contains: string } } | { description: { contains: string } }>;
    } = {};
    if ((STATUSES as readonly string[]).includes(status)) where.status = status;
    if (q) {
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const projects = await db.crmProject.findMany({
      where,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    const counts = Object.fromEntries(
      STATUSES.map((s) => [s, projects.filter((p) => p.status === s).length]),
    ) as Record<string, number>;

    return NextResponse.json({ projects, counts });
  } catch (error) {
    console.error("GET /api/crm/projects", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : création d'un projet ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Le nom du projet est requis" }, { status: 400 });

    const progress = Math.min(100, Math.max(0, parseInt(body.progress ?? "0", 10) || 0));

    const project = await db.crmProject.create({
      data: {
        name: name.slice(0, 200),
        description: body.description ? String(body.description).slice(0, 2000) : null,
        clientId: body.clientId ? String(body.clientId) : null,
        status: (STATUSES as readonly string[]).includes(body.status) ? body.status : "PLANNING",
        budget: Number.isFinite(Number(body.budget)) ? Math.max(0, Number(body.budget)) : 0,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        progress,
      },
      include: { client: { select: { id: true, name: true } } },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/projects", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
