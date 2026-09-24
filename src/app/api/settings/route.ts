import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

const DEFAULTS = {
  id: "main",
  nomSociete: "2MAILS",
  tagline: "Plomberie - Sanitaire - Luminaire",
  adresse: "Dakar, Sénégal",
  telephone: "+221 77 000 00 00",
  email: "contact@2mails.sn",
  rc: "",
  ninea: "",
};

async function getOrCreateSettings() {
  const s = await db.setting.findUnique({ where: { id: "main" } });
  if (s) return s;
  return db.setting.create({ data: DEFAULTS });
}

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET /api/settings", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth || auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }
    await getOrCreateSettings();

    const body = await request.json();
    const clean = (v: unknown, max = 200) => (v ?? "").toString().trim().slice(0, max);

    const logo = body.logo === null ? null : body.logo ? body.logo.toString() : undefined;
    if (logo && !logo.startsWith("data:image/")) {
      return NextResponse.json({ error: "Format de logo invalide (image attendue)" }, { status: 400 });
    }
    if (logo && logo.length > 3_500_000) {
      return NextResponse.json({ error: "Logo trop volumineux (max ~2,5 Mo)" }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      nomSociete: clean(body.nomSociete, 120) || DEFAULTS.nomSociete,
      tagline: clean(body.tagline, 160),
      adresse: clean(body.adresse, 200),
      telephone: clean(body.telephone, 60),
      email: clean(body.email, 120),
      rc: clean(body.rc, 80),
      ninea: clean(body.ninea, 80),
    };
    if (logo !== undefined) data.logo = logo;

    // Objectif de CA mensuel (widget de progression du dashboard) — optionnel
    if (body.monthlyGoal !== undefined) {
      const goal = Number(body.monthlyGoal);
      data.monthlyGoal = Number.isFinite(goal) && goal >= 0 ? goal : 0;
    }

    // Mode maintenance (écran de blocage pour les non-admins) — optionnel
    if (body.maintenanceMode !== undefined) {
      data.maintenanceMode = Boolean(body.maintenanceMode);
    }

    const settings = await db.setting.update({ where: { id: "main" }, data });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("PUT /api/settings", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
