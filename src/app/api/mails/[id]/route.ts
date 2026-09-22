import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const VALID_FOLDERS = ["INBOX", "SENT", "TRASH"];

// ─── GET : détail d'un mail ─────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const mail = await db.mail.findUnique({ where: { id } });
    if (!mail) {
      return NextResponse.json({ error: "Mail introuvable" }, { status: 404 });
    }
    return NextResponse.json({ mail });
  } catch (error) {
    console.error("GET /api/mails/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── PUT : mise à jour partielle (read / starred / folder) ──────────────────

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.mail.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mail introuvable" }, { status: 404 });
    }

    const data: { read?: boolean; starred?: boolean; folder?: string } = {};
    if (typeof body.read === "boolean") data.read = body.read;
    if (typeof body.starred === "boolean") data.starred = body.starred;
    if (typeof body.folder === "string" && VALID_FOLDERS.includes(body.folder)) {
      data.folder = body.folder;
    }

    const mail = await db.mail.update({ where: { id }, data });
    return NextResponse.json({ mail });
  } catch (error) {
    console.error("PUT /api/mails/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── DELETE : corbeille (déplacement) ou suppression définitive ─────────────

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await db.mail.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mail introuvable" }, { status: 404 });
    }

    if (existing.folder === "TRASH") {
      // Déjà dans la corbeille → suppression définitive
      const mail = await db.mail.delete({ where: { id } });
      return NextResponse.json({ mail });
    }

    // Sinon → simple déplacement dans la corbeille
    const mail = await db.mail.update({
      where: { id },
      data: { folder: "TRASH" },
    });
    return NextResponse.json({ mail });
  } catch (error) {
    console.error("DELETE /api/mails/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
