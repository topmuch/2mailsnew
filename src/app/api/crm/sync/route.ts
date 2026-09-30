import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ensurePlatformsSeeded, syncAllPlatforms, syncPlatform, PLATFORM_NAMES, type PlatformName } from "@/lib/crm-api";

// ─── Synchronisation manuelle CRM (admin) ───────────────────────────────────
// POST /api/crm/sync            → synchronise toutes les plateformes actives
// POST /api/crm/sync?platform=QRBAGS → synchronise une seule plateforme

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await ensurePlatformsSeeded();
    const platformParam = request.nextUrl.searchParams.get("platform")?.toUpperCase();

    if (platformParam && (PLATFORM_NAMES as string[]).includes(platformParam)) {
      const result = await syncPlatform(platformParam as PlatformName);
      return NextResponse.json({ ok: true, results: [result], errors: [] });
    }

    const result = await syncAllPlatforms();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/crm/sync", error);
    return NextResponse.json({ error: "Erreur serveur lors de la synchronisation" }, { status: 500 });
  }
}
