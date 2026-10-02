// ─── Photos depuis les flux RSS des éditeurs (onglet Actus) ─────────────────
// Contexte : beaucoup de médias sénégalais bloquent désormais le fetch serveur
// de leurs PAGES (403 anti-robot), ce qui prive de photo les articles concernés.
// Mais leurs FLUX RSS restent accessibles (ils sont faits pour la syndication)
// et plusieurs y publient la photo de chaque article (media:content,
// enclosure, ou <img> du corps). Cette lib récolte ces photos (1 h de cache,
// échecs mis en cache aussi) et les associe aux articles sans photo par
// similarité de titre — sans AUCUN appel au SDK de recherche (0 quota).
// Les flux sont récupérés via fetchTextResilient : direct d'abord, puis relais
// publics — un média qui bloque l'IP du serveur (production) ne bloque pas
// forcément les relais, et inversement le direct reste prioritaire.

import { fetchTextResilient } from "@/lib/fetch-mirrors";

interface FeedImageMap {
  imgs: Map<string, string>;
  ok: boolean;
  at: number;
}

const FEED_TTL_MS = 60 * 60_000; // 1 h
const FEED_TIMEOUT_MS = 6_000;

/** Décode les entités HTML (&amp; &#8217; …) — même logique que côté api/news. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// Flux connus (les sites bloqués échoueront vite et seront mis en cache négatif).
const FEED_CANDIDATES: Record<string, string[]> = {
  "www.senenews.com": ["https://www.senenews.com/feed"],
  "senenews.com": ["https://www.senenews.com/feed"],
  "aps.sn": ["https://aps.sn/feed/", "https://aps.sn/feed"],
  "lesoleil.sn": ["https://lesoleil.sn/feed/", "https://lesoleil.sn/feed"],
  "leral.net": ["https://www.leral.net/feed/", "https://leral.net/feed/"],
  "www.leral.net": ["https://www.leral.net/feed/", "https://leral.net/feed/"],
  "dakaractu.com": ["https://www.dakaractu.com/rss.xml", "https://www.dakaractu.com/feed/"],
  "www.dakaractu.com": ["https://www.dakaractu.com/rss.xml", "https://www.dakaractu.com/feed/"],
  "actussenegal.com": ["https://actussenegal.com/feed/"],
  "seneweb.com": ["https://seneweb.com/rss.xml"],
};

// Hôtes dont on sait déjà que le flux est vide d'images ou bloqué : on évite
// de retester inutilement (retesté quand même toutes les 1 h via le TTL).
const feedCache = new Map<string, FeedImageMap>();

/** Même normalisation que côté api/news (clé de rapprochement des titres). */
function normKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function absoluteUrl(src: string, base: string): string | null {
  try {
    return new URL(decodeEntities(src), base).toString();
  } catch {
    return null;
  }
}

/** Extrait la photo d'un bloc <item> de flux éditeur (media:content, enclosure, corps). */
function itemImage(block: string, feedBase: string): string | null {
  const imgRejection = /logo|icon|avatar|ads?[-_.]|gravatar|spinner|placeholder|default/i;

  const media =
    block.match(/<media:content[^>]*\burl="([^"]+)"[^>]*>/i) ??
    block.match(/<media:thumbnail[^>]*\burl="([^"]+)"[^>]*>/i);
  if (media) {
    const url = absoluteUrl(media[1], feedBase);
    if (url && !imgRejection.test(url)) return url;
  }
  const enc = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*>/i);
  if (enc && /type="image\//i.test(enc[0])) {
    const url = absoluteUrl(enc[1], feedBase);
    if (url && !imgRejection.test(url)) return url;
  }
  // Corps HTML (content:encoded / description) : première image plausible.
  const body = block.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
  if (body) {
    const url = absoluteUrl(body[1], feedBase);
    if (url && !imgRejection.test(url) && !url.startsWith("data:")) return url;
  }
  return null;
}

/** Télécharge le flux d'un éditeur et renvoie titre normalisé → photo. */
async function loadFeedMap(host: string): Promise<Map<string, string>> {
  const hit = feedCache.get(host);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.ok ? hit.imgs : new Map();

  const candidates = FEED_CANDIDATES[host] ?? [`https://${host}/feed`, `https://${host}/rss`];
  const imgs = new Map<string, string>();

  for (const url of candidates.slice(0, 2)) {
    try {
      const hit = await fetchTextResilient(url, {
        accept: "application/rss+xml, application/xml, text/xml, */*",
        timeoutMs: FEED_TIMEOUT_MS,
      });
      if (!hit) continue;
      const xml = hit.text;
      const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
      for (const b of blocks) {
        const titleM = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (!titleM) continue;
        const title = decodeEntities(titleM[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
        if (!title) continue;
        const img = itemImage(b, url);
        if (img) imgs.set(normKey(title), img);
      }
      if (imgs.size > 0) break;
    } catch {
      // flux suivant
    }
  }

  feedCache.set(host, { imgs, ok: imgs.size > 0, at: Date.now() });
  return imgs;
}

/** Meilleure correspondance floue : recouvrement de mots ≥ 60 %. */
function bestMatch(
  imgs: Map<string, string>,
  key: string
): string | null {
  if (imgs.has(key)) return imgs.get(key)!;
  const words = new Set(key.split(" ").filter((w) => w.length > 3));
  if (words.size === 0) return null;
  let best: { url: string; score: number } | null = null;
  for (const [k, url] of imgs) {
    const kw = k.split(" ").filter((w) => w.length > 3);
    if (kw.length === 0) continue;
    const inter = kw.filter((w) => words.has(w)).length;
    const score = inter / Math.min(words.size, kw.length);
    if (score >= 0.6 && (!best || score > best.score)) best = { url, score };
  }
  return best?.url ?? null;
}

export interface FeedImageTarget {
  /** Clé de titre normalisée (normKey du titre). */
  key: string;
  /** Domaine de l'éditeur (pas news.google.com). */
  host: string;
}

/**
 * Rattache des photos aux articles sans photo en interrogeant les flux des
 * éditeurs concernés. `setImage(key, url)` est appelé pour chaque photo
 * trouvée — l'appelant s'occupe de mettre à jour l'item et la base.
 */
export async function harvestFeedImages(
  targets: FeedImageTarget[],
  setImage: (key: string, url: string) => void
): Promise<void> {
  const byHost = new Map<string, FeedImageTarget[]>();
  for (const t of targets) {
    if (!t.host || t.host.includes("news.google.com")) continue;
    const list = byHost.get(t.host) ?? [];
    list.push(t);
    byHost.set(t.host, list);
  }
  await Promise.all(
    [...byHost.entries()].slice(0, 4).map(async ([host, list]) => {
      const imgs = await loadFeedMap(host);
      if (imgs.size === 0) return;
      for (const t of list) {
        const url = bestMatch(imgs, t.key);
        if (url) setImage(t.key, url);
      }
    })
  );
}
