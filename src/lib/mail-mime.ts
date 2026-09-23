// Analyse MIME robuste pour les emails importés en IMAP.
// Remplace l'ancien extracteur simplifié : gère les retours à la ligne LF ou CRLF,
// les en-têtes pliés, le multipart imbriqué (alternative / mixed / related), les
// encodages base64 et quoted-printable, les charsets non-UTF8 (iso-8859-1, gbk…),
// les pièces jointes ignorées, et produit un HTML assaini (images externes
// conservées, scripts/iframes/handlers supprimés, images cid: retirées).

const MAX_BODY_LENGTH = 100_000;

// ─── Décodage quoted-printable (octets préservés) ───────────────────────────

function qpDecode(bytes: Buffer): Buffer {
  const s = bytes.toString("binary"); // latin1 : 1 octet = 1 caractère
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === "=") {
      // Soft break : « =\n » ou « =\r\n » (après normalisation en LF : « =\n »)
      if (s[i + 1] === "\n") {
        i += 1;
        continue;
      }
      const hex = s.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}

// ─── En-têtes / paramètres ──────────────────────────────────────────────────

interface ParsedEntity {
  headers: Map<string, string>;
  body: Buffer;
}

/** Sépare en-têtes et corps (gère LF et CRLF, en-têtes pliés). */
function parseEntity(buf: Buffer): ParsedEntity {
  // Normalisation CRLF → LF (opération octet-sûre via latin1)
  const normalized = Buffer.from(buf.toString("binary").replace(/\r\n/g, "\n"), "binary");
  const idx = normalized.indexOf("\n\n");
  const headerBlock = (idx >= 0 ? normalized.subarray(0, idx) : normalized).toString("utf-8");
  const body = idx >= 0 ? normalized.subarray(idx + 2) : Buffer.alloc(0);

  const headers = new Map<string, string>();
  // Dépliage des lignes de continuation (espace/tabulation en début de ligne)
  const unfolded = headerBlock.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (m) headers.set(m[1].toLowerCase(), m[2].trim());
  }
  return { headers, body };
}

function parseContentType(value: string): { main: string; params: Record<string, string> } {
  const parts = value.split(";");
  const main = (parts[0] ?? "").trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    let v = p.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    params[k] = v;
  }
  return { main, params };
}

// ─── Décodage d'une partie feuille (charset + encodage) ─────────────────────

function decodeBody(bytes: Buffer, charset: string, encoding: string): string {
  let buf = bytes;
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") {
    // Base64 : on nettoie tout caractère non-base64 (sauts de ligne…)
    buf = Buffer.from(bytes.toString("utf-8").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  } else if (enc === "quoted-printable") {
    buf = qpDecode(bytes);
  }
  const label = (charset || "utf-8").toLowerCase();
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// ─── Parcours récursif des parties ──────────────────────────────────────────

interface Collected {
  text: string | null;
  html: string | null;
}

function collectParts(buf: Buffer, depth: number, out: Collected): void {
  if (depth > 8) return;
  const { headers, body } = parseEntity(buf);
  const { main, params } = parseContentType(headers.get("content-type") ?? "");
  const encoding = headers.get("content-transfer-encoding") ?? "";

  // Multipart : découpage sur les délimiteurs --boundary (imbriqué supporté)
  if (main.startsWith("multipart/") && params.boundary) {
    // On préfixe « \n » pour reconnaître aussi la frontière en position 0
    const b = Buffer.concat([Buffer.from("\n"), body]);
    const delim = Buffer.from(`\n--${params.boundary}`);
    let pos = b.indexOf(delim);
    while (pos >= 0 && (out.text === null || out.html === null)) {
      let from = pos + delim.length;
      // « -- » final → dernière frontière
      if (b[from] === 0x2d && b[from + 1] === 0x2d) break;
      const nl = b.indexOf(0x0a, from); // fin de la ligne de frontière
      if (nl < 0) break;
      const partStart = nl + 1;
      let partEnd = b.indexOf(delim, partStart);
      if (partEnd < 0) partEnd = b.length;
      if (partEnd <= partStart) break;
      collectParts(b.subarray(partStart, partEnd), depth + 1, out);
      pos = partEnd >= b.length ? -1 : b.indexOf(delim, partEnd);
    }
    return;
  }

  // Message imbriqué (forward en pièce) : on le traite comme une source
  if (main === "message/rfc822") {
    collectParts(body, depth + 1, out);
    return;
  }

  // Pièces jointes et contenus binaires : ignorés
  if (main && !main.startsWith("text/")) return;

  const decoded = decodeBody(body, params.charset ?? "", encoding);
  if (main === "text/html") {
    if (out.html === null) out.html = decoded;
  } else if (out.text === null) {
    out.text = decoded;
  }
}

// ─── Assainissement HTML (sécurité + images) ────────────────────────────────

/**
 * Rend le HTML d'un email affichable en toute sécurité :
 * - supprime scripts, styles, iframes, formulaires, commentaires, handlers on*,
 *   liens javascript:, images embarquées cid: (non résolubles sans la pièce jointe) ;
 * - conserve les images externes http(s), tableaux, listes, liens normaux.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(iframe|object|embed|form|input|button|select|textarea|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " "
    )
    .replace(/<(iframe|object|embed|form|input|button|select|textarea|link|meta|base)\b[^>]*\/?>/gi, " ")
    .replace(/<img[^>]*\ssrc\s*=\s*["']?cid:[^"'\s>]*["']?[^>]*>/gi, " ")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'\s*javascript:[^']*'/gi, 'href="#"')
    .replace(/src\s*=\s*"\s*(?:javascript|vbscript|data:text)[^"]*"/gi, 'src="#"')
    .replace(/src\s*=\s*'\s*(?:javascript|vbscript|data:text)[^']*'/gi, "src='#'")
    .trim();
}

// ─── Conversion HTML → texte (pour l'aperçu et le fallback) ─────────────────

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&copy;/gi, "©")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&euro;/gi, "€")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return n >= 32 && n <= 0xffff ? String.fromCodePoint(n) : " ";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Point d'entrée ─────────────────────────────────────────────────────────

/**
 * Extrait { text, html } d'une source email brute :
 * - text : texte lisible (décodé, entités résolues) ;
 * - html : HTML assaini prêt à être affiché ("" si le message est en texte seul).
 */
export function extractMailContent(source: Buffer | undefined | null): {
  text: string;
  html: string;
} {
  if (!source || source.length === 0) return { text: "", html: "" };
  const out: Collected = { text: null, html: null };
  collectParts(source, 0, out);

  let text = (out.text ?? (out.html ? stripHtml(out.html) : "")).replace(/\u0000/g, "").trim();
  const html = out.html ? sanitizeHtml(out.html) : "";
  if (!text && html) text = stripHtml(html);

  return {
    text: text.slice(0, MAX_BODY_LENGTH),
    html: html.slice(0, MAX_BODY_LENGTH),
  };
}
