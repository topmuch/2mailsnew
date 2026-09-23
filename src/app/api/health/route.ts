import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Sonde de santé (Coolify / Docker HEALTHCHECK) ──────────────────────────
// 200 = application et base de données opérationnelles
// 503 = la base ne répond pas (conteneur marqué « unhealthy »)

export async function GET() {
  try {
    await db.user.count();
    return NextResponse.json({
      status: "ok",
      db: true,
      app: "2MAILS",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/health", error);
    return NextResponse.json(
      { status: "error", db: false, app: "2MAILS" },
      { status: 503 }
    );
  }
}
