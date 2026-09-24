import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "db", "uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const supplierId = request.nextUrl.searchParams.get("supplierId")?.trim() ?? "";

    const where: Record<string, unknown> = {};
    if (supplierId) where.supplierId = supplierId;
    if (q) {
      where.OR = [{ number: { contains: q } }, { supplier: { contains: q } }];
    }

    const purchases = await db.purchase.findMany({
      where,
      include: { items: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error("GET /api/purchases", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    let supplier = (formData.get("supplier")?.toString() ?? "").trim();

    // Fournisseur lié (optionnel) : valide l'existence et déduit le nom si absent
    const supplierId = (formData.get("supplierId")?.toString() ?? "").trim() || null;
    if (supplierId) {
      const linked = await db.supplier.findUnique({ where: { id: supplierId } });
      if (!linked) {
        return NextResponse.json({ error: "Fournisseur invalide" }, { status: 400 });
      }
      if (!supplier) supplier = linked.name;
    }

    if (!supplier) {
      return NextResponse.json({ error: "Le fournisseur est obligatoire" }, { status: 400 });
    }

    let items: { productId?: string | null; productName: string; quantity: number; unitPrice: number }[] = [];
    try {
      const parsed = JSON.parse(formData.get("items")?.toString() ?? "[]");
      items = (Array.isArray(parsed) ? parsed : [])
        .map((it: Record<string, unknown>) => ({
          productId: (it.productId as string) || null,
          productName: ((it.productName as string) ?? "").toString().trim() || "Article",
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
        }))
        .filter((it: { quantity: number }) => it.quantity > 0);
    } catch {
      items = [];
    }

    const total =
      Number(formData.get("total")) ||
      items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    const updateStock = formData.get("updateStock") === "true";

    // Gestion du fichier joint (facture d'achat scannée)
    let fileMeta: { fileName: string | null; fileType: string | null; fileSize: number | null; fileStored: string | null } = {
      fileName: null,
      fileType: null,
      fileSize: null,
      fileStored: null,
    };
    const file = formData.get("file");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const blob = file as File;
      if (blob.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 });
      }
      await mkdir(UPLOAD_DIR, { recursive: true });
      const ext = blob.name.includes(".") ? blob.name.split(".").pop() : "bin";
      const stored = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const buffer = Buffer.from(await blob.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, stored), buffer);
      fileMeta = {
        fileName: blob.name,
        fileType: blob.type || null,
        fileSize: blob.size,
        fileStored: stored,
      };
    }

    const year = new Date().getFullYear();
    // Numérotation par MAXIMUM existant quand aucun numéro n'est saisi
    const providedNumber = formData.get("number")?.toString().trim() || "";
    const number =
      providedNumber || (await generateDocumentNumber("purchase", NUMBER_PREFIXES.ACHAT, year));

    const user = await getAuthUser(request);
    const userName = user?.name ?? null;

    const purchase = await db.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          number,
          supplier,
          supplierId,
          date: formData.get("date") ? new Date(formData.get("date")!.toString()) : new Date(),
          total,
          notes: formData.get("notes")?.toString().trim() || null,
          ...fileMeta,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.quantity * i.unitPrice,
            })),
          },
        },
        include: { items: true },
      });

      if (updateStock) {
        for (const item of items) {
          if (!item.productId) continue;
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;
          const stockAfter = product.stock + Math.round(item.quantity);
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: stockAfter },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: "ENTREE",
              quantity: Math.round(item.quantity),
              stockBefore: product.stock,
              stockAfter,
              reason: null,
              refType: "ACHAT",
              refId: created.id,
              userName,
            },
          });
        }
      }
      return created;
    });

    await logAudit(
      request,
      "CREATE",
      "Purchase",
      purchase.id,
      `${purchase.number} — ${purchase.supplier} — ${purchase.total} FCFA`
    );

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error("POST /api/purchases", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
