import { db } from "@/lib/db";

// ─── CRM Unifié — couche d'intégration qrtags.pro / qrbags.com ──────────────
// Ce module communique avec les plateformes externes UNIQUEMENT via fetch.
// Il ne modifie jamais le code des plateformes : il récupère leurs items
// (GET {apiUrl}/api/admin/items) et reçoit leurs webhooks (/api/crm/webhooks).

export type PlatformName = "QRTAGS" | "QRBAGS";

export const PLATFORM_NAMES: PlatformName[] = ["QRTAGS", "QRBAGS"];

export interface CrmItemInput {
  externalId: string;
  code?: string | null;
  type?: string | null;
  status?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  lastScanAt?: string | null;
  lastScanPlace?: string | null;
  scanCount?: number | null;
  raw?: unknown;
}

export interface PlatformConfig {
  id: string;
  name: string;
  label: string;
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
}

/** Lit les credentials d'une plateforme : variables d'environnement en priorité, sinon base (CrmPlatform). */
export async function getPlatformConfig(platform: PlatformName): Promise<PlatformConfig | null> {
  const envUrl = platform === "QRTAGS" ? process.env.QRTAGS_API_URL : process.env.QRBAGS_API_URL;
  const envKey = platform === "QRTAGS" ? process.env.QRTAGS_API_KEY : process.env.QRBAGS_API_KEY;

  const row = await db.crmPlatform.findUnique({ where: { name: platform } });
  if (!row && !envUrl && !envKey) return null;

  return {
    id: row?.id ?? "",
    name: platform,
    label: row?.label ?? (platform === "QRTAGS" ? "qrtags.pro" : "qrbags.com"),
    apiUrl: envUrl ?? row?.apiUrl ?? "",
    apiKey: envKey ?? row?.apiKey ?? "",
    webhookSecret: process.env.CRM_WEBHOOK_SECRET ?? row?.webhookSecret ?? "",
    isActive: row ? row.isActive : true,
  };
}

/** Normalise un enregistrement renvoyé par une plateforme (forme tolérante : id/externalId, code/reference, owner/ownerName…). */
export function normalizeItem(rawRecord: Record<string, unknown>): CrmItemInput | null {
  if (!rawRecord || typeof rawRecord !== "object") return null;
  const r = rawRecord as Record<string, unknown>;
  const externalId = String(r.id ?? r.externalId ?? r.tagId ?? r.bagId ?? "").trim();
  if (!externalId) return null;

  const code = r.code ?? r.reference ?? r.tag ?? r.qr ?? r.serial ?? null;
  const type = String(r.type ?? r.kind ?? (r.baggage || r.isBag ? "BAGAGE" : "TAG")).toUpperCase().includes("BAG")
    ? "BAGAGE"
    : "TAG";
  const status = String(r.status ?? r.state ?? "ACTIVE").toUpperCase();

  const lastScanRaw = r.lastScanAt ?? r.lastScan ?? r.scannedAt ?? null;
  const lastScanDate = lastScanRaw ? new Date(String(lastScanRaw)) : null;

  return {
    externalId,
    code: code != null ? String(code) : null,
    type,
    status: ["ACTIVE", "LOST", "FOUND", "SUSPENDED", "INACTIVE"].includes(status) ? status : "ACTIVE",
    ownerName: (r.ownerName ?? r.owner ?? r.clientName ?? null) as string | null,
    ownerPhone: (r.ownerPhone ?? r.phone ?? r.telephone ?? null) as string | null,
    ownerEmail: (r.ownerEmail ?? r.email ?? null) as string | null,
    lastScanAt: lastScanDate && !Number.isNaN(lastScanDate.getTime()) ? lastScanDate.toISOString() : null,
    lastScanPlace: (r.lastScanPlace ?? r.place ?? r.location ?? null) as string | null,
    scanCount: typeof r.scanCount === "number" ? r.scanCount : Number(r.scanCount ?? 0) || 0,
    raw: rawRecord,
  };
}

/** Récupère les items d'une plateforme via son API admin (GET {apiUrl}/api/admin/items). */
export async function fetchItemsFromPlatform(platform: PlatformName): Promise<CrmItemInput[]> {
  const config = await getPlatformConfig(platform);
  if (!config?.apiUrl || !config.apiKey) {
    throw new Error(`Plateforme ${platform} non configurée (URL API et clé API requises)`);
  }

  const base = config.apiUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/admin/items`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`API ${platform} : HTTP ${response.status}`);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!payload) return [];

  // Formes acceptées : [...] | { items: [...] } | { data: [...] } | { results: [...] }
  const list = Array.isArray(payload)
    ? payload
    : ((payload as Record<string, unknown>).items ??
      (payload as Record<string, unknown>).data ??
      (payload as Record<string, unknown>).results ??
      []);
  if (!Array.isArray(list)) return [];

  return list
    .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
    .map(normalizeItem)
    .filter((x): x is CrmItemInput => x != null);
}

/** Upsert local d'un item CRM à partir des données normalisées. */
export async function upsertCrmItem(platform: PlatformName, item: CrmItemInput) {
  const platformRow = await db.crmPlatform.findUnique({ where: { name: platform } });
  if (!platformRow) throw new Error(`Plateforme ${platform} inconnue en base`);

  const existing = await db.crmItem.findUnique({
    where: { platformId_externalId: { platformId: platformRow.id, externalId: item.externalId } },
  });

  if (existing) {
    return db.crmItem.update({
      where: { id: existing.id },
      data: {
        code: item.code ?? existing.code,
        type: item.type ?? existing.type,
        status: item.status ?? existing.status,
        ownerName: item.ownerName ?? existing.ownerName,
        ownerPhone: item.ownerPhone ?? existing.ownerPhone,
        ownerEmail: item.ownerEmail ?? existing.ownerEmail,
        lastScanAt: item.lastScanAt ? new Date(item.lastScanAt) : existing.lastScanAt,
        lastScanPlace: item.lastScanPlace ?? existing.lastScanPlace,
        scanCount: item.scanCount ?? existing.scanCount,
        raw: item.raw != null ? JSON.stringify(item.raw) : existing.raw,
      },
    });
  }

  return db.crmItem.create({
    data: {
      platformId: platformRow.id,
      externalId: item.externalId,
      code: item.code ?? "",
      type: item.type ?? "TAG",
      status: item.status ?? "ACTIVE",
      ownerName: item.ownerName ?? null,
      ownerPhone: item.ownerPhone ?? null,
      ownerEmail: item.ownerEmail ?? null,
      lastScanAt: item.lastScanAt ? new Date(item.lastScanAt) : null,
      lastScanPlace: item.lastScanPlace ?? null,
      scanCount: item.scanCount ?? 0,
      raw: item.raw != null ? JSON.stringify(item.raw) : null,
    },
  });
}

/** Lie automatiquement les items aux clients CRM (par téléphone ou e-mail) et met à jour totalItems. */
export async function reconcileCrmClients(platform: PlatformName) {
  const platformRow = await db.crmPlatform.findUnique({
    where: { name: platform },
    include: { items: true },
  });
  if (!platformRow) return 0;

  let linked = 0;
  for (const item of platformRow.items) {
    if (item.clientId) {
      linked++;
      continue;
    }
    const match = item.ownerPhone
      ? await db.crmClient.findFirst({ where: { phone: item.ownerPhone } })
      : item.ownerEmail
        ? await db.crmClient.findFirst({ where: { email: item.ownerEmail } })
        : null;
    if (match) {
      await db.crmItem.update({ where: { id: item.id }, data: { clientId: match.id } });
      linked++;
    }
  }

  // Recalcule totalItems pour chaque client
  const clients = await db.crmClient.findMany({ select: { id: true } });
  for (const c of clients) {
    const count = await db.crmItem.count({ where: { clientId: c.id } });
    await db.crmClient.update({ where: { id: c.id }, data: { totalItems: count } });
  }

  return linked;
}

/** Synchronise une plateforme : récupère ses items et met à jour le cache local. */
export async function syncPlatform(platform: PlatformName) {
  const items = await fetchItemsFromPlatform(platform);
  let created = 0;
  let updated = 0;

  const platformRow = await db.crmPlatform.findUnique({ where: { name: platform } });
  for (const item of items) {
    if (!platformRow) break;
    const exists = await db.crmItem.findUnique({
      where: { platformId_externalId: { platformId: platformRow.id, externalId: item.externalId } },
    });
    await upsertCrmItem(platform, item);
    if (exists) updated++;
    else created++;
  }

  await reconcileCrmClients(platform);
  await db.crmPlatform.update({ where: { name: platform }, data: { lastSyncAt: new Date() } });
  await db.crmActivity.create({
    data: {
      platform,
      action: "SYNC",
      details: `Synchronisation manuelle : ${created} créé(s), ${updated} mis à jour sur ${items.length} item(s)`,
    },
  });

  return { platform, total: items.length, created, updated };
}

/** Synchronise toutes les plateformes actives. */
export async function syncAllPlatforms() {
  const results: Array<{ platform: string; total: number; created: number; updated: number }> = [];
  const errors: Array<{ platform: string; error: string }> = [];

  for (const name of PLATFORM_NAMES) {
    const config = await getPlatformConfig(name);
    if (!config?.isActive || !config.apiUrl || !config.apiKey) continue;
    try {
      results.push(await syncPlatform(name));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push({ platform: name, error: message });
      await db.crmActivity.create({
        data: { platform: name, action: "SYNC", details: `Échec : ${message}` },
      });
    }
  }

  return { results, errors };
}

/** Assure que les deux plateformes existent en base (idempotent, appelé au premier usage). */
export async function ensurePlatformsSeeded() {
  const defaults: Array<{ name: PlatformName; label: string }> = [
    { name: "QRTAGS", label: "qrtags.pro" },
    { name: "QRBAGS", label: "qrbags.com" },
  ];
  for (const d of defaults) {
    await db.crmPlatform.upsert({
      where: { name: d.name },
      update: {},
      create: { name: d.name, label: d.label },
    });
  }
}
