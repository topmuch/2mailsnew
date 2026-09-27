import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensureCoachMessagesSeeded } from "@/lib/crm-coach-seed";

// ─── GET : bibliothèque des messages du coach + historique des envois ────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await ensureCoachMessagesSeeded();

    const [messages, history] = await Promise.all([
      db.crmCoachMessage.findMany({ orderBy: [{ timeSlot: "asc" }, { createdAt: "asc" }] }),
      db.crmSentMessage.findMany({
        where: { type: { in: ["COACH", "TEST"] } },
        orderBy: { sentAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      messages,
      history,
      counts: {
        "11h": messages.filter((m) => m.timeSlot === "11h" && m.isActive).length,
        "12h": messages.filter((m) => m.timeSlot === "12h" && m.isActive).length,
        "14h": messages.filter((m) => m.timeSlot === "14h" && m.isActive).length,
        "17h": messages.filter((m) => m.timeSlot === "17h" && m.isActive).length,
        "18h": messages.filter((m) => m.timeSlot === "18h" && m.isActive).length,
      },
    });
  } catch (error) {
    console.error("GET /api/crm/coach", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── POST : ajout d'un message personnalisé (admin) ──────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const content = String(body.content ?? "").trim();
    const timeSlot = String(body.timeSlot ?? "");
    if (!content) return NextResponse.json({ error: "Le contenu du message est requis" }, { status: 400 });
    if (!["11h", "12h", "14h", "17h", "18h"].includes(timeSlot)) {
      return NextResponse.json({ error: "Créneau invalide (11h, 12h, 14h, 17h ou 18h)" }, { status: 400 });
    }

    const category =
      timeSlot === "11h"
        ? "BUSINESS"
        : timeSlot === "14h"
          ? "MINDSET"
          : timeSlot === "17h"
            ? "CLOSING"
            : "SOCIAL"; // 12h & 18h = visuels réseaux sociaux (Task 57)
    const message = await db.crmCoachMessage.create({
      data: { timeSlot, category, content: content.slice(0, 1000), isActive: true },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/coach", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── PUT : édition / activation-désactivation d'un message (admin) ───────────

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });

    const data: { content?: string; isActive?: boolean } = {};
    if (typeof body.content === "string" && body.content.trim()) data.content = body.content.trim().slice(0, 1000);
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const message = await db.crmCoachMessage.update({ where: { id }, data });
    return NextResponse.json(message);
  } catch (error) {
    console.error("PUT /api/crm/coach", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── DELETE : suppression d'un message (admin) ───────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });

    await db.crmCoachMessage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/coach", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
