import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { buildCoachGreeting, buildCoachSystemPrompt } from "@/lib/coach-context";

// ─── Coach Virtuel IA : conversation persistée avec les données réelles ──────

export const runtime = "nodejs";
// Réponse LLM : jusqu'à 30 s (l'indicateur de frappe s'affiche côté client)
export const maxDuration = 30;

/** GET : historique de la conversation + salutation composée avec les chiffres du jour */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const [messages, greeting] = await Promise.all([
      db.crmCoachChat.findMany({ orderBy: { createdAt: "asc" }, take: 60 }),
      buildCoachGreeting(),
    ]);

    return NextResponse.json({ messages, greeting });
  } catch (error) {
    console.error("GET /api/crm/coach/chat", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST : envoi d'un message → réponse du coach (LLM nourri des données du jour) */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const message = String(body.message ?? "").trim().slice(0, 1000);
    if (!message) return NextResponse.json({ error: "Le message est requis" }, { status: 400 });

    // 1. Persiste le message de l'utilisateur
    const userRow = await db.crmCoachChat.create({ data: { role: "user", content: message } });

    // 2. Historique récent (20 derniers messages) pour la continuité
    const history = await db.crmCoachChat.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    history.reverse();

    // 3. Appel LLM (z-ai-web-dev-sdk — backend uniquement)
    let reply = "";
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: await buildCoachSystemPrompt() },
          ...history.map((row) => ({
            role: row.role === "user" ? ("user" as const) : ("assistant" as const),
            content: row.content,
          })),
        ],
        thinking: { type: "disabled" },
      });
      reply = (completion.choices[0]?.message?.content ?? "").trim();
    } catch (llmError) {
      console.error("POST /api/crm/coach/chat (LLM)", llmError);
      return NextResponse.json(
        { error: "Le coach est momentanément indisponible — réessayez dans un instant.", savedId: userRow.id },
        { status: 502 },
      );
    }

    if (!reply) {
      return NextResponse.json({ error: "Réponse vide du coach — réessayez.", savedId: userRow.id }, { status: 502 });
    }
    reply = reply.slice(0, 2000);

    // 4. Persiste la réponse du coach
    const coachRow = await db.crmCoachChat.create({ data: { role: "coach", content: reply } });

    return NextResponse.json({ reply, id: coachRow.id, userId: userRow.id });
  } catch (error) {
    console.error("POST /api/crm/coach/chat", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE : réinitialise la conversation */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await db.crmCoachChat.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/crm/coach/chat", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
