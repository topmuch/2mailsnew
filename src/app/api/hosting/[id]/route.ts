import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import {
  buildHostingReminder,
  dakarDaysLeft,
} from "@/lib/hosting-notify";
import { getAutomationConfig, sendAutomationEmail } from "@/lib/crm-automation";

// ─── Modification / suppression d'un domaine hébergé (Task 46-d) ─────────────
// PUT    → mise à jour des champs ; SI renewalDate change → notifiedStages
//          reset à "" (nouveau cycle de rappels J-30/15/2/J).
//          Action optionnelle `notify` : rappel e-mail immédiat manuel
//          (bypass des étapes, dedupeKey `manual-<Date.now()>`).
// DELETE → suppression du domaine.

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();

    const existing = await db.hostingDomain.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Domaine introuvable" }, { status: 404 });

    // 1) Mise à jour éventuelle des champs
    const data: Record<string, unknown> = {};
    if (body.domain !== undefined) {
      const domain = body.domain.toString().trim();
      if (!domain) return NextResponse.json({ error: "Le nom de domaine est obligatoire" }, { status: 400 });
      data.domain = domain;
    }
    let dateChanged = false;
    if (body.renewalDate !== undefined) {
      const raw = body.renewalDate.toString().trim();
      const date = new Date(raw);
      if (!raw || Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Date de renouvellement invalide" }, { status: 400 });
      }
      if (date.getTime() !== existing.renewalDate.getTime()) {
        dateChanged = true;
        data.renewalDate = date;
      }
    }
    if (body.registrar !== undefined) data.registrar = body.registrar.toString().trim().slice(0, 120);
    if (body.clientName !== undefined) data.clientName = body.clientName.toString().trim().slice(0, 160) || null;
    if (body.clientPhone !== undefined) data.clientPhone = body.clientPhone.toString().trim().slice(0, 40) || null;
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Le prix annuel doit être un nombre positif" }, { status: 400 });
      }
      data.price = price;
    }
    if (body.notes !== undefined) data.notes = body.notes.toString().trim().slice(0, 2000) || null;
    if (dateChanged) data.notifiedStages = ""; // nouveau cycle → rappels réarmés

    const updated = await db.hostingDomain.update({ where: { id }, data });

    // 2) Rappel e-mail manuel immédiat (bypass des étapes automatiques)
    if (body.action === "notify") {
      const daysLeft = dakarDaysLeft(updated.renewalDate, new Date());
      const reminder = buildHostingReminder({
        domain: updated.domain,
        registrar: updated.registrar,
        clientName: updated.clientName,
        renewalDate: updated.renewalDate,
        price: updated.price,
        daysLeft,
        manual: true,
      });
      const config = await getAutomationConfig();
      const setting = await db.setting.findFirst();
      const to = (config.recipientEmail || setting?.email || "").trim();
      if (!to.includes("@")) {
        return NextResponse.json({
          domain: updated,
          sent: false,
          error: "Aucun destinataire e-mail configuré (Automatisations ou Paramètres société)",
        });
      }
      const result = await sendAutomationEmail(to, reminder.subject, reminder.html);
      await db.crmSentMessage
        .create({
          data: {
            type: "HOSTING",
            subject: reminder.subject,
            content: reminder.text.slice(0, 4000),
            channel: "EMAIL",
            dedupeKey: `manual-${Date.now()}`,
            status: result.ok ? "SENT" : "FAILED",
            error: result.ok ? null : (result.error ?? "Erreur inconnue"),
          },
        })
        .catch(() => {
          // journalisation best-effort — ne bloque pas la réponse
        });
      return NextResponse.json({
        domain: updated,
        sent: result.ok,
        error: result.error,
        recipient: to,
        daysLeft,
      });
    }

    return NextResponse.json({ domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) } });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    await db.hostingDomain.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
