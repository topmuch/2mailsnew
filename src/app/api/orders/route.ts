import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber, withNumberRetry } from "@/lib/numbering";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim() ?? "";
    const status = params.get("status")?.trim() ?? "";

    const where: Record<string, unknown> = {};
    if (status && ["EN_COURS", "CONFIRMEE", "LIVREE", "ANNULEE"].includes(status)) {
      where.status = status;
    }
    if (q) {
      where.OR = [{ number: { contains: q } }, { clientName: { contains: q } }];
    }

    const orders = await db.order.findMany({
      where,
      include: { items: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error("GET /api/orders", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((it: Record<string, unknown>) => {
        const quantity = Number(it.quantity) || 0;
        const unitPrice = Number(it.unitPrice) || 0;
        return {
          productId: (it.productId as string) || null,
          productName: ((it.productName as string) ?? "").toString().trim() || "Article",
          category: (it.category as string) || null,
          unit: ((it.unit as string) ?? "pièce").toString().trim(),
          quantity,
          unitPrice,
        };
      })
      .filter((it: { quantity: number }) => it.quantity > 0);

    if (items.length === 0) {
      return NextResponse.json({ error: "Ajoutez au moins un article" }, { status: 400 });
    }

    const year = new Date().getFullYear();

    const status = ["EN_COURS", "CONFIRMEE", "LIVREE", "ANNULEE"].includes(body.status)
      ? body.status
      : "EN_COURS";

    // Numérotation par MAXIMUM existant + relance (P2002) — plus de collision
    // après suppression d'une commande.
    const order = await withNumberRetry(
      () => generateDocumentNumber("order", NUMBER_PREFIXES.COMMANDE, year),
      (number) =>
        db.order.create({
      data: {
        number,
        clientId: body.clientId || null,
        clientName: (body.clientName ?? "").toString().trim(),
        date: body.date ? new Date(body.date) : new Date(),
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        status,
        notes: body.notes?.toString().trim() || null,
        items: {
          create: items.map((i: (typeof items)[number]) => ({
            productId: i.productId,
            productName: i.productName,
            category: i.category,
            unit: i.unit,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.quantity * i.unitPrice,
          })),
        },
      },
      include: { items: true },
        })
    );
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
