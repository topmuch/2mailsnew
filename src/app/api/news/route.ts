import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { extractSiteInfo } from "@/lib/crm-api";
import { db } from "@/lib/db";
import { fetchTextResilient } from "@/lib/fetch-mirrors";
import { warmNewsImages } from "@/lib/news-image-cache";
import { harvestFeedImages } from "@/lib/news-feed-images";

// ─── GET /api/news?topic=… : actualités Google Actualités, avec photos ───────
// Source primaire (Task 69, demande utilisateur) : flux RSS public de Google
// Actualités (news.google.com) — fil par sujet, classement éditorial Google.
// Chaque lien Google est résolu vers l'article réel de l'éditeur pour
// récupérer l'extrait et la VRAIE photo (og:image / twitter:image).
// Le quota de l'outil web_search étant strict (HTTP 429 au-delà de quelques
// appels rapprochés), la résolution est fortement économe :
//   1. cache mémoire 30 min/sujet (aucun appel SDK) ;
//   2. table NewsArticle en base : un article déjà résolu est réutilisé tel
//      quel (aucun appel SDK) ;
//   3. budget limité de recherches individuelles par cycle (6/sujet),
//      espacées (pacing global) ; dès un 429, pause de 60 s sur tout le
//      module ; les articles non résolus gardent leur lien Google (cliquable
//      depuis un navigateur) et seront complétés aux cycles suivants.
// Repli : si le flux Google échoue, pipeline recherche web z-ai (Task 68).

interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  host: string;
  source: string; // nom du média (ex. « RFI », « Le Soleil »)
  date: string; // déjà formatée en français, prête à afficher
  image: string | null;
}

interface NewsCacheEntry {
  items: NewsItem[];
  fetchedAt: number;
  provider: "google" | "search";
}

const GNEWS_PARAMS = "hl=fr&gl=SN&ceid=SN:fr";
const gsearch = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${GNEWS_PARAMS}`;

const TOPICS: Record<string, {
  label: string;
  rss: string; // Google News (sujets classiques)
  fallback: string;
  recency: number;
  maxAgeDays: number;
  // Flux RSS directs (Task 74) : utilisés comme source PRIMAIRE d'articles
  // pour les sujets où Google News ne fournit pas d'images (ex. Tech).
  // Chaque flux publie la photo de chaque article via media:content/enclosure.
  directFeeds?: { url: string; label: string }[];
}> = {
  // Requêtes Google News : ciblent des ARTICLES (les requêtes trop génériques
  // font remonter les pages d'accueil des portails). « À la une » = fil
  // principal Google Actualités Sénégal. L'opérateur when:Xd limite aux
  // articles récents (certains fils de recherche remontent de vieux articles).
  "a-la-une": {
    label: "À la une",
    rss: `https://news.google.com/rss?${GNEWS_PARAMS}`,
    fallback: "Sénégal gouvernement annonce conseil des ministres",
    recency: 3,
    maxAgeDays: 4,
  },
  economie: {
    label: "Économie",
    rss: gsearch("Sénégal économie when:7d"),
    fallback: "Sénégal économie réforme commerce entreprise",
    recency: 7,
    maxAgeDays: 8,
  },
  tech: {
    label: "Tech",
    rss: "", // non utilisé : directFeeds sert de source primaire
    fallback: "intelligence artificielle IA technologie numérique",
    recency: 14,
    maxAgeDays: 14,
    // 12 flux High-Tech / IA (testés 100 % images via media:content/enclosure).
    // Priorité IA (3 premiers), puis grands médias tech français.
    directFeeds: [
      { url: "https://www.actuia.com/feed/", label: "ActuIA" },
      { url: "https://www.ia-france.fr/feed", label: "IA France" },
      { url: "https://www.lemonde.fr/pixels/rss_full.xml", label: "Le Monde Pixels" },
      { url: "https://www.frandroid.com/feed", label: "Frandroid" },
      { url: "https://www.clubic.com/articles.rss", label: "Clubic" },
      { url: "https://numerama.com/feed/", label: "Numerama" },
      { url: "https://www.zdnet.fr/feeds/rss/actualites/", label: "ZDNet" },
      { url: "https://www.silicon.fr/feed", label: "Silicon" },
      { url: "https://www.itespresso.fr/feed/", label: "ITespresso" },
      { url: "https://www.blogdumoderateur.com/feed/", label: "BDM" },
      { url: "https://www.journaldunet.com/rss/", label: "JDN" },
      { url: "https://www.phonandroid.com/feed/", label: "Phonandroid" },
    ],
  },
  sport: {
    label: "Sport",
    rss: gsearch("Sénégal sport when:10d"),
    fallback: "Lions du Sénégal football victoire match",
    recency: 10,
    maxAgeDays: 11,
  },
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
const MAX_CANDIDATES = 24; // sur-recherche : le filtrage strict sans-image en écarte une partie
const IMAGE_TIMEOUT_MS = 6_000;
const RSS_TIMEOUT_MS = 10_000;
const RESOLVE_CHUNK = 3; // petits lots : le SDK web_search est limité en débit (bursts → résultats vides)
const RESOLVE_PAUSE_MS = 450; // respiration entre les lots
const SEARCH_BUDGET_PER_TOPIC = 2; // dernier recours seulement (harvestFeedImages couvre la majorité)
const SDK_MIN_GAP_MS = 1_200; // respiration globale entre deux appels web_search
const SDK_COOLDOWN_MS = 60_000; // pause après un 429

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastSdkCall = 0; // pacing global module (toutes les routes/sujets)
let sdkCooldownUntil = 0; // 0 = pas de pause en cours

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

// ─── Utilitaires ─────────────────────────────────────────────────────────────

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

/** Écarte les pages d'accueil de portails (URL sans chemin d'article). */
function isHomepage(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.length === 0;
  } catch {
    return true;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(quot|ldquo|rdquo);/g, '"')
    .replace(/&(apos|lsquo|rsquo|#39);/g, "'")
    .replace(/&(lt|#60);/g, "<")
    .replace(/&(gt|#62);/g, ">")
    .replace(/&(nbsp|#160);/g, " ")
    .replace(/&amp;/g, "&");
}

/** Date RFC822 → libellé français relatif prêt à afficher (« il y a 3 h », « hier »…). */
function fmtFrRelative(rfc822: string): string {
  const t = new Date(rfc822).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(1, Math.round((Date.now() - t) / 60_000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return "hier";
  const j = Math.round(h / 24);
  if (j < 8) return `il y a ${j} j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(t);
}

/** Clé de dédoublonnage : titre normalisé sans accents ni ponctuation. */
function normKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 70);
}

/** Google colle le nom du média à la fin du titre (« … - RFI ») : on l'enlève. */
function cleanTitle(title: string, sourceName: string): string {
  let t = title.trim();
  if (sourceName) {
    const esc = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s+-\\s+${esc}\\s*$`, "i"), "");
  }
  t = t.replace(/\s+-\s+[a-z0-9-]+(\.[a-z0-9-]+)+\s*$/i, ""); // suffixe type « - lesoleil.sn »
  return t.trim() || title.trim();
}

// ─── Flux RSS Google Actualités ──────────────────────────────────────────────

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  sourceName: string;
  sourceUrl: string;
}

async function fetchRssXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; 2mails-Actus/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(RSS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Flux Google Actualités indisponible (HTTP ${res.status})`);
  return res.text();
}

function parseRssItems(xml: string): RssItem[] {
  const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const items: RssItem[] = [];
  for (const b of blocks) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeEntities(stripCdata(m[1])).trim() : "";
    };
    const title = pick("title");
    const link = pick("link");
    const pubDate = pick("pubDate");
    const src = b.match(/<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const sourceUrl = src ? decodeEntities(src[1]).trim() : "";
    const sourceName = src ? decodeEntities(stripCdata(src[2])).trim() : "";
    if (title && link) items.push({ title, link, pubDate, sourceName, sourceUrl });
  }
  return items;
}

// ─── Résolution d'un article Google → éditeur réel + photo ───────────────────

/** Repli photo : première image « sérieuse » du corps de l'article (non-logo). */
function extractFallbackImage(html: string, baseUrl: string): string | null {
  const imgs = html.match(/<img[^>]+>/gi) ?? [];
  for (const tag of imgs.slice(0, 12)) {
    const src = tag.match(/(?:data-src|src)="([^"]+)"/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    if (/logo|icon|sprite|avatar|placeholder|default|banner|ads?[-.]/i.test(src)) continue;
    let abs: string | null = null;
    try {
      abs = new URL(src, baseUrl).toString();
    } catch {
      abs = null;
    }
    if (!abs || !/^https?:/.test(abs)) continue;
    const w = tag.match(/width=["']?(\d+)/i)?.[1];
    if (w && parseInt(w, 10) < 200) continue; // vignettes décoratives
    return abs;
  }
  return null;
}

/** Récupère la photo d'un article (og:image / twitter:image), résolue en URL absolue. */
async function fetchArticleImage(url: string): Promise<string | null> {
  try {
    // UA navigateur complet + relais en repli (fetchTextResilient) : plusieurs
    // médias (olympics.com, lequotidien.sn, xalimasn…) bloquent les robots et
    // l'IP du serveur — le direct échoue (403), les relais publiques passent.
    const hit = await fetchTextResilient(url, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    if (!hit) return null;
    // Les balises <meta> vivent dans le <head> : 300 ko suffisent largement.
    const html = hit.text.slice(0, 300_000);
    const { image } = extractSiteInfo(html, url);
    const picked = image ?? extractFallbackImage(html, url);
    if (!picked) return null;
    try {
      return new URL(picked, url).toString();
    } catch {
      return null;
    }
  } catch {
    return null; // pas de photo trouvée → dégradation gracieuse (placeholder UI)
  }
}

async function searchCandidates(query: string): Promise<Array<{ url: string; name: string; snippet: string }>> {
  if (Date.now() < sdkCooldownUntil) return []; // quota en pause : aucun appel
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
      console.error("web_search: quota atteint (429), pause de 60 s sur tout le module");
    } else {
      console.error("web_search: échec de recherche candidates", msg);
    }
    return [];
  }
}

/**
 * Les liens Google Actualités sont des redirections JS non exploitables côté
 * serveur : on retrouve l'article de l'éditeur en cherchant le titre.
 * Requête 1 : les mots significatifs du titre (testée la plus fiable, ~0,9 s) ;
 * requête 2 (recul) : le titre complet tronqué. Le candidat retenu est celui
 * dont le titre partage le plus de mots avec l'article Google.
 */
async function resolvePublisher(title: string): Promise<{ url: string; snippet: string } | null> {
  const words = title
    .replace(/[«»'".,:;!?()\[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 9)
    .join(" ");
  const queries = [words, title.slice(0, 120)].filter((q) => q && q.length > 8);
  const keyWords = normKey(title).split(" ").filter((w) => w.length > 4);
  for (const q of queries) {
    const cands = await searchCandidates(q);
    if (!cands.length) continue;
    const scored = cands
      .map((c) => {
        const cn = normKey(c.name);
        return { c, overlap: keyWords.filter((w) => cn.includes(w)).length };
      })
      .sort((a, b) => b.overlap - a.overlap);
    return { url: scored[0].c.url, snippet: scored[0].c.snippet };
  }
  return null;
}

// ─── Flux RSS directs (Task 74) : source PRIMAIRE pour Tech ──────────────────
// Pour les sujets où Google News ne fournit pas d'images (ex. Tech), on parse
// directement des flux RSS d'éditeurs qui publient la photo de chaque article
// via media:content/enclosure. Aucune résolution d'URL, aucun appel SDK — les
// articles arrivent déjà avec leur image, prêts à afficher.

function extractFeedImage(block: string, feedBase: string): string | null {
  const imgRej = /logo|icon|avatar|ads?[-_.]|gravatar|spinner|placeholder|default/i;
  // 1. media:content / media:thumbnail (Yahoo Media RSS)
  const media =
    block.match(/<media:content[^>]*\burl="([^"]+)"[^>]*>/i) ??
    block.match(/<media:thumbnail[^>]*\burl="([^"]+)"[^>]*>/i);
  if (media) {
    try {
      const u = new URL(decodeEntities(media[1]), feedBase).toString();
      if (!imgRej.test(u)) return u;
    } catch { /* ignore */ }
  }
  // 2. enclosure image/*
  const enc = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*>/i);
  if (enc && /type="image\//i.test(enc[0])) {
    try {
      const u = new URL(decodeEntities(enc[1]), feedBase).toString();
      if (!imgRej.test(u)) return u;
    } catch { /* ignore */ }
  }
  // 3. <img> du content:encoded / description
  const body = block.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
  if (body) {
    try {
      const u = new URL(decodeEntities(body[1]), feedBase).toString();
      if (!imgRej.test(u) && !u.startsWith("data:")) return u;
    } catch { /* ignore */ }
  }
  return null;
}

function parseDirectFeed(xml: string, feedBase: string, sourceLabel: string): NewsItem[] {
  const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  const items: NewsItem[] = [];
  for (const b of blocks) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? decodeEntities(stripCdata(m[1])).trim() : "";
    };
    const title = pick("title");
    const link = pick("link");
    const pubDate = pick("pubDate");
    if (!title || !link) continue;
    if (isExcluded(link)) continue;
    const image = extractFeedImage(b, feedBase);
    items.push({
      title,
      snippet: "",
      url: link,
      host: hostOf(link),
      source: sourceLabel,
      date: fmtFrRelative(pubDate),
      image,
    });
  }
  return items;
}

async function fetchDirectFeeds(topicKey: string): Promise<NewsCacheEntry> {
  const topic = TOPICS[topicKey];
  if (!topic.directFeeds?.length) throw new Error("Pas de flux directs pour ce sujet");

  // Charge tous les flux en parallèle via fetchTextResilient (direct + relais)
  const feeds = await Promise.all(
    topic.directFeeds.map(async (f) => {
      try {
        const hit = await fetchTextResilient(f.url, {
          accept: "application/rss+xml, application/xml, text/xml, */*",
          timeoutMs: RSS_TIMEOUT_MS,
        });
        if (!hit) return [] as NewsItem[];
        return parseDirectFeed(hit.text, f.url, f.label);
      } catch {
        return [] as NewsItem[];
      }
    })
  );

  // Fusionne, dédoublonne par titre normalisé
  const all = feeds.flat();
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const it of all) {
    const key = normKey(it.title);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
    if (items.length >= MAX_CANDIDATES) break;
  }

  if (!items.length) throw new Error("Tous les flux directs sont indisponibles");
  return { items, fetchedAt: Date.now(), provider: "google" };
}

async function fetchNewsGoogle(topicKey: string): Promise<NewsCacheEntry> {
  const topic = TOPICS[topicKey];
  const xml = await fetchRssXml(topic.rss);
  const rss = parseRssItems(xml);
  if (!rss.length) throw new Error("Flux Google Actualités vide");

  // Ne garde que les articles récents (certains fils de recherche remontent
  // de vieux articles classés par pertinence et non par date).
  const cutoff = Date.now() - topic.maxAgeDays * 86_400_000;
  const recent = rss.filter((it) => {
    const t = new Date(it.pubDate).getTime();
    return !Number.isFinite(t) || t >= cutoff;
  });

  // Dédoublonnage (une même dépêche revient souvent chez plusieurs médias)
  const seen = new Set<string>();
  const candidates: RssItem[] = [];
  const pool = recent.length ? recent : rss;
  for (const it of pool) {
    const key = normKey(cleanTitle(it.title, it.sourceName));
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(it);
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  // ── Construction des items initiaux (sans image) ───────────────────────────
  // Les liens Google Actualités sont désormais chiffrés (non résolvables côté
  // serveur) : on les conserve tels quels (cliquables dans un navigateur) et
  // on se concentre sur récupérer la PHOTO par d'autres canaux.
  interface WorkItem extends NewsItem {
    _key: string;
    _pubDate: string;
  }
  const items: WorkItem[] = candidates.map((c) => {
    const title = cleanTitle(c.title, c.sourceName);
    const source = c.sourceName || hostOf(c.sourceUrl) || hostOf(c.link);
    const date = fmtFrRelative(c.pubDate);
    const host = hostOf(c.sourceUrl) || hostOf(c.link);
    return { title, snippet: "", url: c.link, host, source, date, image: null, _key: normKey(title), _pubDate: c.pubDate };
  });

  // ── PHASE 1 : harvestFeedImages — source PRIMAIRE (gratuite, fiable) ───────
  // Les flux RSS directs des éditeurs (RFI, France 24, Le Monde, BBC, Africanews,
  // SeneNews, SeneWeb…) publient la photo de chaque article via media:content /
  // enclosure. On rapproche par titre normalisé. 0 appel SDK, 0 quota.
  const sansPhoto1 = items.filter((it) => !it.image);
  if (sansPhoto1.length > 0) {
    try {
      await harvestFeedImages(
        sansPhoto1.map((it) => ({ key: it._key, host: it.host })),
        (key, url) => {
          const it = sansPhoto1.find((x) => x._key === key);
          if (it && !it.image) it.image = url;
        }
      );
    } catch {
      // best effort : la phase suivante compensera
    }
  }

  // ── PHASE 2 : cache persistant DB (cycles précédents) ──────────────────────
  // Les articles déjà résolus lors d'un cycle précédent sont réutilisés sans
  // AUCUN appel SDK. On récupère aussi l'URL réelle de l'éditeur si elle a été
  // résolue lors d'un cycle antérieur (le lien Google chiffré devient le vrai).
  const sansPhoto2 = items.filter((it) => !it.image);
  const dbByKey = new Map<string, { id: string; image: string | null; snippet: string; url: string; host: string }>();
  if (sansPhoto2.length > 0) {
    const keys2 = sansPhoto2.map((it) => it._key);
    const dbRows = await db.newsArticle.findMany({ where: { titleKey: { in: keys2 } } });
    for (const r of dbRows) dbByKey.set(r.titleKey, r);
    for (const it of sansPhoto2) {
      const row = dbByKey.get(it._key);
      if (!row) continue;
      if (row.image) it.image = row.image;
      if (row.snippet) it.snippet = row.snippet;
      // URL réelle de l'éditeur (résolue lors d'un cycle précédent) → remplace le lien Google
      if (row.url && !row.url.includes("news.google.com")) {
        it.url = row.url;
        if (row.host) it.host = row.host;
      }
    }
  }

  // ── PHASE 3 : web_search — dernier recours (budget réduit) ─────────────────
  // La Phase 1 (harvest) couvre désormais la majorité des articles. Le SDK
  // n'est sollicité QUE pour les articles toujours sans photo. Budget réduit à
  // 2/sujet (au lieu de 6) car la plupart des sources ont désormais un flux RSS
  // connu. Dès un 429, pause de 60 s sur tout le module.
  let budget = SEARCH_BUDGET_PER_TOPIC;
  const sansPhoto3 = items.filter((it) => !it.image);
  for (let i = 0; i < sansPhoto3.length && budget > 0 && Date.now() >= sdkCooldownUntil; i += RESOLVE_CHUNK) {
    if (i > 0) await sleep(RESOLVE_PAUSE_MS);
    const chunk = sansPhoto3.slice(i, i + RESOLVE_CHUNK);
    await Promise.all(
      chunk.map(async (it) => {
        if (it.image) return; // déjà résolu par une phase précédente
        if (budget <= 0 || Date.now() < sdkCooldownUntil) return;
        budget--;
        const pub = await resolvePublisher(it.title);
        if (!pub) return;
        const image = await fetchArticleImage(pub.url);
        if (image) {
          it.image = image;
          it.snippet = pub.snippet;
          it.url = pub.url;
          it.host = hostOf(pub.url);
        }
      }),
    );
  }

  // ── Persistance : on enregistre images + snippets pour les cycles suivants ─
  for (const it of items) {
    if (!it.image && !it.snippet) continue; // rien de nouveau à stocker
    const publishedAt = new Date(it._pubDate);
    try {
      await db.newsArticle.upsert({
        where: { titleKey: it._key },
        create: {
          titleKey: it._key,
          title: it.title,
          url: it.url,
          host: it.host,
          source: it.source,
          snippet: it.snippet.slice(0, 500),
          image: it.image,
          topicKey,
          publishedAt: Number.isFinite(publishedAt.getTime()) ? publishedAt : null,
        },
        update: {
          ...(it.image ? { image: it.image } : {}),
          ...(it.snippet ? { snippet: it.snippet.slice(0, 500) } : {}),
          ...(it.url && !it.url.includes("news.google.com") ? { url: it.url, host: it.host } : {}),
        },
      });
    } catch {
      // persistance best effort : le cycle suivant réessaiera
    }
  }

  // Nettoyage de la clé interne avant retour
  const cleanItems: NewsItem[] = items.map(({ _key, _pubDate, ...rest }) => rest);
  return { items: cleanItems.slice(0, MAX_ITEMS), fetchedAt: Date.now(), provider: "google" };
}

// ─── Repli : pipeline recherche web (Task 68) ────────────────────────────────

async function fetchNewsSearch(topicKey: string): Promise<NewsCacheEntry> {
  const topic = TOPICS[topicKey];
  const zai = await getZai();
  const results = (await zai.functions.invoke("web_search", {
    query: topic.fallback,
    num: 18, // sur-recherche : on filtre ensuite portails et réseaux sociaux
    recency_days: topic.recency,
  })) as Array<{ url?: string; name?: string; snippet?: string; host_name?: string; date?: string }>;

  const picked = (Array.isArray(results) ? results : [])
    .filter((r) => r && r.url && r.name)
    .filter((r) => !isExcluded(String(r.url)))
    .filter((r) => !isHomepage(String(r.url)))
    .slice(0, MAX_ITEMS);

  const withImages = await Promise.all(
    picked.map(async (r) => ({ r, image: await fetchArticleImage(String(r.url)) })),
  );

  const items: NewsItem[] = withImages.map(({ r, image }) => ({
    title: String(r.name).trim(),
    snippet: String(r.snippet ?? "").trim(),
    url: String(r.url),
    host: String(r.host_name ?? "").replace(/^www\./, ""),
    source: "",
    date: fmtFrRelative(String(r.date ?? "")),
    image,
  }));
  return { items, fetchedAt: Date.now(), provider: "search" };
}

// ─── Route ───────────────────────────────────────────────────────────────────

/**
 * Les photos sont servies via notre proxy même origine (/api/news/image) :
 * les médias bloquent l'affichage direct depuis un autre domaine (anti-hotlink
 * via Referer) et le contenu mixte http:// est rejeté quand l'app est en
 * https. La base garde l'URL canonique ; seul l'affichage passe par le proxy.
 */
const proxifyImage = (u: string | null) => (u ? `/api/news/image?u=${encodeURIComponent(u)}` : null);

function serve(entry: NewsCacheEntry, extra: Record<string, unknown>) {
  // Préchauffage du cache disque des photos : dès qu'un lot d'articles est
  // servi, ses images sont récupérées en arrière-plan et conservées sur le
  // disque — l'affichage utilisateur devient instantané et ne dépend plus
  // de la disponibilité des sites des médias au moment du clic.
  warmNewsImages(entry.items.map((i) => i.image));
  // Task 74 : filtrage STRICT des articles sans image (demande utilisateur).
  // Les sources sans image sont écartées — le mur d'actus n'affiche que des
  // cartes illustrées. Si le filtrage laisse moins d'articles que MAX_ITEMS,
  // c'est voulu : mieux vaut peu d'articles mais tous avec photo.
  const withImages = entry.items.filter((it) => it.image);
  return NextResponse.json({
    ...entry,
    items: withImages.map((i) => ({ ...i, image: proxifyImage(i.image) })),
    ...extra,
  });
}

function ensureFetch(key: string, run: () => Promise<NewsCacheEntry>): Promise<NewsCacheEntry> {
  if (!inflight.has(key)) {
    const p = run()
      .then((entry) => {
        cache.set(key, entry);
        return entry;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
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
    return serve(cached, { topic: topicKey, label: topic.label, cached: true });
  }

  try {
    // Source primaire : flux RSS directs si le sujet en a (ex. Tech), sinon Google Actualités
    const entry = topic.directFeeds?.length
      ? await ensureFetch(topicKey, () => fetchDirectFeeds(topicKey))
      : await ensureFetch(topicKey, () => fetchNewsGoogle(topicKey));
    return serve(entry, { topic: topicKey, label: topic.label, cached: false });
  } catch (primaryErr) {
    // Repli : pipeline recherche web, puis cache périmé, sinon erreur.
    try {
      const entry = await ensureFetch(`${topicKey}::search`, () => fetchNewsSearch(topicKey));
      return serve(entry, { topic: topicKey, label: topic.label, cached: false, fallback: true });
    } catch (searchErr) {
      if (cached) {
        return serve(cached, { topic: topicKey, label: topic.label, cached: true, stale: true });
      }
      console.error("GET /api/news", primaryErr, searchErr);
      return NextResponse.json({ error: "Impossible de récupérer les actualités pour le moment" }, { status: 502 });
    }
  }
}
