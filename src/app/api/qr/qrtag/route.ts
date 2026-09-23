import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const QR_TAG_BASE = "https://qrtag.net/api";

// ─── GET : générer un QR code via l'API gratuite QRtag.net ──────────────────

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const url = params.get("url")?.trim() ?? "";
    const format = params.get("format") === "svg" ? "svg" : "png";
    const transparent = params.get("transparent") === "true";
    const sizeRaw = parseInt(params.get("size") ?? "4", 10);
    const size = Number.isFinite(sizeRaw) ? Math.min(12, Math.max(1, sizeRaw)) : 4;

    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL invalide" }, { status: 400 });
    }

    const imageUrl = `${QR_TAG_BASE}/qr${transparent ? "_transparent" : ""}${
      size !== 4 ? `_${size}` : ""
    }.${format}?url=${encodeURIComponent(url)}`;

    // Récupération serveur de l'image → data-URL (aperçu fiable + téléchargement)
    let dataUrl: string | null = null;
    let status: "OK" | "ERREUR" = "OK";
    try {
      const res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(12000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; 2MAILS/1.0)" },
        cache: "no-store",
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const mime = format === "svg" ? "image/svg+xml" : "image/png";
        dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      } else {
        status = "ERREUR";
      }
    } catch {
      status = "ERREUR";
    }

    const result = {
      provider: "QRTAG" as const,
      url,
      imageUrl,
      dataUrl,
      format: format as "png" | "svg",
      size,
      transparent,
    };

    // Historique (sans le base64 pour ne pas alourdir la table)
    try {
      await db.qrLookup.create({
        data: {
          provider: "QRTAG",
          query: url,
          options: JSON.stringify({ format, size, transparent }),
          result: JSON.stringify({ imageUrl, format, size, transparent, imageOk: dataUrl !== null }),
          status,
        },
      });
    } catch (dbError) {
      console.error("GET /api/qr/qrtag — historique", dbError);
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("GET /api/qr/qrtag", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
