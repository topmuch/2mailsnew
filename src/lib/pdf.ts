"use client";

// Génération de documents PDF côté client avec jsPDF + AutoTable
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, Order, Purchase, Client, SalesReport, Product, DailyReport } from "./types";
import {
  DELIVERY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./constants";

// ─── Couleurs (charte ETS LAMP FALL) ────────────────────────────────────────

const GREEN = [30, 107, 58] as const;
const GREEN_LIGHT = [113, 172, 131] as const;
const GREEN_BG = [240, 248, 243] as const;
const RED = [192, 43, 43] as const;
const ORANGE = [202, 111, 9] as const;
const GRAY = [105, 112, 108] as const;
const DARK = [35, 45, 40] as const;

// ─── Formatage ──────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [int, dec] = rounded.toString().split(".");
  const withSpaces = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${withSpaces},${dec}` : withSpaces;
}

function fmtMoney(n: number): string {
  return `${fmtNum(n)} FCFA`;
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}



// ─── Montant en lettres (français) ──────────────────────────────────────────

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept",
  "dix-huit", "dix-neuf",
];
const TENS: Record<number, string> = {
  2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante",
  8: "quatre-vingt",
};

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    const base = t === 7 ? "soixante" : "quatre-vingt";
    const rest = n - (t === 7 ? 60 : 80);
    if (rest === 0) return t === 7 ? "soixante-dix" : "quatre-vingt-dix";
    if (rest === 11) return `${base}-onze`;
    if (rest === 1 && t === 7) return "soixante et onze";
    return `${base}-${UNITS[rest]}`;
  }
  if (u === 0) return t === 8 ? "quatre-vingts" : TENS[t];
  if (u === 1 && t !== 8) return `${TENS[t]} et un`;
  return `${TENS[t]}-${UNITS[u]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 1) return r === 0 ? "cent" : `cent ${below100(r)}`;
  return r === 0 ? `${UNITS[c]} cents` : `${UNITS[c]} cent ${below100(r)}`;
}

export function amountInWordsFCFA(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "Zéro franc CFA";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions > 0)
    parts.push(millions === 1 ? "un million" : `${below1000(millions)} millions`);
  if (thousands > 0)
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands)} mille`);
  if (rest > 0) parts.push(below1000(rest));
  return `${parts.join(" ")} francs CFA`;
}

// ─── Paramètres société (injectés depuis l'écran Paramètres) ────────────────

interface CompanyInfo {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  rc: string;
  ninea: string;
  logo: string | null;
}

let companyInfo: CompanyInfo = {
  name: "ETS LAMP FALL",
  tagline: "Plomberie - Sanitaire - Luminaire",
  address: "Dakar, Sénégal",
  phone: "+221 77 000 00 00",
  email: "contact@etslampfall.sn",
  rc: "",
  ninea: "",
  logo: null,
};

let companyLoaded = false;

/** Charge les paramètres société depuis l'API (une fois par session, sauf force). */
export async function loadCompanyInfo(force = false): Promise<CompanyInfo> {
  if (companyLoaded && !force) return companyInfo;
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const s = await res.json();
      companyInfo = {
        name: (s.nomSociete || companyInfo.name).toString(),
        tagline: (s.tagline || "").toString(),
        address: (s.adresse || "").toString(),
        phone: (s.telephone || "").toString(),
        email: (s.email || "").toString(),
        rc: (s.rc || "").toString(),
        ninea: (s.ninea || "").toString(),
        logo: s.logo ? s.logo.toString() : null,
      };
    }
  } catch {
    /* valeurs par défaut */
  }
  companyLoaded = true;
  return companyInfo;
}

/** Force le rechargement des paramètres société (après enregistrement). */
export function invalidateCompanyCache() {
  companyLoaded = false;
  logoCache = undefined;
}

// ─── Logo ───────────────────────────────────────────────────────────────────

let logoCache: string | null | undefined = undefined; // undefined = pas encore chargé

/** Logo actif : logo des paramètres s'il existe, sinon /logo.png par défaut. */
export async function getLogoBase64(): Promise<string | null> {
  const info = await loadCompanyInfo();
  if (info.logo) return info.logo;
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch("/logo-green.png");
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

// ─── Helpers de dessin ──────────────────────────────────────────────────────

// Police des documents : les factures et proformas sont en Times (Times New Roman) italique,
// les autres documents conservent Helvetica. Les titres « gras » restent italiques (gras italique).
type FontStyle = "normal" | "italic" | "bold" | "bolditalic";
type PdfFont = { name: string; normal: FontStyle; bold: FontStyle };
const DEFAULT_FONT: PdfFont = { name: "helvetica", normal: "normal", bold: "bold" };
const INVOICE_FONT: PdfFont = { name: "times", normal: "italic", bold: "bolditalic" };

function drawHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle: string,
  font: PdfFont = DEFAULT_FONT
) {
  const company = companyInfo;
  // Bandeau vert fin en haut
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, 210, 3, "F");

  // Logo (format déduit de la data-URL : PNG ou JPEG)
  if (logo) {
    try {
      const fmt = logo.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logo, fmt, 14, 8, 30, 25.6);
    } catch {
      /* ignore */
    }
  }

  // Infos société
  const xText = logo ? 48 : 14;
  doc.setTextColor(...DARK);
  doc.setFont(font.name, font.bold);
  doc.setFontSize(14);
  doc.text(company.name, xText, 15);
  doc.setFont(font.name, font.normal);
  doc.setFontSize(8.5);
  doc.setTextColor(...GREEN);
  if (company.tagline) doc.text(company.tagline, xText, 20);
  doc.setTextColor(...GRAY);
  let hy = company.tagline ? 24.5 : 20.5;
  if (company.address) {
    doc.text(company.address, xText, hy);
    hy += 4;
  }
  if (company.phone) {
    doc.text(`Tél : ${company.phone}`, xText, hy);
    hy += 4;
  }
  if (company.email) {
    doc.text(company.email, xText, hy);
    hy += 4;
  }
  if (company.rc || company.ninea) {
    const legal = [company.rc ? `RC : ${company.rc}` : "", company.ninea ? `NINEA : ${company.ninea}` : ""]
      .filter(Boolean)
      .join("  •  ");
    doc.setFontSize(7.5);
    doc.text(legal, xText, hy);
  }

  // Titre à droite
  doc.setTextColor(...GREEN);
  doc.setFont(font.name, font.bold);
  doc.setFontSize(20);
  doc.text(title, 196, 16, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(subtitle, 196, 22, { align: "right" });

  // Ligne de séparation
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(14, 40, 196, 40);
  doc.setDrawColor(...GREEN_LIGHT);
  doc.setLineWidth(0.25);
  doc.line(14, 41.2, 196, 41.2);
}

function drawFooter(doc: jsPDF, font: PdfFont = DEFAULT_FONT) {
  const company = companyInfo;
  const legal = [company.rc ? `RC : ${company.rc}` : "", company.ninea ? `NINEA : ${company.ninea}` : ""]
    .filter(Boolean)
    .join(" • ");
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const y = 288;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.4);
    doc.line(14, y - 4, 196, y - 4);
    doc.setFont(font.name, font.normal);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    const line1 = [
      company.name,
      company.tagline,
      company.phone ? `Tél : ${company.phone}` : "",
      company.email,
      legal,
    ]
      .filter(Boolean)
      .join(" • ");
    doc.text(line1, 105, y, { align: "center" });
    doc.text("Merci de votre confiance !", 105, y + 3.5, { align: "center" });
    doc.text(`Page ${i}/${pageCount}`, 196, y, { align: "right" });
  }
}

function statusBadge(
  doc: jsPDF,
  label: string,
  color: readonly [number, number, number] | number[],
  x: number,
  y: number,
  font: PdfFont = DEFAULT_FONT
) {
  const w = 32;
  const h = 7.5;
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(font.name, font.bold);
  doc.setFontSize(8.5);
  doc.text(label, x + w / 2, y + h / 2 + 1.2, { align: "center" });
}

function paymentColor(status: string) {
  if (status === "PAYE") return GREEN as unknown as number[];
  if (status === "PARTIEL") return ORANGE as unknown as number[];
  return RED as unknown as number[];
}

function deliveryColor(status: string) {
  return status === "LIVRE" ? (GREEN as unknown as number[]) : GRAY as unknown as number[];
}

function watermark(doc: jsPDF, text: string, color: readonly number[], font: PdfFont = DEFAULT_FONT) {
  try {
    const GStateCtor = (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState;
    const g = new GStateCtor({ opacity: 0.07 });
    (doc as unknown as { setGState: (g: unknown) => void }).setGState(g);
    doc.setFont(font.name, font.bold);
    doc.setFontSize(60);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(text, 105, 165, { align: "center", angle: 40 });
    // Restaurer l'opacité normale après le filigrane
    const opaque = new GStateCtor({ opacity: 1 });
    (doc as unknown as { setGState: (g: unknown) => void }).setGState(opaque);
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
  } catch {
    /* GState non supporté */
  }
}

type TableItem = {
  productName: string;
  category?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

function drawItemsTable(doc: jsPDF, items: TableItem[], startY: number, font: PdfFont = DEFAULT_FONT): number {
  autoTable(doc, {
    startY,
    head: [["Désignation", "Qté", "PU (FCFA)", "Total (FCFA)"]],
    body: items.map((it) => [
      it.productName,
      `${fmtNum(it.quantity)} ${it.unit ?? ""}`.trim(),
      fmtNum(it.unitPrice),
      fmtNum(it.total),
    ]),
    theme: "grid",
    styles: {
      font: font.name,
      fontStyle: font.normal,
      fontSize: 8.5,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
    },
    headStyles: {
      fillColor: GREEN as unknown as number[],
      textColor: [255, 255, 255],
      fontStyle: font.bold,
      fontSize: 8.5,
      halign: "left",
    },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 102, fontStyle: font.bold },
      1: { cellWidth: 26, halign: "center" },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 28, halign: "right", fontStyle: font.bold },
    },
    margin: { left: 14, right: 14 },
  });
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return last ? last.finalY : startY + 30;
}

// ─── Facture / Proforma ─────────────────────────────────────────────────────

export async function buildInvoicePDF(invoice: Invoice): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();
  const isProforma = invoice.type === "PROFORMA";

  drawHeader(
    doc,
    logo,
    isProforma ? "FACTURE PROFORMA" : "FACTURE",
    `N° ${invoice.number}`,
    INVOICE_FONT
  );

  // Watermark — uniquement les mentions positives (jamais « IMPAYÉ » sur la facture)
  if (isProforma) watermark(doc, "PROFORMA", GREEN_LIGHT, INVOICE_FONT);
  else if (invoice.paymentStatus === "PAYE") watermark(doc, "PAYÉ", GREEN_LIGHT, INVOICE_FONT);

  // Bloc client
  const blockY = 48;
  doc.setFont(INVOICE_FONT.name, INVOICE_FONT.bold);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("FACTURER À", 14, blockY);
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  const clientName = invoice.clientName || "Client comptoir";
  const nameLines = doc.splitTextToSize(clientName, 85);
  doc.text(nameLines, 14, blockY + 6);
  doc.setFont(INVOICE_FONT.name, INVOICE_FONT.normal);
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  let cy = blockY + 6 + nameLines.length * 5;
  if (invoice.clientPhone) {
    doc.text(`Tél : ${invoice.clientPhone}`, 14, cy);
    cy += 4.5;
  }
  if (invoice.clientAddress) {
    doc.text(doc.splitTextToSize(invoice.clientAddress, 85), 14, cy);
    cy += 4.5;
  }

  // Infos facture
  doc.setFontSize(8.5);
  const infoX = 128;
  doc.setFont(INVOICE_FONT.name, INVOICE_FONT.normal);
  doc.setTextColor(...GRAY);
  doc.text("Date :", infoX, blockY);
  doc.text(fmtDate(invoice.date), 196, blockY, { align: "right" });
  if (invoice.dueDate) {
    doc.text("Échéance :", infoX, blockY + 5);
    doc.text(fmtDate(invoice.dueDate), 196, blockY + 5, { align: "right" });
  }

  // Badges statuts — uniquement « Payé / Partiel » et « Livré » :
  // les mentions négatives (« Non payé », « Non livré ») ne figurent pas sur la facture.
  if (!isProforma) {
    const badgeY = blockY + (invoice.dueDate ? 12 : 7);
    if (invoice.paymentStatus === "PAYE" || invoice.paymentStatus === "PARTIEL") {
      statusBadge(
        doc,
        PAYMENT_LABELS[invoice.paymentStatus] ?? invoice.paymentStatus,
        paymentColor(invoice.paymentStatus),
        164,
        badgeY,
        INVOICE_FONT
      );
    }
    if (invoice.deliveryStatus === "LIVRE") {
      statusBadge(
        doc,
        DELIVERY_LABELS[invoice.deliveryStatus] ?? invoice.deliveryStatus,
        deliveryColor(invoice.deliveryStatus),
        128,
        badgeY,
        INVOICE_FONT
      );
    }
  }

  // Tableau des articles
  const tableEnd = drawItemsTable(doc, invoice.items, blockY + 20, INVOICE_FONT);

  // Totaux
  const totalsX = 122;
  let ty = tableEnd + 7;
  const rowH = 6;

  const totalRow = (label: string, value: string, opts?: { bold?: boolean; color?: number[]; fill?: number[] }) => {
    if (opts?.fill) {
      doc.setFillColor(...(opts.fill as [number, number, number]));
      doc.rect(totalsX, ty - 4.4, 196 - totalsX, rowH, "F");
    }
    doc.setFont(INVOICE_FONT.name, opts?.bold ? INVOICE_FONT.bold : INVOICE_FONT.normal);
    doc.setFontSize(9);
    doc.setTextColor(...(opts?.color ?? (DARK as unknown as number[])));
    doc.text(label, totalsX + 2, ty);
    doc.text(value, 194, ty, { align: "right" });
    ty += rowH;
  };

  totalRow("Total HT", fmtMoney(invoice.totalHT));
  totalRow(`TVA (${invoice.taxRate}%)`, fmtMoney(invoice.totalTTC - invoice.totalHT));
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.line(totalsX, ty - 4.6, 196, ty - 4.6);
  totalRow("TOTAL TTC", fmtMoney(invoice.totalTTC), {
    bold: true,
    color: GREEN as unknown as number[],
    fill: GREEN_BG as unknown as number[],
  });
  if (!isProforma) {
    totalRow("Montant payé", fmtMoney(invoice.amountPaid));
    const reste = invoice.totalTTC - invoice.amountPaid;
    totalRow("Reste à payer", fmtMoney(reste), {
      bold: true,
      color: reste > 0 ? (RED as unknown as number[]) : (GREEN as unknown as number[]),
    });
  }

  // Bloc « arrêté à la somme de » / signature
  let by = tableEnd + 8;
  const words = amountInWordsFCFA(invoice.totalTTC);
  doc.setFont(INVOICE_FONT.name, "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  const sentence = isProforma
    ? `Montant estimé de la commande : ${words}`
    : `Arrêtée la présente facture à la somme de : ${words}`;
  const wrapped = doc.splitTextToSize(sentence, 100);
  doc.text(wrapped, 14, by);
  by += wrapped.length * 4.5 + 4;

  if (isProforma) {
    doc.setFont(INVOICE_FONT.name, INVOICE_FONT.normal);
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.text("Bon pour accord — Signature & cachet du client :", 14, by + 4);
    doc.setDrawColor(...GRAY);
    doc.setLineWidth(0.25);
    doc.roundedRect(14, by + 6, 60, 22, 1, 1, "S");
  } else if (invoice.notes) {
    doc.setFont(INVOICE_FONT.name, INVOICE_FONT.normal);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(`Notes : ${invoice.notes}`, 100), 14, by);
  }

  drawFooter(doc, INVOICE_FONT);
  return doc;
}

// ─── Commande prévisionnelle (bon de commande) ──────────────────────────────

export async function buildOrderPDF(order: Order): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, "COMMANDE PRÉVISIONNELLE", `N° ${order.number}`);

  const blockY = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("CLIENT", 14, blockY);
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  const clientName = order.clientName || "Client comptoir";
  const nameLines = doc.splitTextToSize(clientName, 85);
  doc.text(nameLines, 14, blockY + 6);

  doc.setFontSize(8.5);
  const infoX = 128;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Date :", infoX, blockY);
  doc.text(fmtDate(order.date), 196, blockY, { align: "right" });
  doc.text("Livraison prévue :", infoX, blockY + 5);
  doc.text(fmtDate(order.deliveryDate), 196, blockY + 5, { align: "right" });

  statusBadge(
    doc,
    ORDER_STATUS_LABELS[order.status] ?? order.status,
    order.status === "LIVREE"
      ? (GREEN as unknown as number[])
      : order.status === "ANNULEE"
        ? (RED as unknown as number[])
        : order.status === "CONFIRMEE"
          ? (ORANGE as unknown as number[])
          : (GRAY as unknown as number[]),
    164,
    blockY + 12
  );

  const tableEnd = drawItemsTable(doc, order.items, blockY + 20);

  let ty = tableEnd + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("MONTANT ESTIMÉ :", 122, ty);
  doc.text(fmtMoney(order.items.reduce((s, i) => s + i.total, 0)), 194, ty, {
    align: "right",
  });

  if (order.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(`Notes : ${order.notes}`, 180), 14, ty + 8);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    "Document prévisionnel — les quantités et prix restent susceptibles d'ajustement.",
    14,
    275
  );

  drawFooter(doc);
  return doc;
}

// ─── Liste des commandes prévisionnelles ────────────────────────────────────

export async function buildOrdersListPDF(orders: Order[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, "LISTE DES COMMANDES", `${orders.length} commande(s) prévisionnelle(s)`);

  autoTable(doc, {
    startY: 48,
    head: [["N°", "Client", "Date", "Livraison prév.", "Statut", "Articles", "Montant estimé"]],
    body: orders.map((o) => [
      o.number,
      o.clientName || "Client comptoir",
      fmtDate(o.date),
      fmtDate(o.deliveryDate),
      ORDER_STATUS_LABELS[o.status] ?? o.status,
      String(o.items.length),
      fmtNum(o.items.reduce((s, i) => s + i.total, 0)),
    ]),
    foot: [
      [
        "TOTAL", "", "", "", "", "",
        fmtNum(orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.total, 0), 0)),
      ],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: "bold" },
      1: { cellWidth: 44 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 16, halign: "center" },
      6: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  return doc;
}

// ─── Bon d'achat (facture fournisseur) ──────────────────────────────────────

export async function buildPurchasePDF(purchase: Purchase): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, "BON D'ACHAT", `N° ${purchase.number}`);

  const blockY = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("FOURNISSEUR", 14, blockY);
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(purchase.supplier, 85), 14, blockY + 6);

  doc.setFontSize(8.5);
  const infoX = 128;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Date :", infoX, blockY);
  doc.text(fmtDate(purchase.date), 196, blockY, { align: "right" });
  if (purchase.fileName) {
    doc.text("Pièce jointe :", infoX, blockY + 5);
    doc.setTextColor(...GREEN);
    doc.text(purchase.fileName.slice(0, 30), 196, blockY + 5, { align: "right" });
  }

  const tableEnd = drawItemsTable(doc, purchase.items, blockY + 20);

  let ty = tableEnd + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("TOTAL ACHAT :", 122, ty);
  doc.text(fmtMoney(purchase.total), 194, ty, { align: "right" });

  if (purchase.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(`Notes : ${purchase.notes}`, 180), 14, ty + 8);
  }

  drawFooter(doc);
  return doc;
}

// ─── Liste des factures ─────────────────────────────────────────────────────

export async function buildInvoiceListPDF(
  invoices: Invoice[],
  title: string,
  subtitle: string
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, title, subtitle);

  autoTable(doc, {
    startY: 48,
    head: [["N°", "Date", "Client", "Paiement", "Livraison", "Total TTC"]],
    body: invoices.map((f) => [
      f.number,
      fmtDate(f.date),
      f.clientName || "Client comptoir",
      PAYMENT_LABELS[f.paymentStatus] ?? f.paymentStatus,
      DELIVERY_LABELS[f.deliveryStatus] ?? f.deliveryStatus,
      fmtNum(f.totalTTC),
    ]),
    foot: [["TOTAL", "", "", "", "", fmtNum(invoices.reduce((s, f) => s + f.totalTTC, 0))]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 62 },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  return doc;
}

// ─── Rapport de ventes ─────────────────────────────────────────────────────

/** Titre de section (vert, souligné fin) — renvoie le Y de départ du contenu. */
function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...GREEN);
  doc.text(text.toUpperCase(), 14, y);
  doc.setDrawColor(...GREEN_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(14, y + 1.8, 196, y + 1.8);
  return y + 6;
}

function lastTableY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return last ? last.finalY : fallback;
}

const REPORT_TABLE_STYLES = {
  theme: "grid" as const,
  styles: {
    font: "helvetica",
    fontSize: 8,
    textColor: DARK as unknown as number[],
    lineColor: [210, 218, 213],
    lineWidth: 0.15,
    cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
  },
  headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
  alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
  margin: { left: 14, right: 14 },
};

/** Passe à la page suivante s'il reste moins de `needed` mm. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 275) {
    doc.addPage();
    return 20;
  }
  return y;
}

export async function buildSalesReportPDF(report: SalesReport, periodLabel: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();
  const s = report.summary;

  drawHeader(doc, logo, "RAPPORT DE VENTES", periodLabel);

  // ── Synthèse financière (paires libellé / valeur) ──
  const labelCell = (t: string) => ({
    content: t,
    styles: {
      fillColor: GREEN_BG as unknown as number[],
      textColor: GREEN as unknown as number[],
      fontStyle: "bold" as const,
      halign: "right" as const,
    },
  });
  const valueCell = (t: string) => ({ content: t, styles: { fontStyle: "bold" as const, halign: "right" as const } });

  autoTable(doc, {
    startY: 48,
    head: [],
    body: [
      [
        labelCell("Factures"), valueCell(String(s.count)),
        labelCell("CA HT"), valueCell(fmtNum(s.totalHT)),
        labelCell("TVA"), valueCell(fmtNum(s.vatTotal)),
        labelCell("CA TTC"), valueCell(`${fmtNum(s.totalTTC)} FCFA`),
      ],
      [
        labelCell("Encaissé"), valueCell(fmtNum(s.paidTotal)),
        labelCell("Reste à payer"), valueCell(fmtNum(s.unpaidTotal)),
        labelCell("Panier moyen"), valueCell(fmtNum(s.avgTicket)),
        labelCell("Articles vendus"), valueCell(fmtNum(s.itemsCount)),
      ],
      [
        { ...labelCell("Marge brute"), colSpan: 2 },
        { ...valueCell(`${fmtNum(s.margin)} FCFA`), colSpan: 2 },
        { ...labelCell("Marge en %"), colSpan: 2 },
        { ...valueCell(`${fmtNum(s.marginPct)} %`), colSpan: 2 },
      ],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    columnStyles: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [i, { cellWidth: 22.75 }])
    ) as Record<number, { cellWidth: number }>,
    margin: { left: 14, right: 14 },
  });

  // Ligne des statuts
  let y = lastTableY(doc, 48 + 16) + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(
    `Payées : ${s.paidCount}    \u2022    Partielles : ${s.partialCount}    \u2022    Impayées : ${s.unpaidCount}    \u2022    Livrées : ${s.deliveredCount}    \u2022    Non livrées : ${s.notDeliveredCount}`,
    14,
    y
  );
  y += 8;

  // ── Évolution mensuelle ──
  if (report.monthly.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, "Évolution mensuelle du chiffre d'affaires", y);
    autoTable(doc, {
      startY: y,
      head: [["Période", "CA TTC", "Encaissé", "Reste"]],
      body: report.monthly.map((m) => [
        m.label,
        fmtNum(m.total),
        fmtNum(m.paid),
        fmtNum(m.total - m.paid),
      ]),
      foot: [[
        "TOTAL",
        fmtNum(report.monthly.reduce((a, m) => a + m.total, 0)),
        fmtNum(report.monthly.reduce((a, m) => a + m.paid, 0)),
        fmtNum(report.monthly.reduce((a, m) => a + (m.total - m.paid), 0)),
      ]],
      ...REPORT_TABLE_STYLES,
      footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = lastTableY(doc, y + 20) + 8;
  }

  // ── Top clients ──
  if (report.topClients.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, "Top clients", y);
    autoTable(doc, {
      startY: y,
      head: [["Client", "Factures", "Total TTC"]],
      body: report.topClients.map((c) => [c.name, String(c.count), fmtNum(c.total)]),
      ...REPORT_TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 26, halign: "center" },
        2: { halign: "right", fontStyle: "bold" },
      },
    });
    y = lastTableY(doc, y + 20) + 8;
  }

  // ── Ventes par catégorie ──
  if (report.byCategory.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, "Ventes par catégorie", y);
    autoTable(doc, {
      startY: y,
      head: [["Catégorie", "Quantité", "Total", "Marge"]],
      body: report.byCategory.map((c) => [c.label, fmtNum(c.quantity), fmtNum(c.total), fmtNum(c.margin)]),
      ...REPORT_TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 92 },
        1: { cellWidth: 24, halign: "center" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = lastTableY(doc, y + 20) + 8;
  }

  // ── Top produits ──
  if (report.topProducts.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, "Top produits", y);
    autoTable(doc, {
      startY: y,
      head: [["Produit", "Quantité", "Total", "Marge"]],
      body: report.topProducts.map((p) => [p.name, fmtNum(p.quantity), fmtNum(p.total), fmtNum(p.margin)]),
      foot: [[
        "TOTAL",
        fmtNum(report.topProducts.reduce((a, p) => a + p.quantity, 0)),
        fmtNum(report.topProducts.reduce((a, p) => a + p.total, 0)),
        fmtNum(report.topProducts.reduce((a, p) => a + p.margin, 0)),
      ]],
      ...REPORT_TABLE_STYLES,
      footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 92 },
        1: { cellWidth: 24, halign: "center" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = lastTableY(doc, y + 20) + 8;
  }

  // ── Détail des factures ──
  if (report.invoices.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = sectionTitle(doc, "Détail des factures", y);
    autoTable(doc, {
      startY: y,
      head: [["N°", "Date", "Client", "Paiement", "Livraison", "Total TTC"]],
      body: report.invoices.map((f) => [
        f.number,
        fmtDate(f.date),
        f.clientName || "Client comptoir",
        PAYMENT_LABELS[f.paymentStatus] ?? f.paymentStatus,
        DELIVERY_LABELS[f.deliveryStatus] ?? f.deliveryStatus,
        fmtNum(f.totalTTC),
      ]),
      foot: [["TOTAL", "", "", "", "", fmtNum(s.totalTTC)]],
      ...REPORT_TABLE_STYLES,
      footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: "bold" },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 62 },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 22, halign: "center" },
        5: { halign: "right", fontStyle: "bold" },
      },
    });
  }

  drawFooter(doc);
  return doc;
}

// ─── Bon de livraison (sans les prix) ──────────────────────────────────────

export async function buildDeliveryNotePDF(invoice: Invoice): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, "BON DE LIVRAISON", `Réf. facture ${invoice.number} — ${fmtDate(invoice.date)}`);

  // Bloc client
  const blockY = 50;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("CLIENT", 14, blockY);
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(invoice.clientName || "Client comptoir", 100), 14, blockY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  let cy = blockY + 6 + doc.splitTextToSize(invoice.clientName || "Client comptoir", 100).length * 5.5;
  if (invoice.clientPhone) {
    doc.text(`Tél : ${invoice.clientPhone}`, 14, cy);
    cy += 4.5;
  }
  if (invoice.clientAddress) {
    doc.text(invoice.clientAddress, 14, cy);
    cy += 4.5;
  }

  // Encadré livraison
  doc.setDrawColor(...GREEN);
  doc.setFillColor(...GREEN_BG);
  doc.roundedRect(140, blockY - 4, 56, 20, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  doc.text("LIVRAISON", 168, blockY + 2, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(
    invoice.deliveryStatus === "LIVRE" ? "Marchandise livrée" : "En attente de livraison",
    168,
    blockY + 9,
    { align: "center" }
  );

  // Articles (sans les prix)
  autoTable(doc, {
    startY: cy + 6,
    head: [["Désignation", "Quantité", "Unité"]],
    body: invoice.items.map((it) => [it.productName, fmtNum(it.quantity), it.unit]),
    foot: [["TOTAL ARTICLES", fmtNum(invoice.items.reduce((s, it) => s + it.quantity, 0)), ""]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 30, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 30, halign: "center" },
    },
    margin: { left: 14, right: 14 },
  });

  // Zone de signatures
  const ySig = Math.min(lastTableY(doc, cy + 60) + 30, 235);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("Livré par (ETS LAMP FALL)", 32, ySig, { align: "center" });
  doc.text("Reçu par (le client)", 148, ySig, { align: "center" });
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.25);
  doc.line(14, ySig + 22, 110, ySig + 22);
  doc.line(130, ySig + 22, 196, ySig + 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Nom, signature et cachet", 32, ySig + 26.5, { align: "center" });
  doc.text("Nom, signature et cachet", 148, ySig + 26.5, { align: "center" });

  drawFooter(doc);
  return doc;
}

// ─── État TVA (récapitulatif par période) ───────────────────────────────────

export async function buildVatReportPDF(report: SalesReport, periodLabel: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(doc, logo, "ÉTAT DE TVA", periodLabel);

  // Récapitulatif mensuel
  autoTable(doc, {
    startY: 50,
    head: [["Période", "Base HT", "TVA collectée", "Total TTC"]],
    body: report.monthly.map((m) => {
      const base = Math.max(0, m.total - Math.round((m.total * 18) / 118));
      return [m.label, fmtNum(base), fmtNum(m.total - base), fmtNum(m.total)];
    }),
    foot: [[
      "TOTAL",
      fmtNum(report.summary.totalHT),
      fmtNum(report.summary.vatTotal),
      fmtNum(report.summary.totalTTC),
    ]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  let y = lastTableY(doc, 50 + 40) + 10;

  // Détail par taux de TVA (si plusieurs taux)
  const rates = [...new Set(report.invoices.map((f) => f.taxRate))].sort((a, b) => a - b);
  if (rates.length > 1) {
    y = sectionTitle(doc, "Détail par taux de TVA", y);
    autoTable(doc, {
      startY: y,
      head: [["Taux", "Nombre de factures", "Base HT", "TVA"]],
      body: rates.map((r) => {
        const list = report.invoices.filter((f) => f.taxRate === r);
        const ht = list.reduce((s, f) => s + f.totalHT, 0);
        const vat = list.reduce((s, f) => s + (f.totalTTC - f.totalHT), 0);
        return [`${fmtNum(r)} %`, String(list.length), fmtNum(ht), fmtNum(vat)];
      }),
      ...REPORT_TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 25, halign: "center" },
        1: { cellWidth: 45, halign: "center" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = lastTableY(doc, y + 20) + 8;
  }

  // Mention légale
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    "État récapitulatif de la TVA collectée sur les ventes de la période — document interne d'aide à la déclaration.",
    14,
    y
  );

  drawFooter(doc);
  return doc;
}

// ─── Bon de commande fournisseur (réapprovisionnement) ───────────────────

export async function buildRestockOrderPDF(products: Product[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(
    doc,
    logo,
    "BON DE COMMANDE",
    `Réapprovisionnement stock — ${fmtDate(new Date())}`
  );

  autoTable(doc, {
    startY: 50,
    head: [["Produit", "Référence", "Stock actuel", "Stock min.", "Qté suggérée"]],
    body: products.map((p) => [
      p.name,
      p.reference || "—",
      fmtNum(p.stock),
      fmtNum(p.minStock),
      fmtNum(Math.max(p.minStock * 2 - p.stock, p.minStock)),
    ]),
    foot: [["TOTAL", "", "", "", fmtNum(products.reduce((s, p) => s + Math.max(p.minStock * 2 - p.stock, p.minStock), 0))]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 28 },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { halign: "center", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  const y = lastTableY(doc, 50 + 30) + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    "Quantités suggérées automatiquement (2 × le stock minimum), à ajuster selon les besoins réels.",
    14,
    y
  );

  // Signatures
  const ySig = Math.min(y + 20, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("Établi par", 40, ySig, { align: "center" });
  doc.text("Validé par", 148, ySig, { align: "center" });
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.25);
  doc.line(22, ySig + 20, 110, ySig + 20);
  doc.line(130, ySig + 20, 196, ySig + 20);

  drawFooter(doc);
  return doc;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function openPDF(doc: jsPDF) {
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}

export async function saveOrOpenInvoicePDF(invoice: Invoice, action: "download" | "open") {
  const doc = await buildInvoicePDF(invoice);
  const filename = `${invoice.type === "PROFORMA" ? "Proforma" : "Facture"}-${invoice.number}.pdf`;
  if (action === "download") downloadPDF(doc, filename);
  else openPDF(doc);
}

// ─── Impression directe (A4) ────────────────────────────────────────────────

/**
 * Imprime un document PDF via la boîte de dialogue du navigateur :
 * le PDF est chargé dans un iframe masqué puis window.print() est appelé.
 * Fonctionne avec toute imprimante installée sur la machine (A4, laser, jet d'encre…).
 */
export function printPDF(doc: jsPDF): void {
  try {
    doc.autoPrint();
  } catch {
    /* non bloquant */
  }
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Impression");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Repli : ouvre le PDF dans un onglet (impression manuelle)
      window.open(url, "_blank");
    } finally {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    }
  };
  document.body.appendChild(iframe);
}

/** Génère la facture / proforma complète et lance l'impression A4. */
export async function printInvoiceA4(invoice: Invoice): Promise<void> {
  const doc = await buildInvoicePDF(invoice);
  printPDF(doc);
}

// ─── Ticket de versement 80 mm (imprimante thermique) ───────────────────────

function ticketEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Imprime un document HTML (ticket 80 mm) : le HTML est encodé en blob URL puis
 * imprimé via un iframe masqué — même mécanique que l'impression A4 (fiable).
 */
export function printTicket80(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Ticket 80mm");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Repli : ouvre le ticket dans un onglet (impression manuelle)
      window.open(url, "_blank");
    } finally {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    }
  };
  document.body.appendChild(iframe);
}

/** Reçu de versement au format ticket 80 mm — HTML complet (aperçu + impression). */
export async function buildPaymentTicketHTML(
  payment: Pick<Payment, "amount" | "method" | "paidAt" | "note">,
  doc: Pick<Invoice, "number" | "clientName" | "totalTTC" | "amountPaid">
): Promise<string> {
  const info = await loadCompanyInfo();
  const reste = Math.max(0, doc.totalTTC - doc.amountPaid);
  const dateStr = new Date(payment.paidAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const methodLabel = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;

  const line = `<div class="sep"></div>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Recu ${ticketEsc(doc.number)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 80mm; }
  body {
    padding: 4mm 5mm;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 3.4mm;
    line-height: 1.45;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .shop { font-size: 4.4mm; font-weight: 800; letter-spacing: 0.3mm; }
  .small { font-size: 2.9mm; }
  .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .amount { font-size: 5.6mm; font-weight: 800; margin-top: 1mm; }
  .thanks { margin-top: 3mm; }
</style>
</head>
<body>
  <div class="center">
    <div class="shop">${ticketEsc(info.name)}</div>
    ${info.tagline ? `<div class="small">${ticketEsc(info.tagline)}</div>` : ""}
    ${info.address ? `<div class="small">${ticketEsc(info.address)}</div>` : ""}
    ${info.phone ? `<div class="small">Tél : ${ticketEsc(info.phone)}</div>` : ""}
    ${info.rc || info.ninea ? `<div class="small">${info.rc ? "RC : " + ticketEsc(info.rc) : ""}${info.rc && info.ninea ? " — " : ""}${info.ninea ? "NINEA : " + ticketEsc(info.ninea) : ""}</div>` : ""}
  </div>
  ${line}
  <div class="center bold">REÇU DE VERSEMENT</div>
  ${line}
  <div class="row"><span>Document</span><span class="bold">${ticketEsc(doc.number)}</span></div>
  <div class="row"><span>Client</span><span>${ticketEsc(doc.clientName || "Client comptoir")}</span></div>
  <div class="row"><span>Date</span><span>${dateStr}</span></div>
  <div class="row"><span>Mode</span><span>${ticketEsc(methodLabel)}</span></div>
  ${payment.note ? `<div class="small">Note : ${ticketEsc(payment.note)}</div>` : ""}
  ${line}
  <div class="center">
    <div class="bold">MONTANT REÇU</div>
    <div class="amount">${fmtMoney(payment.amount)}</div>
  </div>
  ${line}
  <div class="row"><span>Total document</span><span>${fmtMoney(doc.totalTTC)}</span></div>
  <div class="row"><span>Total versé</span><span>${fmtMoney(doc.amountPaid)}</span></div>
  <div class="row bold"><span>Reste à payer</span><span>${fmtMoney(reste)}</span></div>
  ${line}
  <div class="center small thanks">Merci de votre confiance !</div>
</body>
</html>`;
}

/** Imprime directement le ticket 80 mm du versement. */
export async function printPaymentTicket80(payment: Payment, invoice: Invoice): Promise<void> {
  const html = await buildPaymentTicketHTML(payment, invoice);
  printTicket80(html);
}

// ─── Rapport du jour (A4, imprimable) ───────────────────────────────────────

/**
 * Construit le rapport d'activité du jour : synthèse, factures du jour,
 * versements encaissés et règlements des achats à crédit.
 */
export async function buildDailyReportPDF(report: DailyReport): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  const dateLabel = new Date(`${report.date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  drawHeader(doc, logo, "RAPPORT DU JOUR", dateLabel);

  // ─── Bloc de synthèse (4 cases) ───────────────────────────────────────────
  const kpis: { label: string; value: string; color: readonly (number | number[])[] }[] = [
    { label: "Factures du jour", value: String(report.summary.invoiceCount), color: GREEN },
    { label: "Total facturé", value: fmtMoney(report.summary.totalTTC), color: DARK },
    { label: "Encaissé (versements)", value: fmtMoney(report.summary.receivedTotal), color: GREEN },
    { label: "Règlements crédit", value: fmtMoney(report.summary.creditPaidTotal), color: ORANGE },
  ];
  const boxW = 44;
  const boxH = 18;
  const gap = 4;
  let kx = 14;
  const ky = 50;
  for (const k of kpis) {
    doc.setFillColor(...GREEN_BG);
    doc.roundedRect(kx, ky, boxW, boxH, 2, 2, "F");
    doc.setTextColor(...GRAY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(k.label.toUpperCase(), kx + boxW / 2, ky + 6, { align: "center" });
    doc.setTextColor(...(k.color as [number, number, number]));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(k.value.length > 13 ? 8.5 : 10.5);
    doc.text(k.value, kx + boxW / 2, ky + 13, { align: "center" });
    kx += boxW + gap;
  }

  // Sous-ligne : statuts + proformas
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(
    `Payées : ${report.summary.paidCount}   •   Partielles : ${report.summary.partialCount}   •   Impayées : ${report.summary.unpaidCount}   •   Proformas du jour : ${report.summary.proformaCount}`,
    14,
    ky + boxH + 6
  );

  // ─── Tableau des factures du jour ─────────────────────────────────────────
  autoTable(doc, {
    startY: ky + boxH + 10,
    head: [["N°", "Client", "Articles", "Total TTC", "Payé", "Statut"]],
    body:
      report.invoices.length > 0
        ? report.invoices.map((f) => [
            f.number,
            f.clientName || "Client comptoir",
            String(f.items.length),
            fmtMoney(f.totalTTC),
            fmtMoney(f.amountPaid),
            PAYMENT_LABELS[f.paymentStatus] ?? f.paymentStatus,
          ])
        : [["—", "Aucune facture ce jour", "", "", "", ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: DARK },
    headStyles: { fillColor: [...GREEN], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [...GREEN_BG] },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      0: { fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  // ─── Versements encaissés du jour ─────────────────────────────────────────
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("Versements encaissés", 14, y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Heure", "Facture", "Client", "Mode", "Montant"]],
    body:
      report.payments.length > 0
        ? report.payments.map((p) => [
            new Date(p.paidAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
            p.invoiceNumber,
            p.clientName || "Client comptoir",
            PAYMENT_METHOD_LABELS[p.method] ?? p.method,
            fmtMoney(p.amount),
          ])
        : [["—", "Aucun versement ce jour", "", "", ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: DARK },
    headStyles: { fillColor: [...GREEN], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [...GREEN_BG] },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  // ─── Total encaissé du jour ───────────────────────────────────────────────
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const grandTotal = report.summary.receivedTotal;
  doc.setFillColor(...GREEN);
  doc.roundedRect(120, y - 5, 76, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("TOTAL ENCAISSÉ DU JOUR", 124, y + 2.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(fmtMoney(grandTotal), 192, y + 2.5, { align: "right" });

  // ─── Répartition par mode ─────────────────────────────────────────────────
  if (report.byMethod.length > 0) {
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const modes = report.byMethod
      .map((m) => `${m.label} : ${fmtMoney(m.amount)} (${m.count})`)
      .join("   •   ");
    doc.splitTextToSize(modes, 100).forEach((line: string, i: number) => {
      doc.text(line, 14, y + i * 4.5);
    });
  }

  // Pied de page
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(
    `Édité le ${new Date().toLocaleString("fr-FR")} — ETS LAMP FALL`,
    105,
    290,
    { align: "center" }
  );

  return doc;
}

// ─── Historique des achats d'un client ──────────────────────────────────

export async function buildClientHistoryPDF(
  client: Client,
  invoices: Invoice[]
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await getLogoBase64();

  drawHeader(
    doc,
    logo,
    "HISTORIQUE DES ACHATS",
    invoices.length > 0 ? `${invoices.length} document(s)` : "Aucun document"
  );

  // Bloc client
  const blockY = 50;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("CLIENT", 14, blockY);
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(client.name, 100), 14, blockY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  let cy = blockY + 6 + doc.splitTextToSize(client.name, 100).length * 5.5;
  const details: string[] = [];
  if (client.type) details.push(client.type === "ENTREPRISE" ? "Entreprise" : "Particulier");
  if (client.phone) details.push(`Tél : ${client.phone}`);
  if (client.email) details.push(client.email);
  if (client.address) details.push(client.address);
  for (const d of details) {
    doc.text(d, 14, cy);
    cy += 4.5;
  }

  // Totaux à droite
  const ventes = invoices.filter((f) => f.type === "VENTE");
  const totalVentes = ventes.reduce((s, f) => s + f.totalTTC, 0);
  const totalPaye = ventes.reduce((s, f) => s + f.amountPaid, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Total facturé :", 196, blockY + 6, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN);
  doc.text(fmtMoney(totalVentes), 196, blockY + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text("Total payé :", 196, blockY + 18, { align: "right" });
  doc.text(fmtMoney(totalPaye), 196, blockY + 22, { align: "right" });
  const reste = totalVentes - totalPaye;
  doc.text("Reste à payer :", 196, blockY + 27, { align: "right" });
  doc.setTextColor(...(reste > 0 ? RED : GREEN));
  doc.text(fmtMoney(reste), 196, blockY + 31, { align: "right" });
  doc.setTextColor(...GRAY);

  // Tableau des documents (sous le bloc client et les totaux de droite)
  const tableStartY = Math.max(cy, blockY + 36) + 4;
  autoTable(doc, {
    startY: tableStartY,
    head: [["N°", "Type", "Date d'achat", "Montant TTC", "Paiement", "Livraison"]],
    body: invoices.map((f) => [
      f.number,
      f.type === "PROFORMA" ? "Proforma" : "Vente",
      fmtDate(f.date),
      fmtNum(f.totalTTC),
      PAYMENT_LABELS[f.paymentStatus] ?? f.paymentStatus,
      DELIVERY_LABELS[f.deliveryStatus] ?? f.deliveryStatus,
    ]),
    foot: [
      [
        "TOTAL",
        "",
        "",
        fmtNum(invoices.reduce((s, f) => s + f.totalTTC, 0)),
        "",
        "",
      ],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: DARK as unknown as number[],
      lineColor: [210, 218, 213],
      lineWidth: 0.15,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    headStyles: { fillColor: GREEN as unknown as number[], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: GREEN_BG as unknown as number[], textColor: GREEN as unknown as number[], fontStyle: "bold" },
    alternateRowStyles: { fillColor: GREEN_BG as unknown as number[] },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 26, halign: "center" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 24, halign: "center" },
      5: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  return doc;
}
