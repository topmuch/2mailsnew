import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAutomationConfig, isBusinessHours } from "@/lib/crm-automation";
import { ensureCoachMessagesSeeded } from "@/lib/crm-coach-seed";

// ─── GET : config des automatisations + statut du scheduler ──────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const config = await getAutomationConfig();
    const seeded = await ensureCoachMessagesSeeded();

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [setting, sentToday, failedToday, lastSent] = await Promise.all([
      db.setting.findFirst(),
      db.crmSentMessage.count({
        where: { sentAt: { gte: dayStart }, status: "SENT" },
      }),
      db.crmSentMessage.count({
        where: { sentAt: { gte: dayStart }, status: "FAILED" },
      }),
      db.crmSentMessage.findFirst({ orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    ]);

    const schedulerRunning = Boolean(
      (globalThis as unknown as { __crmSchedulerStarted?: boolean }).__crmSchedulerStarted,
    );

    return NextResponse.json({
      config: {
        ownerName: config.ownerName,
        recipientEmail: config.recipientEmail,
        reportMorningEnabled: config.reportMorningEnabled,
        reportMorningTime: config.reportMorningTime,
        reportEveningEnabled: config.reportEveningEnabled,
        reportEveningTime: config.reportEveningTime,
        coachEnabled: config.coachEnabled,
        coach11Enabled: config.coach11Enabled,
        coach12Enabled: config.coach12Enabled,
        coach14Enabled: config.coach14Enabled,
        coach17Enabled: config.coach17Enabled,
        coach18Enabled: config.coach18Enabled,
        remindersEnabled: config.remindersEnabled,
        reminderSlots: config.reminderSlots ?? "H1",
        dailyGoal: config.dailyGoal,
      },
      status: {
        schedulerRunning,
        businessHoursNow: isBusinessHours(now),
        now: now.toISOString(),
        smtpConfigured: Boolean(setting?.smtpHost && setting?.smtpUser && setting?.smtpPass),
        recipientConfigured: Boolean(config.recipientEmail || setting?.email),
        sentToday,
        failedToday,
        lastSentAt: lastSent?.sentAt?.toISOString() ?? null,
        seededCoachMessages: seeded,
      },
    });
  } catch (error) {
    console.error("GET /api/crm/automation/config", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ─── PUT : mise à jour de la configuration (admin) ───────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

    const data: Record<string, string | boolean> = {};
    if (typeof body.ownerName === "string") data.ownerName = body.ownerName.trim().slice(0, 80);
    if (typeof body.recipientEmail === "string") data.recipientEmail = body.recipientEmail.trim().slice(0, 160);
    if (typeof body.reportMorningEnabled === "boolean") data.reportMorningEnabled = body.reportMorningEnabled;
    if (typeof body.reportMorningTime === "string" && timeRe.test(body.reportMorningTime)) data.reportMorningTime = body.reportMorningTime;
    if (typeof body.reportEveningEnabled === "boolean") data.reportEveningEnabled = body.reportEveningEnabled;
    if (typeof body.reportEveningTime === "string" && timeRe.test(body.reportEveningTime)) data.reportEveningTime = body.reportEveningTime;
    if (typeof body.coachEnabled === "boolean") data.coachEnabled = body.coachEnabled;
    if (typeof body.coach11Enabled === "boolean") data.coach11Enabled = body.coach11Enabled;
    if (typeof body.coach12Enabled === "boolean") data.coach12Enabled = body.coach12Enabled;
    if (typeof body.coach14Enabled === "boolean") data.coach14Enabled = body.coach14Enabled;
    if (typeof body.coach17Enabled === "boolean") data.coach17Enabled = body.coach17Enabled;
    if (typeof body.coach18Enabled === "boolean") data.coach18Enabled = body.coach18Enabled;
    if (typeof body.remindersEnabled === "boolean") data.remindersEnabled = body.remindersEnabled;
    if (typeof body.reminderSlots === "string") {
      const allowed = ["J1", "H1", "H15"];
      const tokens = body.reminderSlots
        .split(",")
        .map((s: string) => s.trim().toUpperCase())
        .filter((s: string) => allowed.includes(s));
      // ordre canonique + dédoublonnage ; vide = aucun créneau actif
      data.reminderSlots = allowed.filter((s) => tokens.includes(s)).join(",");
    }
    if (typeof body.dailyGoal === "string") data.dailyGoal = body.dailyGoal.trim().slice(0, 300);

    const config = await db.crmAutomationConfig.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });

    return NextResponse.json({ ok: true, config });
  } catch (error) {
    console.error("PUT /api/crm/automation/config", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
