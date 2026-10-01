import { NextRequest, NextResponse } from "next/server";
import { fetchNewsImage } from "@/lib/news-image-cache";

// ─── GET /api/news/image?u=… : proxy des photos d'articles ───────────────────
// Les médias bloquent souvent l'affichage direct de leurs images depuis un
// autre site (protection anti-hotlink basée sur le Referer) et certaines
// photos sont en http:// — contenu mixte bloqué par le navigateur quand
// l'app est servie en https. On sert donc chaque photo depuis notre backend :
// même origine, pas de Referer externe, cache navigateur long.
// Chaque image récupérée est aussi conservée sur le disque (voir
// lib/news-image-cache.ts) : les vues suivantes sont instantanées et restent
// possibles même si le média déprotège, déplace ou supprime sa photo.
// Route volontairement publique (une balise <img> ne peut pas envoyer le
// jeton Bearer) mais durcie : protocole http(s) uniquement, hors adresses
// privées/locales, type image imposé, taille plafonnée, en échec → 404
// (la carte affiche son placeholder doré).

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse(null, { status: 400 });

  try {
    const target = new URL(raw);
    if (!/^https?:$/.test(target.protocol)) return new NextResponse(null, { status: 400 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const hit = await fetchNewsImage(raw);
  if (!hit) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(hit.bytes), {
    status: 200,
    headers: {
      "Content-Type": hit.type,
      "Cache-Control": "public, max-age=604800, immutable", // 7 jours côté navigateur
      "Content-Length": String(hit.bytes.byteLength),
    },
  });
}
