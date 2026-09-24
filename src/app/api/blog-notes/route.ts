import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Blog note (notes riches de l'équipe) ────────────────────────────────────
// GET  → liste (épinglées d'abord, puis mises à jour récemment)
// POST → création { title, content?, tags?, color?, pinned? }

export const dynamic = "force-dynamic";

const COLORS = ["blue", "green", "amber", "red", "purple"];

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const notes = await db.blogPost.findMany({
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ notes });
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
    if (!title) {
      return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
    }
    const content = (body.content ?? "").toString();
    const tags = (body.tags ?? "")
      .toString()
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean)
      .join(", ");
    const color = COLORS.includes((body.color ?? "").toString()) ? body.color.toString() : "blue";
    const pinned = Boolean(body.pinned);
    const note = await db.blogPost.create({
      data: { title, content, tags, color, pinned, author: user.name },
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
