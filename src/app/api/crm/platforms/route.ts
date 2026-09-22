import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensurePlatformsSeeded } from "@/lib/crm-api";

// ─── Configuration des plateformes CRM (admin) ──────────────────────────────
// GET  /api/crm/platforms → liste (clés masquées)
// PUT  /api/crm/platforms → { id, label?, apiUrl?, apiKey?, webhookSecret?, isActive? }

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await ensurePlatformsSeeded();
    const platforms = await db.crmPlatform.findMany({ orderBy: { name: "asc" } });

    return NextResponse.json(
      platforms.map((p) => ({
        id: p.id,
        name: p.name,
        label: p.label,
        apiUrl: p.apiUrl,
        apiKey: p.apiKey ? "•".repeat(Math.min(p.apiKey.length, 12)) : "",
        hasApiKey: Boolean(p.apiKey),
        webhookSecret: p.webhookSecret ? "•".repeat(Math.min(p.webhookSecret.length, 12)) : "",
        hasWebhookSecret: Boolean(p.webhookSecret),
        estimatedPackPrice: p.estimatedPackPrice,
        isActive: p.isActive,
        lastSyncAt: p.lastSyncAt,
      }))
    );
  } catch (error) {
    console.error("GET /api/crm/platforms", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAuthUser(request);
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Identifiant de plateforme requis" }, { status: 400 });

    const existing = await db.crmPlatform.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Plateforme introuvable" }, { status: 404 });

    // Champs secrets : « ••• » ou vide => inchangés / effacés explicitement avec null
    const mask = (v: unknown) => typeof v === "string" && /^•+$/.test(v);

    const platform = await db.crmPlatform.update({
      where: { id },
      data: {
        label: body.label !== undefined ? String(body.label ?? "") : existing.label,
        apiUrl: body.apiUrl !== undefined ? String(body.apiUrl ?? "").trim() : existing.apiUrl,
        apiKey:
          body.apiKey === undefined || mask(body.apiKey)
            ? existing.apiKey
            : String(body.apiKey ?? "").trim(),
        webhookSecret:
          body.webhookSecret === undefined || mask(body.webhookSecret)
            ? existing.webhookSecret
            : String(body.webhookSecret ?? "").trim(),
        estimatedPackPrice:
          body.estimatedPackPrice !== undefined
            ? Math.max(0, Number(body.estimatedPackPrice) || 0)
            : existing.estimatedPackPrice,
        isActive: typeof body.isActive === "boolean" ? body.isActive : existing.isActive,
      },
    });

    return NextResponse.json({
      id: platform.id,
      name: platform.name,
      label: platform.label,
      apiUrl: platform.apiUrl,
      hasApiKey: Boolean(platform.apiKey),
      hasWebhookSecret: Boolean(platform.webhookSecret),
      estimatedPackPrice: platform.estimatedPackPrice,
      isActive: platform.isActive,
      lastSyncAt: platform.lastSyncAt,
    });
  } catch (error) {
    console.error("PUT /api/crm/platforms", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
