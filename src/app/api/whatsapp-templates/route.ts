import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensureWhatsAppTemplates } from "@/lib/productivity-defaults";

// ─── Modèles de messages WhatsApp ────────────────────────────────────────────
// GET  → liste (seed des 3 modèles par défaut au premier appel)
// POST → création { name, content, category? }

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await getAuthUser(request);
    await ensureWhatsAppTemplates();
    const templates = await db.whatsAppTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await request.json();
    const name = (body.name ?? "").toString().trim();
    const content = (body.content ?? "").toString().trim();
    if (!name || !content) {
      return NextResponse.json({ error: "Nom et contenu obligatoires" }, { status: 400 });
    }
    const category = ["RELANCE", "PROPOSITION", "SUPPORT", "AUTRE"].includes(
      (body.category ?? "").toString(),
    )
      ? body.category.toString()
      : "AUTRE";
    const template = await db.whatsAppTemplate.create({ data: { name, content, category } });
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
