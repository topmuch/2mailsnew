import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const VALID_FOLDERS = ["INBOX", "SENT", "TRASH", "PLANIFIES"];

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

// ─── PATCH : actions sur les mails programmés (retry / cancel) ──────────────
// - retry  : un mail en échec (ECHEC) repasse en PLANIFIE, programmé maintenant →
//            le scheduler (src/lib/mail-schedule.ts) le reprend au prochain tick.
// - cancel : annule un envoi programmé (PLANIFIE ou ECHEC) → suppression définitive.

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    const existing = await db.mail.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mail introuvable" }, { status: 404 });
    }

    if (action === "retry") {
      if (existing.status !== "ECHEC") {
        return NextResponse.json(
          { error: "Seul un mail en échec peut être renvoyé" },
          { status: 400 }
        );
      }
      const mail = await db.mail.update({
        where: { id },
        data: {
          status: "PLANIFIE",
          folder: "PLANIFIES",
          scheduledAt: new Date(), // repris par le scheduler au prochain tick
          sendError: null,
        },
      });
      return NextResponse.json({ mail });
    }

    if (action === "cancel") {
      if (existing.status !== "PLANIFIE" && existing.status !== "ECHEC") {
        return NextResponse.json(
          { error: "Seul un mail programmé peut être annulé" },
          { status: 400 }
        );
      }
      const mail = await db.mail.delete({ where: { id } });
      return NextResponse.json({ mail });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/mails/[id]", error);
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
