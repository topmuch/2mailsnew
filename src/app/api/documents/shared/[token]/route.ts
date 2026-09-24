import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicBaseUrl } from "@/lib/doc-share";

// ─── Page publique d'un document partagé (SANS authentification) ─────────────
// Le jeton aléatoire (32 caractères hex) est la seule clé d'accès : il est
// imdevinable et révocable depuis l'application (DELETE /api/documents/[id]/share).
// Le destinataire (client, prospect…) voit le document avec le papier en-tête
// logo de la société et peut télécharger le PDF (instantané) ou le Word.

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#eef1f6;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111827}
.wrap{max-width:820px;margin:0 auto;padding:24px 16px 40px}
.paper{background:#fff;border-radius:12px;box-shadow:0 2px 14px rgba(15,23,42,.12);padding:32px 36px}
.head{display:flex;gap:18px;align-items:flex-start;border-bottom:2px solid #1F3FBF;padding-bottom:14px}
.head img{height:56px;width:auto;max-width:150px;object-fit:contain}
.head .name{margin:0;font-size:19px;font-weight:800;letter-spacing:.5px;color:#1F3FBF}
.head .tagline{margin:2px 0 6px;font-size:12.5px;color:#475569}
.head .line{margin:1px 0;font-size:11.5px;color:#64748b}
.bar{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 4px}
.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;text-decoration:none}
.btn.primary{background:#1F3FBF;border-color:#1F3FBF;color:#fff}
.btn:hover{filter:brightness(.97)}
.title{font-size:20px;margin:18px 0 2px}
.meta{font-size:12px;color:#64748b;margin:0 0 16px}
.doc{line-height:1.55;font-size:14.5px}
.doc h1{font-size:1.5em;margin:.7em 0 .4em}
.doc h2{font-size:1.3em;margin:.7em 0 .4em}
.doc h3{font-size:1.15em;margin:.7em 0 .4em}
.doc p{margin:.45em 0}
.doc ul,.doc ol{padding-left:1.4em;margin:.4em 0}
.doc table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:13.5px}
.doc th,.doc td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left;vertical-align:top}
.doc th{background:#f1f5f9;font-weight:700}
.doc blockquote{border-left:3px solid #94a3b8;margin:.6em 0;padding:.2em 0 .2em 12px;color:#475569}
.doc img{max-width:100%}
.doc hr{border:none;border-top:1px solid #cbd5e1;margin:1.2em 0}
.hint{margin:12px 0 0;font-size:12.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px}
.foot{max-width:820px;margin:14px auto 0;padding:0 16px;color:#94a3b8;font-size:11.5px;text-align:center}
@media (max-width:560px){.paper{padding:20px 16px}.head{flex-direction:column;gap:10px}}
@media print{body{background:#fff}.bar,.hint,.foot{display:none!important}.wrap{padding:0;max-width:none}.paper{box-shadow:none;border-radius:0;padding:0}}
`;

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function notFoundPage(): NextResponse {
  return htmlResponse(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lien invalide</title></head>
<body style="margin:0;background:#eef1f6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border-radius:12px;box-shadow:0 2px 14px rgba(15,23,42,.12);padding:36px;max-width:420px;text-align:center;margin:16px">
<p style="font-size:38px;margin:0">🔒</p>
<h1 style="font-size:18px;margin:10px 0 6px;color:#111827">Lien invalide ou désactivé</h1>
<p style="font-size:13.5px;color:#64748b;margin:0">Ce document n'est plus partagé ou l'adresse est incorrecte.<br>Contactez l'expéditeur pour obtenir un nouveau lien.</p>
</div></body></html>`, 404);
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) return notFoundPage();
    const doc = await db.crmDocument.findUnique({ where: { shareToken: token } });
    if (!doc) return notFoundPage();

    const setting = await db.setting.findUnique({ where: { id: "main" } });
    const nomSociete = setting?.nomSociete || "2MAILS";
    const logo = setting?.logo || "/logo-2mails.png";
    const updated = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Dakar",
    }).format(doc.updatedAt);

    const title = escapeHtml(doc.title);
    const pdfUrl = `?format=pdf`;
    const docxUrl = `?format=docx`;

    const buttons = [
      doc.sharedPdf
        ? `<a class="btn primary" href="${pdfUrl}" download>⬇ Télécharger le PDF</a>`
        : null,
      `<a class="btn" href="${docxUrl}" download>⬇ Word (.docx)</a>`,
      `<button type="button" class="btn" onclick="window.print()">🖨 Imprimer</button>`,
    ]
      .filter(Boolean)
      .join("\n");

    const pdfHint = doc.sharedPdf
      ? ""
      : `<p class="hint">Le PDF de ce lien n'a pas encore été généré par l'expéditeur — utilisez le téléchargement Word ou le bouton Imprimer.</p>`;

    return htmlResponse(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} — ${escapeHtml(nomSociete)}</title>
<style>${PAGE_CSS}</style></head>
<body>
<div class="wrap">
  <div class="paper">
    <div class="head">
      <img src="${escapeHtml(logo)}" alt="Logo ${escapeHtml(nomSociete)}">
      <div>
        <p class="name">${escapeHtml(nomSociete)}</p>
        ${setting?.tagline ? `<p class="tagline">${escapeHtml(setting.tagline)}</p>` : ""}
        <p class="line">${escapeHtml([setting?.adresse, setting?.telephone].filter(Boolean).join(" · "))}</p>
        <p class="line">${escapeHtml(
          [
            setting?.email,
            setting?.rc ? `RC : ${setting.rc}` : null,
            setting?.ninea ? `NINEA : ${setting.ninea}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        )}</p>
      </div>
    </div>
    <div class="bar">${buttons}</div>
    <h1 class="title">${title}</h1>
    <p class="meta">Document partagé par ${escapeHtml(nomSociete)}${doc.author ? ` · rédigé par ${escapeHtml(doc.author)}` : ""} · mis à jour le ${escapeHtml(updated)} (Dakar)</p>
    ${pdfHint}
    <main class="doc">${doc.content || "<p><em>Document vide.</em></p>"}</main>
  </div>
  <p class="foot">Ce lien est privé — merci de ne pas le diffuser publiquement. ${escapeHtml(publicBaseUrl(request)).replace(/^https?:\/\//, "")}</p>
</div>
</body></html>`);
  } catch (err) {
    console.error("[doc-shared-view]", err);
    return notFoundPage();
  }
}
