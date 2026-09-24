import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber, withNumberRetry } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";

interface IncomingItem {
  productId?: string | null;
  productName: string;
  category?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
}

function parseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      return {
        productId: it.productId || null,
        productName: (it.productName ?? "").toString().trim() || "Article",
        category: it.category || null,
        unit: it.unit?.toString().trim() || "pièce",
        quantity,
        unitPrice,
      };
    })
    .filter((it) => it.quantity > 0);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type")?.trim() ?? "";
    const q = params.get("q")?.trim() ?? "";
    const payment = params.get("payment")?.trim() ?? "";
    const delivery = params.get("delivery")?.trim() ?? "";
    const from = params.get("from")?.trim() ?? "";
    const to = params.get("to")?.trim() ?? "";
    const minAmount = params.get("minAmount")?.trim() ?? "";
    const maxAmount = params.get("maxAmount")?.trim() ?? "";
    const clientId = params.get("clientId")?.trim() ?? "";

    const where: Record<string, unknown> = {};
    if (type === "VENTE" || type === "PROFORMA") where.type = type;
    if (clientId) where.clientId = clientId;
    if (payment === "PAYE" || payment === "NON_PAYE" || payment === "PARTIEL")
      where.paymentStatus = payment;
    if (delivery === "LIVRE" || delivery === "NON_LIVRE") where.deliveryStatus = delivery;

    if (q) {
      where.OR = [
        { number: { contains: q } },
        { clientName: { contains: q } },
        { notes: { contains: q } },
      ];
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) dateFilter.lte = new Date(`${to}T23:59:59.999Z`);
      where.date = dateFilter;
    }
    const amountFilter: Record<string, number> = {};
    if (minAmount && !Number.isNaN(Number(minAmount))) amountFilter.gte = Number(minAmount);
    if (maxAmount && !Number.isNaN(Number(maxAmount))) amountFilter.lte = Number(maxAmount);
    if (Object.keys(amountFilter).length > 0) where.totalTTC = amountFilter;

    const invoices = await db.invoice.findMany({
      where,
      include: { items: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === "PROFORMA" ? "PROFORMA" : "VENTE";
    const items = parseItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: "Ajoutez au moins un article" }, { status: 400 });
    }

    const totalHT = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxRate = Number(body.taxRate) || 0;
    const totalTTC = Math.round(totalHT * (1 + taxRate / 100));

    let paymentStatus = body.paymentStatus ?? "NON_PAYE";
    if (!["PAYE", "PARTIEL", "NON_PAYE"].includes(paymentStatus)) paymentStatus = "NON_PAYE";
    let amountPaid = Number(body.amountPaid) || 0;
    if (paymentStatus === "PAYE") amountPaid = totalTTC;
    if (paymentStatus === "NON_PAYE") amountPaid = 0;
    if (amountPaid > totalTTC) amountPaid = totalTTC;
    if (paymentStatus === "PARTIEL" && amountPaid <= 0) amountPaid = 0;

    const deliveryStatus = body.deliveryStatus === "LIVRE" ? "LIVRE" : "NON_LIVRE";
    const updateStock = type === "VENTE" && body.updateStock !== false;

    const year = new Date().getFullYear();
    const prefix = NUMBER_PREFIXES[type];

    const user = await getAuthUser(request);
    const userName = user?.name ?? null;

    // Numérotation par MAXIMUM existant + relance automatique en cas de
    // collision (P2002) — plus d'« erreur serveur » après suppression de factures.
    const invoice = await withNumberRetry(
      () => generateDocumentNumber("invoice", prefix, year, { type }),
      (number) =>
        db.$transaction(async (tx) => {
      // Lire les produits AVANT décrément (snapshot prix d'achat + stock avant)
      const productMap = new Map<string, { purchasePrice: number; stock: number }>();
      for (const item of items) {
        if (!item.productId || productMap.has(item.productId)) continue;
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          productMap.set(item.productId, {
            purchasePrice: product.purchasePrice,
            stock: product.stock,
          });
        }
      }

      const created = await tx.invoice.create({
        data: {
          number,
          type,
          clientId: body.clientId || null,
          clientName: (body.clientName ?? "").toString().trim(),
          clientPhone: body.clientPhone?.toString().trim() || null,
          clientAddress: body.clientAddress?.toString().trim() || null,
          date: body.date ? new Date(body.date) : new Date(),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          deliveryStatus,
          paymentStatus,
          amountPaid,
          taxRate,
          totalHT,
          totalTTC,
          notes: body.notes?.toString().trim() || null,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              category: i.category,
              unit: i.unit,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.quantity * i.unitPrice,
              purchasePrice: i.productId
                ? (productMap.get(i.productId)?.purchasePrice ?? null)
                : null,
            })),
          },
        },
        include: { items: true },
      });

      if (updateStock) {
        for (const item of items) {
          if (!item.productId) continue;
          const product = productMap.get(item.productId);
          if (!product) continue;
          const stockAfter = Math.max(0, product.stock - Math.round(item.quantity));
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: stockAfter },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: "SORTIE",
              quantity: Math.round(item.quantity),
              stockBefore: product.stock,
              stockAfter,
              reason: null,
              refType: "VENTE",
              refId: created.id,
              userName,
            },
          });
        }
      }
      return created;
      })
    );

    await logAudit(
      request,
      "CREATE",
      "Invoice",
      invoice.id,
      `${invoice.number} — ${invoice.clientName} — ${invoice.totalTTC} FCFA`
    );

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
