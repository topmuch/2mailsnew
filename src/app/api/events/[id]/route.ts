import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const COLORS = ["green", "gold", "orange", "red"] as const;
const TYPES = ["RDV", "TACHE", "RAPPEL"] as const;

/** Nettoie une heure fournie (HH:mm) — renvoie null si absente ou invalide. */
function parseTime(value: unknown): string | null {
  const s = value?.toString().trim() ?? "";
  return TIME_RE.test(s) ? s : null;
}

/** Convertit "YYYY-MM-DD" en Date à midi UTC (évite les décalages de fuseau). */
function parseDayKey(value: unknown): Date | null {
  const s = value?.toString().trim() ?? "";
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }
    const body = await request.json();
    const data: {
      title?: string;
      description?: string | null;
      date?: Date;
      startTime?: string | null;
      endTime?: string | null;
      color?: string;
      type?: string;
      done?: boolean;
    } = {};

    if (body.title !== undefined) {
      const title = body.title?.toString().trim() ?? "";
      if (!title) {
        return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
      }
      data.title = title;
    }
    if (body.date !== undefined) {
      const date = parseDayKey(body.date);
      if (!date) {
        return NextResponse.json({ error: "Date invalide" }, { status: 400 });
      }
      data.date = date;
    }
    if (body.startTime !== undefined) data.startTime = parseTime(body.startTime);
    if (body.endTime !== undefined) data.endTime = parseTime(body.endTime);
    if (body.description !== undefined) {
      data.description = body.description?.toString().trim() || null;
    }
    if (body.color !== undefined && (COLORS as readonly string[]).includes(body.color)) {
      data.color = body.color as string;
    }
    if (body.type !== undefined && (TYPES as readonly string[]).includes(body.type)) {
      data.type = body.type as string;
    }
    if (body.done !== undefined) data.done = Boolean(body.done);

    const event = await db.calendarEvent.update({ where: { id }, data });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("PUT /api/events/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }
    await db.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/events/[id]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
