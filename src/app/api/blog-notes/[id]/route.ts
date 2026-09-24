import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Modification / suppression d'une note du blog ───────────────────────────
// PUT    → mise à jour (espace partagé : tout le monde peut éditer)
// DELETE → suppression (auteur ou administrateur)

export const dynamic = "force-dynamic";

const COLORS = ["blue", "green", "amber", "red", "purple"];

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();
    const data: {
      title?: string;
      content?: string;
      tags?: string;
      color?: string;
      pinned?: boolean;
    } = {};
    if (body.title !== undefined) {
      const title = body.title.toString().trim();
      if (!title) return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
      data.title = title;
    }
    if (body.content !== undefined) data.content = body.content.toString();
    if (body.tags !== undefined) {
      data.tags = body.tags
        .toString()
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
        .join(", ");
    }
    if (body.color !== undefined && COLORS.includes(body.color.toString())) {
      data.color = body.color.toString();
    }
    if (body.pinned !== undefined) data.pinned = Boolean(body.pinned);
    const note = await db.blogPost.update({ where: { id }, data });
    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const note = await db.blogPost.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
    // Espace partagé : l'auteur peut supprimer sa note, l'admin n'importe laquelle
    if (note.author !== user.name && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul l'auteur de la note ou l'administrateur peut la supprimer" },
        { status: 403 },
      );
    }
    await db.blogPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
