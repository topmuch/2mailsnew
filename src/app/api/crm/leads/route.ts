import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── GET : liste des leads (pipeline commercial) ─────────────────────────────

const SOURCES = ["QRTAGS", "QRBAGS", "VERIFSCAN", "RECOMMANDATION", "SITE_WEB", "AUTRE"] as const;
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const q = (searchParams.get("q") ?? "").trim();

    const where: {
      status?: string;
      OR?: Array<{ name: { contains: string } } | { company: { contains: string } } | { email: { contains: string } } | { phone: { contains: string } }>;
    } = {};
    if ((STATUSES as readonly string[]).includes(status)) where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { company: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const leads = await db.crmLead.findMany({ where, orderBy: { updatedAt: "desc" }, take: 500 });

    const counts = Object.fromEntries(
      STATUSES.map((s) => [s, leads.filter((l) => l.status === s).length]),
    ) as Record<string, number>;

    const wonValue = leads
      .filter((l) => l.status === "WON")
      .reduce((sum, l) => sum + (l.value ?? 0), 0);
    const pipelineValue = leads
      .filter((l) => !["WON", "LOST"].includes(l.status))
      .reduce((sum, l) => sum + (l.value ?? 0), 0);

    return NextResponse.json({ leads, counts, wonValue, pipelineValue });
  } catch (error) {
    console.error("GET /api/crm/leads", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : création d'un lead ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Le nom du lead est requis" }, { status: 400 });

    const lead = await db.crmLead.create({
      data: {
        name: name.slice(0, 160),
        company: body.company ? String(body.company).trim().slice(0, 160) : null,
        email: body.email ? String(body.email).trim().slice(0, 160) : null,
        phone: body.phone ? String(body.phone).trim().slice(0, 60) : null,
        source: (SOURCES as readonly string[]).includes(body.source) ? body.source : "AUTRE",
        status: (STATUSES as readonly string[]).includes(body.status) ? body.status : "NEW",
        value: Number.isFinite(Number(body.value)) ? Math.max(0, Number(body.value)) : 0,
        notes: body.notes ? String(body.notes).slice(0, 2000) : null,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/leads", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
