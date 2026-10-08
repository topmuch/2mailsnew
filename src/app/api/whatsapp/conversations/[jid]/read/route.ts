import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

const UPSTREAM = "http://localhost:3003";

export async function POST(request: NextRequest, { params }: { params: Promise<{ jid: string }> }) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { jid } = await params;
  try {
    const res = await fetch(`${UPSTREAM}/conversations/${encodeURIComponent(jid)}/read`, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Service WhatsApp injoignable" }, { status: 503 });
  }
}
