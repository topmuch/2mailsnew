import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/news/image?u=… : proxy des photos d'articles ───────────────────
// Les médias bloquent souvent l'affichage direct de leurs images depuis un
// autre site (protection anti-hotlink basée sur le Referer) et certaines
// photos sont en http:// — contenu mixte bloqué par le navigateur quand
// l'app est servie en https. On sert donc chaque photo depuis notre backend :
// même origine, pas de Referer externe, cache navigateur long.
// Route volontairement publique (une balise <img> ne peut pas envoyer le
// jeton Bearer) mais durcie : protocole http(s) uniquement, hors adresses
// privées/locales, type image imposé, taille plafonnée, en échec → 404
// (la carte affiche son placeholder doré).

const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 Mo

// Hôtes interdits (SSRF) : boucle locale, réseau privé, lien local, IPv6 ULA.
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|172\.(1[6-9]|2\d|3[01])\.|\[::1?\]|\[fc|\[fd|\[fe80)/i;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse(null, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        // Volontairement SANS Referer : contourne les protections anti-hotlink
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) return new NextResponse(null, { status: 404 });

    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/") && !type.includes("octet-stream")) {
      return new NextResponse(null, { status: 404 }); // pas une image → pas de proxy
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800, immutable", // 7 jours côté navigateur
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
