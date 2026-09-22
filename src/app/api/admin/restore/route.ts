import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * POST /api/admin/restore (réservé ADMIN)
 * Restaure une sauvegarde complète (même structure que GET /api/admin/backup).
 * Purge puis recréation transactionnelle, dans le respect des clés étrangères.
 * Les IDs d'origine sont conservés. La table users n'est jamais restaurée
 * (les comptes existants sont conservés).
 */

type Row = Record<string, unknown>;

// Champs attendus par table — filtre défensif contre les champs obsolètes
// d'anciennes versions de sauvegarde.
const CLIENT_FIELDS = ["id", "name", "phone", "email", "address", "type", "creditLimit", "notes", "createdAt"];
const CATEGORY_FIELDS = ["id", "code", "label", "createdAt"];
const PRODUCT_FIELDS = ["id", "name", "reference", "category", "image", "purchasePrice", "salePrice", "stock", "unit", "minStock", "createdAt"];
const SUPPLIER_FIELDS = ["id", "name", "phone", "email", "address", "notes", "createdAt"];
const PURCHASE_FIELDS = ["id", "number", "supplier", "supplierId", "date", "total", "fileName", "fileType", "fileSize", "fileStored", "notes", "createdAt"];
const PURCHASE_ITEM_FIELDS = ["id", "purchaseId", "productId", "productName", "quantity", "unitPrice", "total"];
const INVOICE_FIELDS = ["id", "number", "type", "clientId", "clientName", "clientPhone", "clientAddress", "date", "dueDate", "deliveryStatus", "paymentStatus", "amountPaid", "taxRate", "totalHT", "totalTTC", "notes", "createdAt"];
const INVOICE_ITEM_FIELDS = ["id", "invoiceId", "productId", "productName", "category", "unit", "quantity", "unitPrice", "total", "purchasePrice"];
const PAYMENT_FIELDS = ["id", "invoiceId", "amount", "method", "paidAt", "note", "createdAt"];
const ORDER_FIELDS = ["id", "number", "clientId", "clientName", "date", "deliveryDate", "status", "notes", "createdAt"];
const ORDER_ITEM_FIELDS = ["id", "orderId", "productId", "productName", "category", "unit", "quantity", "unitPrice", "total"];
const SETTING_FIELDS = ["id", "nomSociete", "tagline", "adresse", "telephone", "email", "rc", "ninea", "logo", "updatedAt"];

/** Ne garde que les champs connus d'une liste de lignes JSON. */
function sanitize(rows: unknown, fields: string[]): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Row => typeof r === "object" && r !== null && !Array.isArray(r))
    .map((r) => {
      const out: Row = {};
      for (const f of fields) {
        if (r[f] !== undefined) out[f] = r[f];
      }
      return out;
    });
}

/** Extrait les tables imbriquées (items, payments, rents…) des lignes parentes. */
function nested(rows: unknown, key: string): unknown[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) =>
    r && typeof r === "object" && !Array.isArray(r) && Array.isArray((r as Row)[key])
      ? ((r as Row)[key] as unknown[])
      : []
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Fichier de sauvegarde invalide" }, { status: 400 });
    }

    const data: unknown =
      body && typeof body === "object" && !Array.isArray(body) ? (body as Row).data : undefined;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return NextResponse.json({ error: "Fichier de sauvegarde invalide" }, { status: 400 });
    }
    const d = data as Row;

    // Tables de premier niveau
    const clients = sanitize(d.clients, CLIENT_FIELDS) as unknown as Prisma.ClientCreateManyInput[];
    const categories = sanitize(d.categories, CATEGORY_FIELDS) as unknown as Prisma.CategoryCreateManyInput[];
    const products = sanitize(d.products, PRODUCT_FIELDS) as unknown as Prisma.ProductCreateManyInput[];
    const suppliers = sanitize(d.suppliers, SUPPLIER_FIELDS) as unknown as Prisma.SupplierCreateManyInput[];
    const settings = sanitize(d.settings, SETTING_FIELDS) as unknown as Prisma.SettingCreateManyInput[];

    // Tables imbriquées (structure identique au backup)
    const purchases = sanitize(d.purchases, PURCHASE_FIELDS) as unknown as Prisma.PurchaseCreateManyInput[];
    const purchaseItems = sanitize(
      nested(d.purchases, "items"),
      PURCHASE_ITEM_FIELDS
    ) as unknown as Prisma.PurchaseItemCreateManyInput[];

    const invoices = sanitize(d.invoices, INVOICE_FIELDS) as unknown as Prisma.InvoiceCreateManyInput[];
    const invoiceItems = sanitize(
      nested(d.invoices, "items"),
      INVOICE_ITEM_FIELDS
    ) as unknown as Prisma.InvoiceItemCreateManyInput[];
    const payments = sanitize(
      nested(d.invoices, "payments"),
      PAYMENT_FIELDS
    ) as unknown as Prisma.PaymentCreateManyInput[];

    const orders = sanitize(d.orders, ORDER_FIELDS) as unknown as Prisma.OrderCreateManyInput[];
    const orderItems = sanitize(
      nested(d.orders, "items"),
      ORDER_ITEM_FIELDS
    ) as unknown as Prisma.OrderItemCreateManyInput[];

    const restored = await db.$transaction(async (tx) => {
      // 1) Purge complète, dans l'ordre des dépendances (enfants d'abord)
      await tx.payment.deleteMany();
      await tx.invoiceItem.deleteMany();
      await tx.invoice.deleteMany();
      await tx.purchaseItem.deleteMany();
      await tx.purchase.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.supplier.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.client.deleteMany();
      await tx.setting.deleteMany();

      // 2) Recréation avec les IDs d'origine (parents d'abord)
      const counts: Record<string, number> = {};
      counts.clients = clients.length ? (await tx.client.createMany({ data: clients })).count : 0;
      counts.categories = categories.length ? (await tx.category.createMany({ data: categories })).count : 0;
      counts.products = products.length ? (await tx.product.createMany({ data: products })).count : 0;
      counts.suppliers = suppliers.length ? (await tx.supplier.createMany({ data: suppliers })).count : 0;
      counts.purchases = purchases.length ? (await tx.purchase.createMany({ data: purchases })).count : 0;
      counts.purchaseItems = purchaseItems.length
        ? (await tx.purchaseItem.createMany({ data: purchaseItems })).count
        : 0;
      counts.invoices = invoices.length ? (await tx.invoice.createMany({ data: invoices })).count : 0;
      counts.invoiceItems = invoiceItems.length
        ? (await tx.invoiceItem.createMany({ data: invoiceItems })).count
        : 0;
      counts.payments = payments.length ? (await tx.payment.createMany({ data: payments })).count : 0;
      counts.orders = orders.length ? (await tx.order.createMany({ data: orders })).count : 0;
      counts.orderItems = orderItems.length
        ? (await tx.orderItem.createMany({ data: orderItems })).count
        : 0;
      // Paramètres : recréés seulement si la sauvegarde en contient
      counts.settings = settings.length ? (await tx.setting.createMany({ data: settings })).count : 0;
      // users : volontairement non restaurée (comptes conservés)

      return counts;
    });

    return NextResponse.json({ restored, note: "Comptes utilisateurs conservés" });
  } catch (error) {
    console.error("POST /api/admin/restore", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
