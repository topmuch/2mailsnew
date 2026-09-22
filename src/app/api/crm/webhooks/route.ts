import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensurePlatformsSeeded, PLATFORM_NAMES, type PlatformName } from "@/lib/crm-api";

// ─── Webhooks CRM : réception des événements qrtags.pro / qrbags.com ────────
// Les plateformes externes appellent :
//   POST /api/crm/webhooks
//   En-tête  : X-Webhook-Secret: <secret>   (ou ?secret=… en repli)
//   Corps    : { platform, event, item }    (ou forme plate)
// Événements acceptés : item_activated, item_scanned, item_lost, item_found,
// item_suspended, item_updated, item_created (insensible à la casse, tirets
// ou underscores).

const EVENT_ACTION: Record<string, string> = {
  item_activated: "ACTIVATION",
  activation: "ACTIVATION",
  item_scanned: "SCAN",
  scan: "SCAN",
  item_lost: "LOST",
  lost: "LOST",
  item_found: "FOUND",
  found: "FOUND",
  item_suspended: "SUSPENDED",
  suspended: "SUSPENDED",
  item_updated: "UPDATED",
  item_created: "ACTIVATION",
};

function isPlatformName(v: unknown): v is PlatformName {
  return typeof v === "string" && (PLATFORM_NAMES as string[]).includes(v.toUpperCase());
}

/** Normalise le corps du webhook (tolérant) en item + action. */
function parseWebhookBody(body: Record<string, unknown>) {
  const eventRaw = String(body.event ?? body.type ?? body.action ?? "").toLowerCase();
  const event = EVENT_ACTION[eventRaw] ? eventRaw : null;

  const itemRaw = (body.item ?? body.data ?? body.payload ?? body) as Record<string, unknown>;
  const externalId = String(
    itemRaw?.id ?? itemRaw?.externalId ?? itemRaw?.tagId ?? itemRaw?.bagId ?? body.itemId ?? body.code ?? ""
  ).trim();

  return { event, externalId, itemRaw: itemRaw && typeof itemRaw === "object" ? itemRaw : {} };
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const platformName = String(body.platform ?? body.source ?? url.searchParams.get("platform") ?? "").toUpperCase();
    if (!isPlatformName(platformName)) {
      return NextResponse.json({ error: "Plateforme inconnue (attendu : QRTAGS ou QRBAGS)" }, { status: 400 });
    }
    const platform = platformName as PlatformName;

    await ensurePlatformsSeeded();
    const config = await db.crmPlatform.findUnique({ where: { name: platform } });
    if (!config || !config.isActive) {
      return NextResponse.json({ error: `Plateforme ${platform} inactive ou introuvable` }, { status: 403 });
    }

    // Validation du secret partagé (en-tête ou query)
    const provided =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      url.searchParams.get("secret") ??
      "";
    const expected = process.env.CRM_WEBHOOK_SECRET || config.webhookSecret;
    if (!expected || provided !== expected) {
      await db.crmActivity.create({
        data: { platform, action: "WEBHOOK_ERROR", details: "Webhook refusé : secret invalide" },
      });
      return NextResponse.json({ error: "Secret de webhook invalide" }, { status: 401 });
    }

    const { event, externalId, itemRaw } = parseWebhookBody(body);
    if (!event) {
      return NextResponse.json(
        { error: "Événement non reconnu (attendu : item_activated, item_scanned, item_lost, item_found…)" },
        { status: 400 }
      );
    }
    if (!externalId) {
      return NextResponse.json({ error: "Identifiant d'item manquant (item.id)" }, { status: 400 });
    }

    const action = EVENT_ACTION[event];

    // Mise à jour / création de l'item concerné
    const statusByEvent: Record<string, string> = {
      ACTIVATION: "ACTIVE",
      LOST: "LOST",
      FOUND: "FOUND",
      SUSPENDED: "SUSPENDED",
    };

    const place = (itemRaw.place ?? itemRaw.location ?? itemRaw.lastScanPlace ?? null) as string | null;
    const lastScanRaw = itemRaw.lastScanAt ?? itemRaw.scannedAt ?? (action === "SCAN" ? new Date().toISOString() : null);
    const lastScanDate = lastScanRaw ? new Date(String(lastScanRaw)) : null;

    const existing = await db.crmItem.findUnique({
      where: { platformId_externalId: { platformId: config.id, externalId } },
    });

    let item;
    if (existing) {
      item = await db.crmItem.update({
        where: { id: existing.id },
        data: {
          status: statusByEvent[action] ?? existing.status,
          lastScanAt: lastScanDate && !Number.isNaN(lastScanDate.getTime()) ? lastScanDate : existing.lastScanAt,
          lastScanPlace: place ?? existing.lastScanPlace,
          scanCount: action === "SCAN" ? existing.scanCount + 1 : existing.scanCount,
          ownerName: (itemRaw.ownerName ?? itemRaw.owner ?? existing.ownerName) as string | null,
          ownerPhone: (itemRaw.ownerPhone ?? itemRaw.phone ?? existing.ownerPhone) as string | null,
        },
      });
    } else {
      item = await db.crmItem.create({
        data: {
          platformId: config.id,
          externalId,
          code: String(itemRaw.code ?? itemRaw.reference ?? body.code ?? externalId).slice(0, 120),
          type: String(itemRaw.type ?? "TAG").toUpperCase().includes("BAG") ? "BAGAGE" : "TAG",
          status: statusByEvent[action] ?? "ACTIVE",
          ownerName: (itemRaw.ownerName ?? itemRaw.owner ?? null) as string | null,
          ownerPhone: (itemRaw.ownerPhone ?? itemRaw.phone ?? null) as string | null,
          ownerEmail: (itemRaw.ownerEmail ?? itemRaw.email ?? null) as string | null,
          lastScanAt: lastScanDate && !Number.isNaN(lastScanDate.getTime()) ? lastScanDate : null,
          lastScanPlace: place,
          scanCount: action === "SCAN" ? 1 : 0,
          raw: JSON.stringify(body).slice(0, 4000),
        },
      });
    }

    await db.crmActivity.create({
      data: {
        platform,
        itemId: item.id,
        action,
        details: [
          item.code ? `Code ${item.code}` : `Item ${externalId}`,
          item.ownerName ? `— ${item.ownerName}` : "",
          place ? `— ${place}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    });

    return NextResponse.json({ ok: true, event: action, itemId: item.id, status: item.status });
  } catch (error) {
    console.error("POST /api/crm/webhooks", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/crm/webhooks",
    headers: { "X-Webhook-Secret": "<secret partagé>" },
    body: {
      platform: "QRTAGS | QRBAGS",
      event: "item_activated | item_scanned | item_lost | item_found | item_suspended",
      item: { id: "<id plateforme>", code: "HAJJ25-ABC123", ownerName: "…", ownerPhone: "…", place: "HLM Grand Yoff" },
    },
  });
}
