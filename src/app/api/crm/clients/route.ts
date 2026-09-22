import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Clients CRM (base client locale du CRM unifié) ─────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const where = q
      ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }
      : {};

    const clients = await db.crmClient.findMany({
      where,
      include: { items: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        totalItems: c.totalItems,
        status: c.status,
        notes: c.notes,
        createdAt: c.createdAt,
        items: c.items,
      }))
    );
  } catch (error) {
    console.error("GET /api/crm/clients", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Le nom du client est requis" }, { status: 400 });

    const client = await db.crmClient.create({
      data: {
        name,
        email: body.email ? String(body.email).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        status: ["ACTIVE", "INACTIVE"].includes(body.status) ? body.status : "ACTIVE",
        notes: body.notes ? String(body.notes) : null,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/clients", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
