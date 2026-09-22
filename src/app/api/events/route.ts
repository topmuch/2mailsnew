import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const COLORS = ["green", "gold", "orange", "red"] as const;
const TYPES = ["RDV", "TACHE", "RAPPEL"] as const;

/** Convertit "YYYY-MM-DD" en Date à midi UTC (évite les décalages de fuseau). */
function parseDayKey(value: unknown): Date | null {
  const s = value?.toString().trim() ?? "";
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nettoie une heure fournie (HH:mm) — renvoie null si absente ou invalide. */
function parseTime(value: unknown): string | null {
  const s = value?.toString().trim() ?? "";
  return TIME_RE.test(s) ? s : null;
}

// ─── GET : événements d'un mois (?month=YYYY-MM) ────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") ?? "";
    let year: number;
    let monthIndex: number;
    if (MONTH_RE.test(month)) {
      const [y, m] = month.split("-").map((part) => parseInt(part, 10));
      if (m >= 1 && m <= 12) {
        year = y;
        monthIndex = m - 1;
      } else {
        const now = new Date();
        year = now.getUTCFullYear();
        monthIndex = now.getUTCMonth();
      }
    } else {
      const now = new Date();
      year = now.getUTCFullYear();
      monthIndex = now.getUTCMonth();
    }

    const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    const events = await db.calendarEvent.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("GET /api/events", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : créer un événement ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const title = body.title?.toString().trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Le titre est obligatoire" }, { status: 400 });
    }

    const date = parseDayKey(body.date);
    if (!date) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    const color = COLORS.includes(body.color) ? body.color : "green";
    const type = TYPES.includes(body.type) ? body.type : "RDV";

    const event = await db.calendarEvent.create({
      data: {
        title,
        description: body.description?.toString().trim() || null,
        date,
        startTime: parseTime(body.startTime),
        endTime: parseTime(body.endTime),
        color,
        type,
        done: false,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("POST /api/events", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
