import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { buildDocxBuffer, type CompanyInfo } from "@/lib/docx-export";

// ─── Export Word (.docx) d'un document rédigé ────────────────────────────────
// GET → fichier .docx réel (papier en-tête logo + coordonnées, pied « Page X »)

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const doc = await db.crmDocument.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
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
    // Nom de fichier propre : sans caractères problématiques
    const safe = doc.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "document";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}.docx"; filename*=UTF-8''${encodeURIComponent(`${safe}.docx`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export-docx]", err);
    return NextResponse.json({ error: "Export Word impossible" }, { status: 500 });
  }
}
