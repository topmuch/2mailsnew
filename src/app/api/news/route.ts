import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { extractSiteInfo } from "@/lib/crm-api";

// ─── GET /api/news?topic=… : actualités web avec photos ──────────────────────
// 1. web_search (SDK z-ai, backend uniquement) → articles récents du sujet
// 2. pour chaque article : fetch de la page source → extraction de la vraie
//    photo (og:image / twitter:image) via extractSiteInfo (pattern Task 65)
// 3. cache mémoire 30 min par sujet + dédoublonnage des requêtes simultanées ;
//    en cas d'échec réseau, on sert le cache périmé plutôt qu'une page vide.

interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  host: string;
  date: string;
  image: string | null;
}

interface NewsCacheEntry {
  items: NewsItem[];
  fetchedAt: number;
}

const TOPICS: Record<string, { label: string; query: string; recency: number }> = {
  // Requêtes formulées pour cibler des ARTICLES (les requêtes génériques
  // « actualités … » font remonter les pages d'accueil des portails).
  "a-la-une": { label: "À la une", query: "Sénégal gouvernement annonce conseil des ministres", recency: 3 },
  economie: { label: "Économie", query: "Sénégal économie réforme commerce entreprise", recency: 7 },
  tech: { label: "Tech", query: "technologie numérique intelligence artificielle Afrique startup", recency: 7 },
  sport: { label: "Sport", query: "Lions du Sénégal football victoire match", recency: 10 },
};

// Réseaux sociaux & agrégateurs : leurs og:image sont souvent des logos ou
// cassées — on les écarte au profit d'articles de presse.
const EXCLUDED_HOSTS = [
  "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
  "tiktok.com", "threads.net", "threads.com", "news.google.com", "whatsapp.com",
  "linkedin.com", "pinterest.com", "spotify.com", "espn.com", "sofascore.com",
  "flashscore.com", "footmercato.net",
];

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_ITEMS = 9;
const IMAGE_TIMEOUT_MS = 6_000;

/** Écarte les pages d'accueil de portails (URL sans chemin d'article). */
function isHomepage(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.length === 0;
  } catch {
    return true;
  }
}

const cache = new Map<string, NewsCacheEntry>();
const inflight = new Map<string, Promise<NewsCacheEntry>>();

let zaiPromise: Promise<any> | null = null;
async function getZai() {
  if (!zaiPromise) {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    zaiPromise = ZAI.create();
  }
  return zaiPromise;
}

/** Récupère la photo d'un article (og:image / twitter:image), résolue en URL absolue. */
async function fetchArticleImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; 2mails-Actus/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // Les balises <meta> vivent dans le <head> : 300 ko suffisent largement.
    const html = (await res.text()).slice(0, 300_000);
    const { image } = extractSiteInfo(html, url);
    if (!image) return null;
    try {
      return new URL(image, url).toString();
    } catch {
      return null;
    }
  } catch {
    return null; // pas de photo trouvée → dégradation gracieuse (placeholder UI)
  }
}

async function fetchNews(topicKey: string): Promise<NewsCacheEntry> {
  const topic = TOPICS[topicKey];
  const zai = await getZai();
  const results = (await zai.functions.invoke("web_search", {
    query: topic.query,
    num: 18, // sur-recherche : on filtre ensuite portails et réseaux sociaux
    recency_days: topic.recency,
  })) as Array<{ url?: string; name?: string; snippet?: string; host_name?: string; date?: string }>;

  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const picked = (Array.isArray(results) ? results : [])
    .filter((r) => r && r.url && r.name)
    .filter((r) => !EXCLUDED_HOSTS.some((h) => host(r.url as string) === h || host(r.url as string).endsWith(`.${h}`)))
    .filter((r) => !isHomepage(r.url as string))
    .slice(0, MAX_ITEMS);

  const withImages = await Promise.all(
    picked.map(async (r) => ({ r, image: await fetchArticleImage(String(r.url)) })),
  );

  const items: NewsItem[] = withImages.map(({ r, image }) => ({
    title: String(r.name).trim(),
    snippet: String(r.snippet ?? "").trim(),
    url: String(r.url),
    host: String(r.host_name ?? "").replace(/^www\./, ""),
    date: String(r.date ?? ""),
    image,
  }));
  return { items, fetchedAt: Date.now() };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const topicKey = request.nextUrl.searchParams.get("topic") ?? "a-la-une";
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const topic = TOPICS[topicKey];
  if (!topic) return NextResponse.json({ error: "Sujet inconnu" }, { status: 400 });

  const cached = cache.get(topicKey);
  if (!refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached, topic: topicKey, label: topic.label, cached: true });
  }

  // Déduplique les requêtes simultanées sur le même sujet
  if (!inflight.has(topicKey)) {
    const p = fetchNews(topicKey)
      .then((entry) => {
        cache.set(topicKey, entry);
        return entry;
      })
      .finally(() => inflight.delete(topicKey));
    inflight.set(topicKey, p);
  }

  try {
    const entry = await inflight.get(topicKey)!;
    return NextResponse.json({ ...entry, topic: topicKey, label: topic.label, cached: false });
  } catch (err) {
    if (cached) {
      return NextResponse.json({ ...cached, topic: topicKey, label: topic.label, cached: true, stale: true });
    }
    console.error("GET /api/news", err);
    return NextResponse.json({ error: "Impossible de récupérer les actualités pour le moment" }, { status: 502 });
  }
}
