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
    return NextResponse.json({ ready: false, error: "Service WhatsApp injoignable" }, { status: 503 });
  }
}
