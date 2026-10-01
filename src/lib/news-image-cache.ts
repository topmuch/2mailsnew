import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// ─── Cache disque des photos d'articles (onglet Actus) ──────────────────────
// Les photos transitent par notre proxy /api/news/image. Pour que l'affichage
// soit instantané et inratable (même si le journal bloque, supprime ou ralentit
// sa photo plus tard), chaque image récupérée une fois est conservée sur le
// disque, à côté de la base de données, et resservie localement ensuite.
// - Emplacement : le dossier de DATABASE_URL (volume persistant en production),
//   sinon ./db/news-images.
// - Clé : sha256 de l'URL source.
// - Type MIME : déduit des octets (magic bytes) et de l'extension du fichier —
//   pas besoin de métadonnées séparées.
// - Pas de purge : les images font quelques dizaines de Ko, le volume de
//   l'onglet Actus reste négligeable face à la base.

const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 Mo

// Hôtes interdits (SSRF) : boucle locale, réseau privé, lien local, IPv6 ULA.
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|172\.(1[6-9]|2\d|3[01])\.|\[::1?\]|\[fc|\[fd|\[fe80)/i;

const EXT_BY_TYPE: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/avif": ".avif",
};
const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t])
);

function sniffType(buf: Buffer): string {
  if (buf.length < 12) return "";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  if (buf.slice(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.slice(4, 8).toString("latin1") === "ftyp" && buf.slice(8, 12).toString("latin1") === "avif")
    return "image/avif";
  return "";
}

function cacheDir(): string {
  const m = (process.env.DATABASE_URL ?? "").match(/^file:(.+)$/);
  const base = m ? path.dirname(m[1]) : path.join(process.cwd(), "db");
  return path.join(base, "news-images");
}

function keyFor(rawUrl: string): string {
  return createHash("sha256").update(rawUrl).digest("hex").slice(0, 40);
}

async function readFromDisk(rawUrl: string): Promise<{ bytes: Buffer; type: string } | null> {
  try {
    const base = path.join(cacheDir(), keyFor(rawUrl));
    for (const ext of Object.values(EXT_BY_TYPE)) {
      try {
        const bytes = await readFile(base + ext);
        return { bytes, type: TYPE_BY_EXT[ext] ?? "application/octet-stream" };
      } catch {
        // extension suivante
      }
    }
  } catch {
    // disque indisponible : on retombera sur le fetch
  }
  return null;
}

// Dédoublonnage : une seule récupération simultanée par URL.
const inflight = new Map<string, Promise<{ bytes: Buffer; type: string } | null>>();
// URLs déjà garanties sur disque (évite de retester à chaque requête servie).
const warmed = new Set<string>();

async function fetchAndStore(rawUrl: string): Promise<{ bytes: Buffer; type: string } | null> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) return null;

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        // Volontairement SANS Referer : contourne les protections anti-hotlink
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) return null;

    const declared = upstream.headers.get("content-type") ?? "";
    if (declared && !declared.startsWith("image/") && !declared.includes("octet-stream")) return null;

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;

    const type = sniffType(buf) || (declared.startsWith("image/") ? declared.split(";")[0].trim() : "");
    if (!type.startsWith("image/")) return null;

    try {
      const dir = cacheDir();
      await mkdir(dir, { recursive: true });
      const ext = EXT_BY_TYPE[type] ?? ".bin";
      await writeFile(path.join(dir, keyFor(rawUrl) + ext), buf);
    } catch {
      // échec d'écriture : l'image est servie quand même (sans cache)
    }
    return { bytes: buf, type };
  } catch {
    return null;
  }
}

/** Récupère l'image (disque d'abord, réseau ensuite) — null si introuvable. */
export function fetchNewsImage(rawUrl: string): Promise<{ bytes: Buffer; type: string } | null> {
  let p = inflight.get(rawUrl);
  if (p) return p;
  p = (async () => {
    const onDisk = await readFromDisk(rawUrl);
    if (onDisk) {
      warmed.add(rawUrl);
      return onDisk;
    }
    return fetchAndStore(rawUrl);
  })().finally(() => inflight.delete(rawUrl));
  inflight.set(rawUrl, p);
  return p;
}

/** Préchauffage en arrière-plan : met les photos sur le disque sans bloquer. */
export function warmNewsImages(urls: (string | null | undefined)[]): void {
  const targets = urls.filter(
    (u): u is string => !!u && !u.startsWith("/api/news/image") && !warmed.has(u)
  );
  if (targets.length === 0) return;
  void (async () => {
    for (const u of targets.slice(0, 12)) {
      try {
        if (await readFromDisk(u)) {
          warmed.add(u);
          continue;
        }
        await fetchNewsImage(u);
        warmed.add(u);
      } catch {
        // préchauffage best effort : on retentera au prochain cycle
      }
    }
  })();
}
