import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { sharedDocUrl } from "@/lib/doc-share";

// ─── Partage externe d'un document (URL publique téléchargeable) ─────────────
// GET    → état du partage (URL publique si active, PDF prêt ou non)
// POST   → activer / mettre à jour { pdfBase64?, rotate? }
//          pdfBase64 = instantané PDF généré par le navigateur (papier en-tête
//          logo) stocké en base puis servi tel quel au destinataire
//          rotate = true → régénère le jeton (les anciens liens meurent)
// DELETE → désactiver le lien public (le destinataire voit « lien invalide »)

export const dynamic = "force-dynamic";

// Garde-fou taille : un PDF A4 de notre pipeline fait < 2 Mo ; on accepte
// jusqu'à ~9 Mo binaires (12 M caractères base64) par sécurité.
const MAX_PDF_BASE64 = 12_000_000;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const doc = await db.crmDocument.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    return NextResponse.json({
      shared: !!doc.shareToken,
      url: doc.shareToken ? sharedDocUrl(request, doc.shareToken) : null,
      pdfReady: !!doc.sharedPdf,
      sharedPdfAt: doc.sharedPdfAt ? doc.sharedPdfAt.toISOString() : null,
    });
  } catch {
    return NextResponse.json({ error: "Vérification du partage impossible" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const doc = await db.crmDocument.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

    let pdfBase64: string | null = null;
    let rotate = false;
    try {
      const body = await request.json();
      pdfBase64 =
        typeof body?.pdfBase64 === "string" && body.pdfBase64.length > 0 ? body.pdfBase64 : null;
      rotate = !!body?.rotate;
    } catch {
      // corps vide accepté (activation sans instantané)
    }
    if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64) {
      return NextResponse.json({ error: "PDF trop volumineux (> 9 Mo)" }, { status: 413 });
    }

    const token = rotate || !doc.shareToken ? randomBytes(16).toString("hex") : doc.shareToken;
    const updated = await db.crmDocument.update({
      where: { id },
      data: {
        shareToken: token,
        ...(pdfBase64
          ? { sharedPdf: Buffer.from(pdfBase64, "base64"), sharedPdfAt: new Date() }
          : {}),
      },
    });
    return NextResponse.json({
      shared: true,
      url: sharedDocUrl(request, token),
      pdfReady: !!updated.sharedPdf,
      sharedPdfAt: updated.sharedPdfAt ? updated.sharedPdfAt.toISOString() : null,
    });
  } catch {
    return NextResponse.json({ error: "Partage impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    await db.crmDocument.update({
      where: { id },
      data: { shareToken: null, sharedPdf: null, sharedPdfAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Désactivation impossible" }, { status: 500 });
  }
}
