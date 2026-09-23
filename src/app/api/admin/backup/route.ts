import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/admin/backup (réservé ADMIN)
 * Exporte l'intégralité des données métier dans un fichier JSON téléchargeable.
 * Les mots de passe des utilisateurs ne sont jamais inclus.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const [clients, categories, products, invoices, purchases, orders, suppliers, settings, users] =
      await Promise.all([
        db.client.findMany({ orderBy: { createdAt: "asc" } }),
        db.category.findMany({ orderBy: { code: "asc" } }),
        db.product.findMany({ orderBy: { name: "asc" } }),
        db.invoice.findMany({
          include: { items: true, payments: true },
          orderBy: { date: "desc" },
        }),
        db.purchase.findMany({ include: { items: true }, orderBy: { date: "desc" } }),
        db.order.findMany({ include: { items: true }, orderBy: { date: "desc" } }),
        db.supplier.findMany({ orderBy: { name: "asc" } }),
        db.setting.findMany(),
        db.user.findMany({
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            actif: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

    const data = {
      clients,
      categories,
      products,
      invoices,
      purchases,
      orders,
      suppliers,
      settings,
      users, // sans le champ password
    };

    const counts = {
      clients: data.clients.length,
      categories: data.categories.length,
      products: data.products.length,
      invoices: data.invoices.length,
      invoiceItems: data.invoices.reduce((s, f) => s + f.items.length, 0),
      payments: data.invoices.reduce((s, f) => s + f.payments.length, 0),
      purchases: data.purchases.length,
      purchaseItems: data.purchases.reduce((s, a) => s + a.items.length, 0),
      orders: data.orders.length,
      orderItems: data.orders.reduce((s, c) => s + c.items.length, 0),
      suppliers: data.suppliers.length,
      settings: data.settings.length,
      users: data.users.length,
    };

    const exportedAt = new Date().toISOString();
    const backup = {
      version: 1,
      exportedAt,
      app: "2MAILS — Sauvegarde",
      counts,
      data,
    };

    const date = exportedAt.slice(0, 10); // AAAA-MM-JJ
    return NextResponse.json(backup, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="sauvegarde-2mails-${date}.json"`,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/backup", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
