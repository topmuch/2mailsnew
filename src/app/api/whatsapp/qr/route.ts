import { NextResponse } from "next/server";

const UPSTREAM = "http://localhost:3003";

export async function GET() {
  try {
    const res = await fetch(`${UPSTREAM}/qr`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ready: false, qr: null, dataUrl: null, error: "Service WhatsApp injoignable" }, { status: 503 });
  }
}
