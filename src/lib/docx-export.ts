// ─── Export Word (.docx) : conversion HTML éditeur → document Word ───────────
// Bibliothèque SERVEUR : utilise `docx` (génération réelle .docx), `node-html-parser`
// (lecture du HTML de l'éditeur) et `sharp` (dimensions des images).
// L'en-tête papier (logo 2m + coordonnées société) est ajouté automatiquement
// à chaque export, ainsi qu'un pied de page « Page X ».

import { promises as fs } from "fs";
import path from "path";
import { parse, type HTMLElement } from "node-html-parser";
import sharp from "sharp";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export interface CompanyInfo {
  nomSociete: string;
  tagline?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  rc?: string | null;
  ninea?: string | null;
  logo?: string | null; // data-URL du logo personnalisé (prioritaire)
  cachet?: string | null; // data-URL du cachet officiel (tampon) — Task 46-c
}

const BRAND = "1F3FBF"; // bleu 2MAILS
const INK = "111827";
const MUTED = "6B7280";
const LINE = "D1D5DB";

// ─── Petites aides ───────────────────────────────────────────────────────────

function hexColor(cssColor?: string): string | undefined {
  if (!cssColor) return undefined;
  const c = cssColor.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c) ?? /^#([0-9a-f]{3})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return h.toUpperCase();
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (rgb) {
    const to = (n: string) => Number(n).toString(16).padStart(2, "0");
    return (to(rgb[1]) + to(rgb[2]) + to(rgb[3])).toUpperCase();
  }
  return undefined;
}

function styleOf(el: HTMLElement): Record<string, string> {
  const raw = el.getAttribute("style") ?? "";
  const out: Record<string, string> = {};
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx > 0) out[decl.slice(0, idx).trim().toLowerCase()] = decl.slice(idx + 1).trim();
  }
  return out;
}

function alignmentOf(el: HTMLElement) {
  const t = styleOf(el)["text-align"];
  if (t === "center") return AlignmentType.CENTER;
  if (t === "right" || t === "end") return AlignmentType.RIGHT;
  if (t === "justify") return AlignmentType.JUSTIFIED;
  if (t === "left" || t === "start") return AlignmentType.LEFT;
  return undefined;
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,([\s\S]+)$/i;

/** ImageRun depuis une data-URL (images distantes ignorées : export toujours sûr). */
async function imageRunFromSrc(
  src: string,
  maxWidth = 440,
): Promise<ImageRun | null> {
  const m = DATA_URL_RE.exec(src.trim());
  if (!m) return null;
  let ext = m[1].toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (ext === "webp") return null; // format non supporté par Word
  try {
    const buf = Buffer.from(m[2], "base64");
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 400;
    const h = meta.height ?? 300;
    const scale = Math.min(1, maxWidth / w);
    return new ImageRun({
      type: ext as "png" | "jpg" | "gif" | "bmp",
      data: buf,
      transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
    });
  } catch {
    return null;
  }
}

/** Logo d'en-tête : data-URL du Setting sinon fichier public/logo-2mails.png. */
async function logoImageRun(company: CompanyInfo): Promise<ImageRun | null> {
  let buf: Buffer | null = null;
  if (company.logo?.startsWith("data:image")) {
    try {
      buf = Buffer.from(company.logo.split(",")[1] ?? "", "base64");
    } catch {
      buf = null;
    }
  }
  if (!buf) {
    try {
      buf = await fs.readFile(path.join(process.cwd(), "public", "logo-2mails.png"));
    } catch {
      return null;
    }
  }
  try {
    const meta = await sharp(buf).metadata();
    const w = meta.width && meta.height ? meta.width / meta.height : 1;
    const height = Math.round(Math.min(72, 72 * (w >= 1 ? 1 : 1 / w)));
    return new ImageRun({
      type: "png",
      data: buf,
      transformation: { width: 72, height },
    });
  } catch {
    return null;
  }
}

/** Cachet officiel (tampon) : ImageRun depuis la data-URL du Setting,
 *  contraint à ~150 px — même pattern de décodage base64 que le logo.
 *  Renvoie null si aucun cachet ou image inexploitable (export toujours sûr). */
async function cachetImageRun(company: CompanyInfo): Promise<ImageRun | null> {
  if (!company.cachet) return null;
  const m = DATA_URL_RE.exec(company.cachet.trim());
  if (!m) return null;
  let ext = m[1].toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (ext === "webp") return null; // format non supporté par Word
  try {
    const buf = Buffer.from(m[2], "base64");
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 150;
    const h = meta.height ?? 150;
    const scale = Math.min(1, 150 / w, 150 / h); // reste lisible sans déborder
    return new ImageRun({
      type: ext as "png" | "jpg" | "gif" | "bmp",
      data: buf,
      transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
    });
  } catch {
    return null;
  }
}

// ─── Runs en ligne (gras, italique, couleur, liens, images…) ─────────────────

interface RunFmt {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  code?: boolean;
  shading?: string; // surlignage (fill hex) — balise <mark>
}

function collectRuns(node: HTMLElement | HTMLElement["childNodes"][number], fmt: RunFmt): TextRun[] {
  const runs: TextRun[] = [];
  if (node.nodeType === 3) {
    const text = node.rawText;
    if (text && text.length > 0) {
      runs.push(
        new TextRun({
          text,
          bold: fmt.bold,
          italics: fmt.italics,
          underline: fmt.underline ? {} : undefined,
          strike: fmt.strike,
          color: fmt.color,
          font: fmt.code ? "Courier New" : undefined,
          shading: fmt.shading ? { type: ShadingType.CLEAR, fill: fmt.shading } : undefined,
        }),
      );
    }
    return runs;
  }
  const el = node as HTMLElement;
  switch (el.rawTagName?.toLowerCase()) {
    case "strong":
    case "b":
      return [...runs, ...collectRunsChildren(el, { ...fmt, bold: true })];
    case "em":
    case "i":
      return [...runs, ...collectRunsChildren(el, { ...fmt, italics: true })];
    case "u":
      return [...runs, ...collectRunsChildren(el, { ...fmt, underline: true })];
    case "s":
    case "del":
    case "strike":
      return [...runs, ...collectRunsChildren(el, { ...fmt, strike: true })];
    case "code":
      return [...runs, ...collectRunsChildren(el, { ...fmt, code: true })];
    case "br": {
      runs.push(new TextRun({ break: 1 }));
      return runs;
    }
    case "mark": {
      const fill = hexColor(el.getAttribute("data-color") ?? styleOf(el)["background-color"]) ?? "FBF3BF";
      return [...runs, ...collectRunsChildren(el, { ...fmt, shading: fill })];
    }
    case "span": {
      const color = hexColor(styleOf(el)["color"]);
      return [...runs, ...collectRunsChildren(el, color ? { ...fmt, color } : fmt)];
    }
    case "a":
      return [...runs, ...collectRunsChildren(el, { ...fmt, color: fmt.color ?? BRAND, underline: true })];
    case "img": {
      // image en ligne : sera traitée de façon asynchrone plus haut — placeholder
      return runs;
    }
    default:
      return [...runs, ...collectRunsChildren(el, fmt)];
  }
}

// Version asynchrone pour gérer les images en ligne
async function collectRunsAsync(node: HTMLElement | HTMLElement["childNodes"][number], fmt: RunFmt): Promise<TextRun[]> {
  if (node.nodeType === 3) return collectRuns(node, fmt);
  const el = node as HTMLElement;
  if (el.rawTagName?.toLowerCase() === "img") {
    const img = await imageRunFromSrc(el.getAttribute("src") ?? "");
    return img ? [img as unknown as TextRun] : [];
  }
  const out: TextRun[] = [];
  for (const child of el.childNodes) {
    out.push(...(await collectRunsAsync(child, fmt)));
  }
  return out;
}

function collectRunsChildren(el: HTMLElement, fmt: RunFmt): TextRun[] {
  const out: TextRun[] = [];
  for (const child of el.childNodes) out.push(...collectRuns(child, fmt));
  return out;
}

// ─── Blocs (titres, paragraphes, listes, tableaux…) ──────────────────────────

type Block = Paragraph | Table;

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];
const HEADING_SIZES = [34, 30, 26, 24, 22, 22]; // demi-points

function isList(node: HTMLElement["childNodes"][number]): node is HTMLElement {
  if (node.nodeType !== 1) return false;
  const tag = (node as HTMLElement).rawTagName?.toLowerCase();
  return tag === "ul" || tag === "ol";
}

/** Transforme une liste ul/ol (avec sous-listes) en suite de paragraphes. */
function listBlocks(listEl: HTMLElement, ordered: boolean, depth: number, out: Block[]) {
  const level = Math.min(depth, 2);
  for (const li of listEl.childNodes) {
    if (li.nodeType !== 1) continue;
    const liEl = li as HTMLElement;
    if (liEl.rawTagName?.toLowerCase() !== "li") continue;
    // runs du contenu direct (hors sous-listes)
    const inlineHolder = { childNodes: liEl.childNodes.filter((c) => !isList(c)) } as HTMLElement;
    const runs = collectRunsChildren(inlineHolder, {});
    out.push(
      new Paragraph({
        children: runs,
        ...(ordered ? { numbering: { reference: "doc-ol", level } } : { bullet: { level } }),
        spacing: { after: 60 },
      }),
    );
    // sous-listes
    for (const child of liEl.childNodes) {
      if (isList(child)) {
        const el = child as HTMLElement;
        listBlocks(el, el.rawTagName?.toLowerCase() === "ol", depth + 1, out);
      }
    }
  }
}

async function tableFrom(el: HTMLElement): Promise<Table | null> {
  const trs = el.querySelectorAll("tr");
  const rows: TableRow[] = [];
  for (const tr of trs) {
    const cells: TableCell[] = [];
    for (const cell of tr.childNodes) {
      if (cell.nodeType !== 1) continue;
      const cellEl = cell as HTMLElement;
      const tag = cellEl.rawTagName?.toLowerCase();
      if (tag !== "th" && tag !== "td") continue;
      const isTh = tag === "th";
      const cs = parseInt(cellEl.getAttribute("colspan") ?? "1", 10) || 1;
      const rs = parseInt(cellEl.getAttribute("rowspan") ?? "1", 10) || 1;
      const runs = await collectRunsAsync(cellEl, { bold: isTh });
      cells.push(
        new TableCell({
          columnSpan: cs > 1 ? cs : undefined,
          rowSpan: rs > 1 ? rs : undefined,
          shading: isTh ? { type: ShadingType.CLEAR, fill: "F1F5F9" } : undefined,
          children: [new Paragraph({ children: runs, alignment: alignmentOf(cellEl) })],
        }),
      );
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }));
  }
  if (rows.length === 0) return null;
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows,
  });
}

async function convertBlock(node: HTMLElement["childNodes"][number], out: Block[]) {
  if (node.nodeType === 3) {
    const text = node.rawText?.trim();
    if (text) {
      out.push(new Paragraph({ children: collectRuns(node as unknown as HTMLElement, {}) }));
    }
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() ?? "";

  try {
    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const idx = Number(tag[1]) - 1;
        out.push(
          new Paragraph({
            heading: HEADING_LEVELS[idx],
            children: collectRunsChildren(el, { bold: true, color: INK }).map((r) => r),
            alignment: alignmentOf(el),
            spacing: { before: idx <= 1 ? 240 : 160, after: 120 },
          }),
        );
        return;
      }
      case "p": {
        out.push(
          new Paragraph({
            children: await collectRunsAsync(el, {}),
            alignment: alignmentOf(el),
            spacing: { after: 120 },
          }),
        );
        return;
      }
      case "ul":
      case "ol": {
        listBlocks(el, tag === "ol", 0, out);
        return;
      }
      case "blockquote":
        out.push(
          new Paragraph({
            children: await collectRunsAsync(el, {}),
            indent: { left: 567 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 12 } },
            spacing: { before: 120, after: 120 },
          }),
        );
        return;
      case "hr":
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
            spacing: { before: 200, after: 200 },
            children: [],
          }),
        );
        return;
      case "table": {
        const t = await tableFrom(el);
        if (t) out.push(t);
        return;
      }
      case "img": {
        const img = await imageRunFromSrc(el.getAttribute("src") ?? "");
        if (img) {
          out.push(new Paragraph({ children: [img as unknown as TextRun], alignment: alignmentOf(el) }));
        }
        return;
      }
      case "div":
      case "section":
      case "article":
      case "center":
      case "main":
      case "figure": {
        for (const child of el.childNodes) await convertBlock(child, out);
        return;
      }
      default: {
        const runs = await collectRunsAsync(el, {});
        if (runs.length > 0) out.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
      }
    }
  } catch {
    // un bloc qui échoue n'empêche jamais l'export complet
  }
}

// ─── En-tête / pied de page ──────────────────────────────────────────────────

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" };
const ALL_NONE = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

async function letterheadHeader(company: CompanyInfo): Promise<Header> {
  const logo = await logoImageRun(company);
  const info: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: company.nomSociete, bold: true, size: 32, color: BRAND })],
      spacing: { after: 20 },
    }),
  ];
  if (company.tagline) {
    info.push(
      new Paragraph({
        children: [new TextRun({ text: company.tagline, italics: true, size: 17, color: MUTED })],
        spacing: { after: 40 },
      }),
    );
  }
  const line1 = [company.adresse, company.telephone].filter(Boolean).join(" · ");
  const line2 = [
    company.email,
    company.rc ? `RC : ${company.rc}` : null,
    company.ninea ? `NINEA : ${company.ninea}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  for (const line of [line1, line2]) {
    if (line) {
      info.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 16, color: MUTED })],
          spacing: { after: 20 },
        }),
      );
    }
  }
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...ALL_NONE, insideHorizontal: NONE_BORDER, insideVertical: NONE_BORDER },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            borders: ALL_NONE,
            children: [
              logo
                ? new Paragraph({ children: [logo as unknown as TextRun] })
                : new Paragraph({
                    children: [
                      new TextRun({
                        text: company.nomSociete.slice(0, 2).toUpperCase(),
                        bold: true,
                        size: 52,
                        color: BRAND,
                      }),
                    ],
                  }),
            ],
          }),
          new TableCell({ width: { size: 82, type: WidthType.PERCENTAGE }, borders: ALL_NONE, children: info }),
        ],
      }),
    ],
  });
  return new Header({
    children: [
      headerTable,
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: BRAND, space: 4 } },
        spacing: { after: 160 },
        children: [],
      }),
    ],
  });
}

function pageFooter(company: CompanyInfo): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
        children: [
          new TextRun({ text: `${company.nomSociete}${company.telephone ? ` · ${company.telephone}` : ""} — Page `, size: 15, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED }),
        ],
      }),
    ],
  });
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export async function buildDocxBuffer(opts: {
  title: string;
  html: string;
  company: CompanyInfo;
  author?: string | null;
  showCachet?: boolean; // apposer le cachet officiel en fin de document — Task 46-c
}): Promise<Buffer> {
  const root = parse(opts.html ?? "");
  const blocks: Block[] = [];
  for (const node of root.childNodes) {
    await convertBlock(node, blocks);
  }
  if (blocks.length === 0) blocks.push(new Paragraph({ children: [] }));

  // Cachet officiel : dernière ligne du document, alignée à droite (tampon)
  if (opts.showCachet) {
    const cachet = await cachetImageRun(opts.company);
    if (cachet) {
      blocks.push(
        new Paragraph({
          children: [cachet as unknown as TextRun],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 360 },
        }),
      );
    }
  }

  const header = await letterheadHeader(opts.company);
  const footer = pageFooter(opts.company);

  const doc = new Document({
    creator: opts.author || opts.company.nomSociete,
    title: opts.title,
    description: `Document généré par ${opts.company.nomSociete}`,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "1F2937" } },
      },
    },
    numbering: {
      config: [
        {
          reference: "doc-ol",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 en twips
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 2 cm
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: blocks,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
