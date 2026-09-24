import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber, withNumberRetry } from "@/lib/numbering";

type Params = { params: Promise<{ id: string }> };

// Convertir un proforma en facture de vente définitive
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const proforma = await db.invoice.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!proforma) {
      return NextResponse.json({ error: "Proforma introuvable" }, { status: 404 });
    }
    if (proforma.type !== "PROFORMA") {
      return NextResponse.json(
        { error: "Seule une facture proforma peut être convertie" },
        { status: 400 }
      );
    }

    const year = new Date().getFullYear();

    // Numérotation par MAXIMUM existant + relance (P2002)
    const result = await withNumberRetry(
      () => generateDocumentNumber("invoice", NUMBER_PREFIXES.VENTE, year, { type: "VENTE" }),
      (number) =>
        db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          number,
          type: "VENTE",
          clientId: proforma.clientId,
          clientName: proforma.clientName,
          clientPhone: proforma.clientPhone,
          clientAddress: proforma.clientAddress,
          date: new Date(),
          dueDate: null,
          deliveryStatus: "NON_LIVRE",
          paymentStatus: "NON_PAYE",
          amountPaid: 0,
          taxRate: proforma.taxRate,
          totalHT: proforma.totalHT,
          totalTTC: proforma.totalTTC,
          notes: `Converti depuis le proforma ${proforma.number}`,
          items: {
            create: proforma.items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              category: i.category,
              unit: i.unit,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.total,
            })),
          },
        },
        include: { items: true },
      });

      // Décrémenter le stock
      for (const item of proforma.items) {
        if (!item.productId) continue;
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: Math.max(0, product.stock - Math.round(item.quantity)) },
        });
      }

      // Marquer le proforma comme converti
      await tx.invoice.update({
        where: { id: proforma.id },
        data: { notes: `${proforma.notes ? proforma.notes + " — " : ""}Converti en facture ${number}` },
      });

      return created;
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices/[id]/convert", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
