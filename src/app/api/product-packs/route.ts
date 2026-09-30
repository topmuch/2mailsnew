import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensureProductPacks } from "@/lib/productivity-defaults";

// ─── Packs prédéfinis pour la facturation en 2 clics ────────────────────────
// GET → liste active (seed des 6 packs par défaut au premier appel)
// POST → création { name, price, quantity, type?, description? }

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await getAuthUser(request);
    await ensureProductPacks();
    const packs = await db.productPack.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { price: "asc" }],
    });
    return NextResponse.json({ packs });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }
    const body = await request.json();
    const name = (body.name ?? "").toString().trim();
    const price = Number(body.price);
    if (!name || !(price > 0)) {
      return NextResponse.json({ error: "Nom et prix valides obligatoires" }, { status: 400 });
    }
    const pack = await db.productPack.create({
      data: {
        name,
        description: (body.description ?? "").toString().trim() || null,
        price,
        quantity: Math.max(1, Math.round(Number(body.quantity) || 1)),
        type: ["QRTAGS", "QRBAGS", "VERIFSCAN", "SUBSCRIPTION", "AUTRE"].includes(body.type) ? body.type : "AUTRE",
      },
    });
    return NextResponse.json({ pack });
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
