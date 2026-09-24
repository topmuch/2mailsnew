import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { FAVORITE_CATEGORIES, normalizeUrl } from "@/lib/favorites-utils";

// ─── Modification / suppression d'un favori ──────────────────────────────────

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();
    const data: {
      title?: string;
      url?: string;
      description?: string | null;
      category?: string;
      pinned?: boolean;
    } = {};
    if (body.title !== undefined) {
      const title = body.title.toString().trim();
      if (!title) return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
      data.title = title;
    }
    if (body.url !== undefined) {
      const url = normalizeUrl(body.url.toString());
      if (!url) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
      data.url = url;
    }
    if (body.description !== undefined) {
      data.description = body.description.toString().trim() || null;
    }
    if (body.category !== undefined && FAVORITE_CATEGORIES.includes(body.category.toString())) {
      data.category = body.category.toString();
    }
    if (body.pinned !== undefined) data.pinned = Boolean(body.pinned);
    const favorite = await db.favorite.update({ where: { id }, data });
    return NextResponse.json({ favorite });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    await db.favorite.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
