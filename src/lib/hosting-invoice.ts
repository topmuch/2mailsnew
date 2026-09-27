import { db } from "@/lib/db";
import { NUMBER_PREFIXES } from "@/lib/constants";
import { generateDocumentNumber, withNumberRetry } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import type { HostingDomain, HostingRenewal, Invoice } from "@prisma/client";

// ─── Facture automatique du module Hosting (Task 56-bis) ─────────────────────
// À la validation du paiement par l'admin (« Paiement reçu » / « Confirmer le
// renouvellement », action confirm-paid de /api/hosting/[id]), une facture de
// VENTE PAYÉE est générée automatiquement :
//  - ACHAT (status PENDING activé) : lignes « Nom de domaine » + « Hébergement »
//    (si le détail des prix correspond au montant encaissé), sinon une ligne
//    unique au montant encaissé ;
//  - RENOUVELLEMENT : ligne « Renouvellement … » au montant encaissé ;
//  - montant = renewal.amount (source de vérité du montant réellement reçu) ;
//  - paymentStatus = PAYE, amountPaid = totalTTC, TVA 0 % (les prix du module
//    hosting sont annoncés TTC) ;
//  - versement (Payment) lié à la facture avec la méthode Wave/Espèces/Virement
//    (mapping des méthodes hosting Manuel | Wave | Autre) ;
//  - client lié best-effort (recherche par nom exact) ;
//  - numérotation sécurisée FV-<année>-#### (generateDocumentNumber + retry
//    P2002), journal d'audit CREATE Invoice.
// La création est encapsulée : en cas d'échec, la confirmation de paiement
// reste valable (l'API renvoie invoiceError, sans facture).

/** Méthodes du module hosting → méthodes de versement de la facture. */
const HOSTING_METHOD_TO_PAYMENT: Record<string, string> = {
  Manuel: "ESPECES",
  Wave: "WAVE",
  Autre: "VIREMENT",
};

export type HostingInvoiceKind = "ACHAT" | "RENOUVELLEMENT";

export async function createHostingInvoice(opts: {
  domain: HostingDomain;
  renewal: HostingRenewal;
  kind: HostingInvoiceKind;
  method: string;
}): Promise<Invoice> {
  const { domain, renewal, kind, method } = opts;
  const amount = Number.isFinite(renewal.amount) && renewal.amount > 0 ? renewal.amount : 0;

  // Lignes de facture : détail domaine/hébergement pour un achat si les parts
  // correspondent au montant encaissé, sinon une seule ligne au montant reçu.
  const lines: { productName: string; unitPrice: number }[] = [];
  if (kind === "ACHAT") {
    const dPrice = domain.domainPrice;
    const hPrice = domain.hasHosting ? domain.hostingPrice : 0;
    const sum = dPrice + hPrice;
    if (dPrice > 0 && hPrice > 0 && Math.abs(sum - amount) < 1) {
      lines.push({ productName: `Nom de domaine ${domain.domain} — 1 an`, unitPrice: dPrice });
      lines.push({ productName: `Hébergement web ${domain.domain} — 1 an`, unitPrice: hPrice });
    } else {
      lines.push({
        productName: domain.hasHosting
          ? `Achat nom de domaine + hébergement ${domain.domain} — 1 an`
          : `Achat nom de domaine ${domain.domain} — 1 an`,
        unitPrice: amount,
      });
    }
  } else {
    lines.push({
      productName: `Renouvellement nom de domaine ${domain.domain} — ${renewal.renewedFor}`,
      unitPrice: amount,
    });
  }

  const totalHT = Math.round(lines.reduce((s, l) => s + l.unitPrice, 0));
  const taxRate = 0; // prix hosting annoncés TTC — le total doit égaler le montant payé
  const totalTTC = Math.round(totalHT * (1 + taxRate / 100));

  const clientName = (domain.clientName ?? "").trim() || `Client ${domain.domain}`;
  // Liaison best-effort au client CRM existant portant exactement ce nom
  const client = await db.client.findFirst({ where: { name: clientName }, select: { id: true } });

  const year = new Date().getFullYear();
  const paymentMethod = HOSTING_METHOD_TO_PAYMENT[method] ?? "ESPECES";
  const kindLabel = kind === "ACHAT" ? "achat" : "renouvellement";

  return withNumberRetry(
    () => generateDocumentNumber("invoice", NUMBER_PREFIXES.VENTE, year, { type: "VENTE" }),
    (number) =>
      db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            number,
            type: "VENTE",
            clientId: client?.id ?? null,
            clientName,
            clientPhone: domain.clientPhone,
            date: new Date(),
            deliveryStatus: "NON_LIVRE",
            paymentStatus: "PAYE",
            amountPaid: totalTTC,
            taxRate,
            totalHT,
            totalTTC,
            notes: `Facture générée automatiquement — ${kindLabel} ${domain.domain} (paiement ${method})`,
            items: {
              create: lines.map((l) => ({
                productName: l.productName,
                category: null,
                unit: "service",
                quantity: 1,
                unitPrice: l.unitPrice,
                total: l.unitPrice,
                purchasePrice: null,
              })),
            },
          },
          include: { items: true },
        });
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: totalTTC,
            method: paymentMethod,
            note: `Module Hosting — ${domain.domain} (${method})`,
          },
        });
        return invoice;
      }),
  );
}

/** Crée la facture + journal d'audit ; ne lève jamais (best-effort affiché). */
export async function createHostingInvoiceSafe(
  request: Request,
  opts: { domain: HostingDomain; renewal: HostingRenewal; kind: HostingInvoiceKind; method: string },
): Promise<{ invoice: Invoice | null; error?: string }> {
  try {
    const invoice = await createHostingInvoice(opts);
    await logAudit(
      request,
      "CREATE",
      "Invoice",
      invoice.id,
      `Auto hosting — ${invoice.number} — ${invoice.clientName} — ${invoice.totalTTC} FCFA`,
    );
    return { invoice };
  } catch (error) {
    console.error("[hosting-invoice] génération de facture échouée :", error);
    return { invoice: null, error: error instanceof Error ? error.message : "Erreur inconnue" };
  }
}
