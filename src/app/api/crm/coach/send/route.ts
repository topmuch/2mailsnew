import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAutomationConfig, getRandomCoachMessage, sendAutomationEmail } from "@/lib/crm-automation";

// ─── POST : envoi immédiat d'un message du coach (admin) ─────────────────────
// body : { timeSlot: "11h" | "12h" | "14h" | "17h" | "18h" } — pioche un message
// actif au hasard et l'envoie tout de suite (indépendamment des horaires planifiés).

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const timeSlot = String(body.timeSlot ?? "");
    if (!["11h", "12h", "14h", "17h", "18h"].includes(timeSlot)) {
      return NextResponse.json({ error: "Créneau invalide (11h, 12h, 14h, 17h ou 18h)" }, { status: 400 });
    }

    const now = new Date();
    const config = await getAutomationConfig();
    const setting = await db.setting.findFirst();
    const to = (config.recipientEmail || setting?.email || "").trim();

    const msg = await getRandomCoachMessage(timeSlot as "11h" | "12h" | "14h" | "17h" | "18h", now);
    if (!msg) {
      return NextResponse.json({ ok: false, error: `Aucun message actif pour le créneau ${timeSlot}` });
    }
    if (!to) {
      return NextResponse.json({ ok: false, error: "Aucun e-mail destinataire configuré", preview: msg.content });
    }

    const res = await sendAutomationEmail(to, msg.subject, msg.html);
    await db.crmSentMessage.create({
      data: {
        type: "COACH",
        subject: msg.subject,
        content: msg.content.slice(0, 4000),
        dedupeKey: `COACH-${timeSlot}-${now.toISOString().slice(0, 10)}-MANUAL-${now.getTime()}`,
        status: res.ok ? "SENT" : "FAILED",
        error: res.error ?? null,
      },
    });

    return NextResponse.json({ ok: res.ok, error: res.error ?? null, preview: msg.content });
  } catch (error) {
    console.error("POST /api/crm/coach/send", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
