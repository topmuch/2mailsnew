import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Modification / suppression d'un modèle WhatsApp ─────────────────────────

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();
    const data: { name?: string; content?: string; category?: string; isActive?: boolean } = {};
    if (body.name !== undefined) data.name = body.name.toString().trim();
    if (body.content !== undefined) data.content = body.content.toString().trim();
    if (body.category !== undefined && ["RELANCE", "PROPOSITION", "SUPPORT", "AUTRE"].includes(body.category)) {
      data.category = body.category;
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    const template = await db.whatsAppTemplate.update({ where: { id }, data });
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }
    const { id } = await ctx.params;
    await db.whatsAppTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
