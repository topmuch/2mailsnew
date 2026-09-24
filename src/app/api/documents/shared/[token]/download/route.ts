import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildDocxBuffer, type CompanyInfo } from "@/lib/docx-export";
import { publicBaseUrl, safeDocFilename } from "@/lib/doc-share";

// ─── Téléchargement public d'un document partagé (SANS authentification) ─────
// GET ?format=pdf  → l'instantané PDF stocké lors de l'activation du lien
//                    (papier en-tête logo). Si absent → redirection vers la
//                    page publique (Word + impression restent disponibles).
// GET ?format=docx → Word généré à la volée (même moteur que l'export interne)

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return NextResponse.json({ error: "Lien invalide ou désactivé" }, { status: 404 });
    }
    const doc = await db.crmDocument.findUnique({ where: { shareToken: token } });
    if (!doc) {
      return NextResponse.json({ error: "Lien invalide ou désactivé" }, { status: 404 });
    }

    const format = (new URL(request.url).searchParams.get("format") ?? "pdf").toLowerCase();

    // ── Word : généré en direct avec les coordonnées société ──────────────────
    if (format === "docx") {
      const setting = await db.setting.findUnique({ where: { id: "main" } });
      const company: CompanyInfo = {
        nomSociete: setting?.nomSociete || "2MAILS",
        tagline: setting?.tagline,
        adresse: setting?.adresse,
        telephone: setting?.telephone,
        email: setting?.email,
        rc: setting?.rc,
        ninea: setting?.ninea,
        logo: setting?.logo,
      };
      const buffer = await buildDocxBuffer({
        title: doc.title,
        html: doc.content,
        company,
        author: doc.author,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeDocFilename(doc.title, "docx")}"; filename*=UTF-8''${encodeURIComponent(safeDocFilename(doc.title, "docx"))}`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ── PDF : instantané exact capturé à l'activation du lien ─────────────────
    if (doc.sharedPdf && doc.sharedPdf.byteLength > 0) {
      return new NextResponse(new Uint8Array(doc.sharedPdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeDocFilename(doc.title, "pdf")}"; filename*=UTF-8''${encodeURIComponent(safeDocFilename(doc.title, "pdf"))}`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Pas d'instantané PDF → la page publique propose Word + impression
    return NextResponse.redirect(`${publicBaseUrl(request)}/api/documents/shared/${token}`, 302);
  } catch (err) {
    console.error("[doc-shared-download]", err);
    return NextResponse.json({ error: "Téléchargement impossible" }, { status: 500 });
  }
}
