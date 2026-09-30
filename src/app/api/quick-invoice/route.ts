import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber, withNumberRetry } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";

// ─── Facturation en 2 clics : pack prédéfini → facture prête en PDF ─────────
// POST { clientId, packId, paymentStatus? } → facture VENTE à partir d'un pack

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json();
    const clientId = (body.clientId ?? "").toString();
    const packId = (body.packId ?? "").toString();
    if (!clientId || !packId) {
      return NextResponse.json({ error: "Client et pack obligatoires" }, { status: 400 });
    }

    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

    const pack = await db.productPack.findUnique({ where: { id: packId } });
    if (!pack || !pack.isActive) {
      return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    }

    const now = new Date();
    const taxRate = 18;
    const totalHT = pack.price;
    const totalTTC = Math.round(totalHT * (1 + taxRate / 100));

    let paymentStatus = body.paymentStatus ?? "NON_PAYE";
    if (!["PAYE", "PARTIEL", "NON_PAYE"].includes(paymentStatus)) paymentStatus = "NON_PAYE";
    const amountPaid = paymentStatus === "PAYE" ? totalTTC : 0;

    const year = now.getFullYear();

    // Numérotation par MAXIMUM existant + relance (P2002)
    const invoice = await withNumberRetry(
      () => generateDocumentNumber("invoice", NUMBER_PREFIXES.VENTE, year, { type: "VENTE" }),
      (number) =>
        db.invoice.create({
      data: {
        number,
        type: "VENTE",
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientAddress: client.address,
        date: now,
        deliveryStatus: "NON_LIVRE",
        paymentStatus,
        amountPaid,
        taxRate,
        totalHT,
        totalTTC,
        notes: `Facture rapide — ${pack.name} (${pack.quantity} unité(s))`,
        items: {
          create: [
            {
              productName: pack.name,
              category: ["QRTAGS", "QRBAGS", "VERIFSCAN"].includes(pack.type) ? pack.type : null,
              unit: "pack",
              quantity: 1,
              unitPrice: totalHT,
              total: totalHT,
            },
          ],
        },
      },
      include: { items: true },
        })
    );

    await logAudit(
      request,
      "CREATE",
      "Invoice",
      invoice.id,
      `${invoice.number} — ${invoice.clientName} — ${invoice.totalTTC} FCFA (pack rapide)`,
    );

    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("[quick-invoice]", err);
    return NextResponse.json({ error: "Génération impossible" }, { status: 500 });
  }
}
