import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { extractSiteInfo } from "@/lib/crm-api";
import { db } from "@/lib/db";
import { warmNewsImages } from "@/lib/news-image-cache";

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

const TOPICS: Record<string, { label: string; rss: string; fallback: string; recency: number; maxAgeDays: number }> = {
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
    rss: gsearch("Sénégal numérique technologie when:10d"),
    fallback: "technologie numérique intelligence artificielle Afrique startup",
    recency: 7,
    maxAgeDays: 11,
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
const MAX_CANDIDATES = 14; // sur-recherche RSS : certains articles n'ont pas de photo trouvable
const IMAGE_TIMEOUT_MS = 6_000;
const RSS_TIMEOUT_MS = 10_000;
const RESOLVE_CHUNK = 3; // petits lots : le SDK web_search est limité en débit (bursts → résultats vides)
const RESOLVE_PAUSE_MS = 450; // respiration entre les lots
const SEARCH_BUDGET_PER_TOPIC = 6; // recherches individuelles max par cycle/sujet (quota SDK)
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
    // UA navigateur complet : plusieurs médias (olympics.com, lequotidien.sn…)
    // bloquent les robots et servaient du vide à l'UA « compatible ».
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // Les balises <meta> vivent dans le <head> : 300 ko suffisent largement.
    const html = (await res.text()).slice(0, 300_000);
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

  // Cache persistant : les articles déjà résolus (cycles précédents) sont
  // réutilisés sans AUCUN appel SDK — c'est ce qui économise le quota.
  const keys = candidates.map((c) => normKey(cleanTitle(c.title, c.sourceName)));
  const dbRows = await db.newsArticle.findMany({ where: { titleKey: { in: keys } } });
  const dbByKey = new Map(dbRows.map((r) => [r.titleKey, r]));

  let budget = SEARCH_BUDGET_PER_TOPIC; // recherches individuelles restantes ce cycle
  const items: NewsItem[] = [];
  for (let i = 0; i < candidates.length && items.length < MAX_ITEMS; i += RESOLVE_CHUNK) {
    if (i > 0) await sleep(RESOLVE_PAUSE_MS);
    const chunk = candidates.slice(i, i + RESOLVE_CHUNK);
    const resolved = await Promise.all(
      chunk.map(async (c) => {
        const title = cleanTitle(c.title, c.sourceName);
        const key = normKey(title);
        const source = c.sourceName || hostOf(c.sourceUrl) || hostOf(c.link);
        const date = fmtFrRelative(c.pubDate);

        // 1. Déjà résolu lors d'un cycle précédent → réutilise (0 appel SDK)
        const cachedRow = dbByKey.get(key);
        if (cachedRow) {
          let image = cachedRow.image;
          if (!image) {
            image = await fetchArticleImage(cachedRow.url);
            if (image) {
              await db.newsArticle
                .update({ where: { id: cachedRow.id }, data: { image } })
                .catch(() => {});
            }
          }
          return {
            title, snippet: cachedRow.snippet, url: cachedRow.url,
            host: cachedRow.host || hostOf(cachedRow.url), source, date, image,
          } as NewsItem;
        }

        // 2. Article inconnu : résolution web_search dans la limite du budget
        if (budget > 0 && Date.now() >= sdkCooldownUntil) {
          budget--;
          const pub = await resolvePublisher(title);
          if (pub) {
            const image = await fetchArticleImage(pub.url);
            const publishedAt = new Date(c.pubDate);
            await db.newsArticle
              .upsert({
                where: { titleKey: key },
                create: {
                  titleKey: key, title, url: pub.url, host: hostOf(pub.url),
                  source, snippet: pub.snippet.slice(0, 500), image,
                  topicKey, publishedAt: Number.isFinite(publishedAt.getTime()) ? publishedAt : null,
                },
                update: { image, snippet: pub.snippet.slice(0, 500) },
              })
              .catch(() => {});
            return { title, snippet: pub.snippet, url: pub.url, host: hostOf(pub.url), source, date, image } as NewsItem;
          }
        }

        // 3. Non résolu : lien Google conservé (cliquable depuis un navigateur) ;
        //    sera complété aux cycles suivants quand le quota sera disponible.
        return { title, snippet: "", url: c.link, host: hostOf(c.sourceUrl) || hostOf(c.link), source, date, image: null } as NewsItem;
      }),
    );
    items.push(...resolved);
  }
  return { items: items.slice(0, MAX_ITEMS), fetchedAt: Date.now(), provider: "google" };
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
  return NextResponse.json({
    ...entry,
    items: entry.items.map((i) => ({ ...i, image: proxifyImage(i.image) })),
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
    // Source primaire : Google Actualités
    const entry = await ensureFetch(topicKey, () => fetchNewsGoogle(topicKey));
    return serve(entry, { topic: topicKey, label: topic.label, cached: false });
  } catch (googleErr) {
    // Repli : pipeline recherche web, puis cache périmé, sinon erreur.
    try {
      const entry = await ensureFetch(`${topicKey}::search`, () => fetchNewsSearch(topicKey));
      return serve(entry, { topic: topicKey, label: topic.label, cached: false, fallback: true });
    } catch (searchErr) {
      if (cached) {
        return serve(cached, { topic: topicKey, label: topic.label, cached: true, stale: true });
      }
      console.error("GET /api/news", googleErr, searchErr);
      return NextResponse.json({ error: "Impossible de récupérer les actualités pour le moment" }, { status: 502 });
    }
  }
}
