import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { FAVORITE_CATEGORIES, normalizeUrl } from "@/lib/favorites-utils";

// ─── Favoris (sauvegarde de liens internet) ──────────────────────────────────
// GET  → liste (épinglés d'abord, puis création récente)
// POST → création { title, url, description?, category?, pinned? }

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const favorites = await db.favorite.findMany({
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ favorites });
  } catch {
    return NextResponse.json({ error: "Chargement impossible" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await request.json();
    const title = (body.title ?? "").toString().trim();
    const url = normalizeUrl((body.url ?? "").toString());
    if (!title || !url) {
      return NextResponse.json(
        { error: "Titre et lien valide (https://…) obligatoires" },
        { status: 400 },
      );
    }
    const description = (body.description ?? "").toString().trim() || null;
    const category = FAVORITE_CATEGORIES.includes((body.category ?? "").toString())
      ? body.category.toString()
      : "GENERAL";
    const pinned = Boolean(body.pinned);
    const favorite = await db.favorite.create({
      data: { title, url, description, category, pinned, author: user.name },
    });
    return NextResponse.json({ favorite }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
