import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

const UPSTREAM = "http://localhost:3003";

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await fetch(`${UPSTREAM}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Service WhatsApp injoignable" }, { status: 503 });
  }
}
