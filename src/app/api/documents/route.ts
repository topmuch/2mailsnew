import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { TEMPLATE_KEYS } from "@/lib/doc-templates";
import { serializeDoc } from "@/lib/doc-share";

// ─── Documents rédigés (éditeur type Word, export .docx / PDF) ───────────────
// GET  → liste (liens client/lead inclus, plus récents d'abord)
//        ?clientId=… ou ?leadId=… pour filtrer les documents d'un tiers
// POST → création { title, content?, template?, clientId?, leadId?, status? }

export const dynamic = "force-dynamic";

const DOC_INCLUDE = {
  client: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true, company: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const leadId = url.searchParams.get("leadId");
    const documents = await db.crmDocument.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(leadId ? { leadId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: DOC_INCLUDE,
    });
    return NextResponse.json({ documents: documents.map(serializeDoc) });
  } catch {
    return NextResponse.json({ error: "Chargement impossible" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await request.json();
    const title = (body.title ?? "").toString().trim();
    if (!title) {
      return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
    }
    const template = TEMPLATE_KEYS.includes(body.template) ? body.template : "BLANK";
    const status = ["BROUILLON", "FINAL"].includes(body.status) ? body.status : "BROUILLON";
    const content = (body.content ?? "").toString();
    const clientId = body.clientId ? body.clientId.toString() : null;
    const leadId = body.leadId ? body.leadId.toString() : null;
    if (clientId && !(await db.client.findUnique({ where: { id: clientId } }))) {
      return NextResponse.json({ error: "Client introuvable" }, { status: 400 });
    }
    if (leadId && !(await db.crmLead.findUnique({ where: { id: leadId } }))) {
      return NextResponse.json({ error: "Lead introuvable" }, { status: 400 });
    }
    const doc = await db.crmDocument.create({
      data: { title, content, template, status, clientId, leadId, author: user.name },
      include: DOC_INCLUDE,
    });
    return NextResponse.json({ doc: serializeDoc(doc) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
