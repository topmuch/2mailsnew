import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { TEMPLATE_KEYS } from "@/lib/doc-templates";
import { serializeDoc } from "@/lib/doc-share";

// ─── Document individuel : lecture, modification, suppression ────────────────
// GET    → le document (avec liens client/lead)
// PUT    → mise à jour partielle (titre, contenu, modèle, liens, statut)
// DELETE → suppression (auteur ou administrateur)

export const dynamic = "force-dynamic";

const DOC_INCLUDE = {
  client: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true, company: true } },
} as const;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const doc = await db.crmDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    return NextResponse.json({ doc: serializeDoc(doc) });
  } catch {
    return NextResponse.json({ error: "Chargement impossible" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();
    const data: {
      title?: string;
      content?: string;
      template?: string;
      clientId?: string | null;
      leadId?: string | null;
      status?: string;
    } = {};
    if (body.title !== undefined) {
      const title = body.title.toString().trim();
      if (!title) return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
      data.title = title;
    }
    if (body.content !== undefined) data.content = body.content.toString();
    if (body.template !== undefined && TEMPLATE_KEYS.includes(body.template)) {
      data.template = body.template;
    }
    if (body.status !== undefined && ["BROUILLON", "FINAL"].includes(body.status)) {
      data.status = body.status;
    }
    // Liens : null détache le document, une valeur doit exister en base
    if (body.clientId !== undefined) {
      if (body.clientId === null || body.clientId === "") {
        data.clientId = null;
      } else if (await db.client.findUnique({ where: { id: body.clientId.toString() } })) {
        data.clientId = body.clientId.toString();
      } else {
        return NextResponse.json({ error: "Client introuvable" }, { status: 400 });
      }
    }
    if (body.leadId !== undefined) {
      if (body.leadId === null || body.leadId === "") {
        data.leadId = null;
      } else if (await db.crmLead.findUnique({ where: { id: body.leadId.toString() } })) {
        data.leadId = body.leadId.toString();
      } else {
        return NextResponse.json({ error: "Lead introuvable" }, { status: 400 });
      }
    }
    const doc = await db.crmDocument.update({ where: { id }, data, include: DOC_INCLUDE });
    return NextResponse.json({ doc: serializeDoc(doc) });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const doc = await db.crmDocument.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    // Comme le blog note : l'auteur peut supprimer son document, l'admin n'importe lequel
    if (doc.author !== user.name && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul l'auteur du document ou l'administrateur peut le supprimer" },
        { status: 403 },
      );
    }
    await db.crmDocument.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
