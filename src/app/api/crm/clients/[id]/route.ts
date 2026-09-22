import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Client CRM : modification / suppression ────────────────────────────────

async function getCrmClient(id: string) {
  return db.crmClient.findUnique({ where: { id } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const existing = await getCrmClient(id);
    if (!existing) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const client = await db.crmClient.update({
      where: { id },
      data: {
        name: body.name != null ? String(body.name).trim() : existing.name,
        email: body.email !== undefined ? (body.email ? String(body.email).trim() : null) : existing.email,
        phone: body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : existing.phone,
        status: ["ACTIVE", "INACTIVE"].includes(body.status) ? body.status : existing.status,
        notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : existing.notes,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    console.error("PUT /api/crm/clients/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAuthUser(request);
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await getCrmClient(id);
    if (!existing) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

    // Détache les items liés avant suppression
    await db.crmItem.updateMany({ where: { clientId: id }, data: { clientId: null } });
    await db.crmClient.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/clients/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
