import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { extractSiteInfo } from "@/lib/crm-api";
import { fetchTextResilient } from "@/lib/fetch-mirrors";
import { warmNewsImages } from "@/lib/news-image-cache";

// ─── GET /api/shopping : produits avec photos (Task 78-b) ────────────────────
// Les sites e-commerce (Amazon, AliExpress, Shein, Temu, Cdiscount) bloquent
// tous les flux RSS publics et l'iframe embedding. Pour afficher des produits
// avec photos dans la pilule Shopping d'Actus, on utilise le SDK z-ai web_search
// avec des requêtes produit ciblées, puis on extrait l'og:image de chaque page.
//
// Stratégie :
//   1. 8 requêtes produit parallèles (smartphone, casque, TV, laptop, promo…)
//   2. Filtrage des résultats (exclusion réseaux sociaux, pages d'accueil)
//   3. Extraction og:image de chaque URL via fetchTextResilient (direct + relais)
//   4. Filtrage strict : seuls les articles AVEC image sont retournés
//   5. Cache mémoire 5 min (les produits ne changent pas toutes les minutes)
//
// Budget SDK : 8 requêtes par cycle, espacées de 1.2s, pause 60s si 429.

interface ProductItem {
  title: string;
  snippet: string;
  url: string;
  host: string;
  source: string;
  date: string;
  image: string | null;
  price?: string | null; // prix extrait du snippet si détecté
}

interface ShoppingCacheEntry {
  items: ProductItem[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const MAX_ITEMS = 12;
const IMAGE_TIMEOUT_MS = 6_000;
const SDK_MIN_GAP_MS = 1_200;
const SDK_COOLDOWN_MS = 60_000;

// 4 requêtes produit ciblées (rate limit SDK : 8 requêtes → 429, on limite)
const PRODUCT_QUERIES = [
  "meilleur smartphone 2026 promo",
  "casque bluetooth sans fil promotion",
  "TV 4K pas cher 2026",
  "ordinateur portable promo",
];

const EXCLUDED_HOSTS = [
  "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
  "tiktok.com", "threads.net", "threads.com", "whatsapp.com",
  "linkedin.com", "pinterest.com", "spotify.com", "wikipedia.org",
  "reddit.com", "quora.com",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastSdkCall = 0;
let sdkCooldownUntil = 0;

let zaiPromise: Promise<any> | null = null;
async function getZai() {
  if (!zaiPromise) {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    zaiPromise = ZAI.create();
  }
  return zaiPromise;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isExcluded(url: string): boolean {
  const h = hostOf(url);
  return !h || EXCLUDED_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}

function isHomepage(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.length === 0;
  } catch {
    return true;
  }
}

/** Extrait le prix du snippet (« à partir de 299 € », « 49,99 € », « 199 $ »…). */
function extractPrice(snippet: string): string | null {
  if (!snippet) return null;
  const m = snippet.match(/(\d[\d\s.,]{1,8}\s?[€$£]|à partir de\s+\d[\d\s.,]+\s?€|dès\s+\d[\d\s.,]+\s?€)/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/** Récupère l'og:image d'une URL (page produit ou article). */
async function fetchProductImage(url: string): Promise<string | null> {
  try {
    const hit = await fetchTextResilient(url, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    if (!hit) return null;
    const html = hit.text.slice(0, 300_000);
    const { image } = extractSiteInfo(html, url);
    if (image) {
      try {
        return new URL(image, url).toString();
      } catch {
        return null;
      }
    }
    // Repli : première <img> plausible du corps
    const imgs = html.match(/<img[^>]+>/gi) ?? [];
    for (const tag of imgs.slice(0, 12)) {
      const src = tag.match(/(?:data-src|src)="([^"]+)"/i)?.[1];
      if (!src || src.startsWith("data:")) continue;
      if (/logo|icon|sprite|avatar|placeholder|default|ads?[-.]/i.test(src)) continue;
      try {
        const abs = new URL(src, url).toString();
        if (/^https?:/.test(abs)) {
          const w = tag.match(/width=["']?(\d+)/i)?.[1];
          if (w && parseInt(w, 10) < 200) continue;
          return abs;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchProducts(query: string): Promise<Array<{ url: string; name: string; snippet: string }>> {
  if (Date.now() < sdkCooldownUntil) return [];
  try {
    const wait = lastSdkCall + SDK_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSdkCall = Date.now();
    const zai = await getZai();
    const results = (await zai.functions.invoke("web_search", { query, num: 8 })) as Array<{
      url?: string;
      name?: string;
      snippet?: string;
    }>;
    return (Array.isArray(results) ? results : [])
      .filter((r) => r && r.url && r.name)
      .filter((r) => !isExcluded(String(r.url)))
      .filter((r) => !isHomepage(String(r.url)))
      .map((r) => ({ url: String(r.url), name: String(r.name), snippet: String(r.snippet ?? "").trim() }));
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (msg.includes("429")) {
      sdkCooldownUntil = Date.now() + SDK_COOLDOWN_MS;
      console.error("web_search shopping: quota atteint (429), pause 60s");
    } else {
      console.error("web_search shopping error:", msg.slice(0, 120));
    }
    return [];
  }
}

const cache = new Map<string, ShoppingCacheEntry>();
const inflight = new Map<string, Promise<ShoppingCacheEntry>>();

async function fetchShopping(): Promise<ShoppingCacheEntry> {
  // 8 requêtes produit en parallèle (avec pacing interne au SDK)
  const allResults = await Promise.all(PRODUCT_QUERIES.map((q) => searchProducts(q)));

  // Fusionne, dédoublonne par URL
  const seen = new Set<string>();
  const candidates: Array<{ url: string; name: string; snippet: string }> = [];
  for (const results of allResults) {
    for (const r of results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      candidates.push(r);
      if (candidates.length >= 30) break;
    }
    if (candidates.length >= 30) break;
  }

  // Extraction og:image en parallèle (lots de 4 pour ne pas saturer)
  const items: ProductItem[] = [];
  const CHUNK = 4;
  for (let i = 0; i < candidates.length && items.length < MAX_ITEMS; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const resolved = await Promise.all(
      chunk.map(async (c) => {
        const image = await fetchProductImage(c.url);
        return { ...c, image };
      }),
    );
    for (const r of resolved) {
      if (!r.image) continue; // filtrage strict : que les produits avec photo
      items.push({
        title: r.name,
        snippet: r.snippet,
        url: r.url,
        host: hostOf(r.url),
        source: hostOf(r.url),
        date: "",
        image: r.image,
        price: extractPrice(r.snippet + " " + r.name),
      });
      if (items.length >= MAX_ITEMS) break;
    }
  }

  return { items, fetchedAt: Date.now() };
}

function ensureFetch(): Promise<ShoppingCacheEntry> {
  if (!inflight.has("shopping")) {
    const p = fetchShopping()
      .then((entry) => {
        cache.set("shopping", entry);
        return entry;
      })
      .finally(() => inflight.delete("shopping"));
    inflight.set("shopping", p);
  }
  return inflight.get("shopping")!;
}

const proxifyImage = (u: string | null) => (u ? `/api/news/image?u=${encodeURIComponent(u)}` : null);

function serve(entry: ShoppingCacheEntry, extra: Record<string, unknown>) {
  warmNewsImages(entry.items.map((i) => i.image));
  return NextResponse.json({
    ...entry,
    items: entry.items.map((i) => ({ ...i, image: proxifyImage(i.image) })),
    ...extra,
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const cached = cache.get("shopping");
  if (!refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return serve(cached, { topic: "shopping", label: "Shopping", cached: true });
  }

  try {
    const entry = await ensureFetch();
    return serve(entry, { topic: "shopping", label: "Shopping", cached: false });
  } catch (err) {
    console.error("GET /api/shopping", err);
    if (cached) {
      return serve(cached, { topic: "shopping", label: "Shopping", cached: true, stale: true });
    }
    return NextResponse.json({ error: "Impossible de récupérer les produits pour le moment" }, { status: 502 });
  }
}
