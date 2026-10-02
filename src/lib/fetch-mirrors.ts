// ─── Relais de récupération (photos & flux de l'onglet Actus) ────────────────
// Problème : depuis un serveur hébergé (IP de datacenter), plusieurs médias
// bloquent TOUT fetch sortant de notre part (403 anti-robot) — pages
// d'articles, flux RSS, et surtout PHOTOS. En local ça passe, en production
// presque plus rien : d'où des articles dont une seule photo s'affiche.
// Solution : en cas d'échec du fetch direct, repasser par des relais publics
// spécialisés qui récupèrent la ressource depuis LEURS propres réseaux :
// - wsrv.nl / images.weserv.nl : CDN d'images (fronté Cloudflare) très
//   largement autorisé par les sites de presse — sert la photo d'origine ;
// - allorigins / cors.lol / codetabs : relais HTTP génériques pour les pages
//   HTML (og:image) et les flux XML/RSS des éditeurs.
// Stratégie : DIRECT d'abord (plus rapide, aucun tiers), puis COURSE PARALLÈLE
// des relais (le premier qui répond gagne — Promise.any). Toutes les réponses
// restent validées par l'appelant (magic bytes pour les images, plafond de
// taille, timeouts courts) — un relais n'est qu'un canal.

const MIRROR_TIMEOUT_MS = 9_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Hôtes interdits (SSRF) — même garde-fou que pour le fetch direct :
// boucle locale, réseau privé, lien local, IPv6 ULA.
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|172\.(1[6-9]|2\d|3[01])\.|\[::1?\]|\[fc|\[fd|\[fe80)/i;

/** Relais images : le CDN récupère la photo pour nous. */
function imageMirrors(url: string): string[] {
  const enc = encodeURIComponent(url);
  return [`https://wsrv.nl/?url=${enc}`, `https://images.weserv.nl/?url=${enc}`];
}

/** Relais HTML/XML : le relais récupère la page ou le flux pour nous. */
function textMirrors(url: string): string[] {
  const enc = encodeURIComponent(url);
  return [
    `https://api.allorigins.win/raw?url=${enc}`,
    `https://api.cors.lol/?url=${enc}`,
    `https://api.codetabs.com/v1/proxy?quest=${enc}`,
  ];
}

/** Garde-fou commun : URL http(s) et hôte public uniquement. */
function isAllowedUrl(rawUrl: string): boolean {
  try {
    const target = new URL(rawUrl);
    return /^https?:$/.test(target.protocol) && !PRIVATE_HOST.test(target.hostname);
  } catch {
    return false;
  }
}

/** Un fetch de relais : résout la Response, rejette si indisponible. */
function relayFetch(url: string, accept: string, timeoutMs: number): Promise<Response> {
  return (async () => {
    const res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": UA },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`relais HTTP ${res.status}`);
    return res;
  })();
}

/**
 * Récupère une IMAGE en direct puis, en cas de blocage, via une course
 * parallèle des relais images. Renvoie la première Response 200 (la validité
 * image/* est confirmée par l'appelant via magic bytes — un CDN peut renvoyer
 * un type approximatif) ; null si tout échoue.
 */
export async function fetchImageResilient(rawUrl: string): Promise<Response | null> {
  if (!isAllowedUrl(rawUrl)) return null;
  try {
    // Promise.any : le premier relais qui répond OK gagne ; tous échouent →
    // AggregateError rejeté → null.
    return await Promise.any(
      imageMirrors(rawUrl).map((u) => relayFetch(u, "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", MIRROR_TIMEOUT_MS))
    );
  } catch {
    return null;
  }
}

/**
 * Récupère du TEXTE (page d'article pour l'og:image, flux RSS d'un éditeur)
 * en direct puis via une course parallèle des relais génériques. Renvoie
 * { text, contentType } ou null si tout échoue.
 */
export async function fetchTextResilient(
  rawUrl: string,
  opts?: { accept?: string; timeoutMs?: number }
): Promise<{ text: string; contentType: string } | null> {
  if (!isAllowedUrl(rawUrl)) return null;
  const accept = opts?.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const timeoutMs = opts?.timeoutMs ?? MIRROR_TIMEOUT_MS;

  // 1) Direct (le média laisse parfois passer — et c'est le plus fidèle).
  try {
    const res = await fetch(rawUrl, {
      headers: { Accept: accept, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5", "User-Agent": UA },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const text = await res.text();
      if (text) return { text, contentType: res.headers.get("content-type") ?? "" };
    }
  } catch {
    // on passe aux relais
  }

  // 2) Course des relais génériques (HTML/XML) — leurs serveurs ne sont pas
  //    bloqués par les médias. Premier 200 exploitable gagne.
  try {
    const res = await Promise.any(
      textMirrors(rawUrl).map((u) => relayFetch(u, accept, timeoutMs))
    );
    const text = await res.text();
    if (text && text.length > 40) return { text, contentType: res.headers.get("content-type") ?? "" };
  } catch {
    // tout a échoué
  }
  return null;
}
