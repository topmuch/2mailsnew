import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = "http://localhost:3003";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jid: string }> }) {
  const { jid } = await params;
  try {
    const res = await fetch(`${UPSTREAM}/messages/${encodeURIComponent(jid)}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ messages: [], error: "Service WhatsApp injoignable" }, { status: 503 });
  }
}
