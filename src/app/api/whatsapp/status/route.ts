import { NextResponse } from "next/server";

// Proxy vers le mini-service whatsapp (port 3003).
// Le frontend ne peut pas appeler localhost:3003 directement à cause de Caddy.
// On forward donc les requêtes via /api/whatsapp/* → localhost:3003/*

const UPSTREAM = "http://localhost:3003";

export async function GET() {
  try {
    const res = await fetch(`${UPSTREAM}/status`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    // Service down : on retourne un état explicite pour que le frontend
    // puisse afficher un message clair ( distinction "démarrage" vs "injoignable").
    return NextResponse.json({
      ready: false,
      qr: false,
      chromiumReady: false,
      serviceDown: true,
      error: "Service WhatsApp non démarré",
    }, { status: 503 });
  }
}

