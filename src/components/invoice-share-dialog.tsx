"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Copy,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatMoney } from "@/lib/constants";
import { saveOrOpenInvoicePDF } from "@/lib/pdf";
import { useSettingsStore } from "@/lib/settings-store";
import type { Invoice } from "@/lib/types";

/** Normalise un numéro sénégalais pour WhatsApp → format international 221XXXXXXXXX. */
function normalizePhone(raw?: string | null): string {
  let tel = (raw ?? "").replace(/\D/g, ""); // retire tout sauf les chiffres
  if (tel.startsWith("00")) tel = tel.slice(2); // 00 221 … → 221…
  if (tel.startsWith("0") && (tel.length === 9 || tel.length === 10)) {
    tel = "221" + tel.slice(1); // 0771234567 → 221771234567
  } else if (!tel.startsWith("221") && tel.length === 9) {
    tel = "221" + tel; // 771234567 → 221771234567
  }
  return tel;
}

/** Nombre formaté FR sans suffixe monétaire (pour insérer « FCFA » dans le texte). */
const fmtNumber = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

interface InvoiceShareDialogProps {
  invoice: Invoice | null;
  mode: "relance" | "envoi";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de partage d'une facture : relance de paiement ou envoi du document,
 * via WhatsApp, email ou copie du message. PDF téléchargeable en seconde action.
 */
export function InvoiceShareDialog({ invoice, mode, open, onOpenChange }: InvoiceShareDialogProps) {
  const { toast } = useToast();
  const nomSociete = useSettingsStore((s) => s.settings)?.nomSociete ?? "2MAILS";
  const isRelance = mode === "relance";

  const [message, setMessage] = useState("");
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const phone = useMemo(
    () => normalizePhone(invoice?.clientPhone ?? invoice?.client?.phone),
    [invoice]
  );
  const reste = invoice ? Math.max(0, invoice.totalTTC - invoice.amountPaid) : 0;

  // Message par défaut (éditable) reconstruit à chaque ouverture / changement de facture ou de mode
  const defaultMessage = useMemo(() => {
    if (!invoice) return "";
    const client = invoice.clientName || "Client comptoir";
    const num = invoice.number;
    const dateFr = formatDate(invoice.date);
    const ttc = formatMoney(invoice.totalTTC);
    const resteTxt = fmtNumber(invoice.totalTTC - invoice.amountPaid);
    if (mode === "relance") {
      return `Bonjour ${client},\n\nSauf erreur de notre part, la facture ${num} du ${dateFr} d'un montant de ${ttc} présente un reste à payer de ${resteTxt} FCFA.\n\nNous vous remercions de bien vouloir procéder au règlement.\n\nCordialement,\n${nomSociete}`;
    }
    return `Bonjour ${client},\n\nVeuillez trouver ci-joint la facture ${num} du ${dateFr} d'un montant de ${ttc}.\n\nReste à payer : ${resteTxt} FCFA.\n\nCordialement,\n${nomSociete}`;
  }, [invoice, mode, nomSociete]);

  useEffect(() => {
    if (open) setMessage(defaultMessage);
  }, [open, defaultMessage]);

  // L'email n'est pas snapshot sur la facture : on le récupère depuis la fiche client
  useEffect(() => {
    if (!open || !invoice) return;
    let cancelled = false;
    const fallback = invoice.client?.email ?? null;
    setClientEmail(fallback);
    if (!invoice.clientId) return;
    (async () => {
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) return;
        const list = (await res.json()) as { id: string; email?: string | null }[];
        const found = Array.isArray(list) ? list.find((c) => c.id === invoice.clientId) : null;
        if (!cancelled) setClientEmail(found?.email ?? fallback);
      } catch {
        /* silencieux : on garde le repli */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoice]);

  const handleWhatsApp = () => {
    if (!invoice || !phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleEmail = () => {
    if (!invoice || !clientEmail) return;
    const subject = `Facture ${invoice.number}`;
    window.location.href = `mailto:${clientEmail}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(message)}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: "Message copié", description: "Vous pouvez le coller où vous voulez." });
    } catch {
      toast({
        title: "Copie impossible",
        description: "Votre navigateur a refusé l'accès au presse-papiers.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setPdfBusy(true);
    try {
      await saveOrOpenInvoicePDF(invoice, "download");
      toast({ title: "PDF téléchargé", description: invoice.number });
    } catch {
      toast({ title: "Erreur PDF", description: "Génération du PDF impossible.", variant: "destructive" });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRelance ? (
              <Bell className="h-5 w-5 text-amber-500" aria-hidden />
            ) : (
              <Send className="h-5 w-5 text-primary" aria-hidden />
            )}
            {isRelance ? "Relancer le client" : "Envoyer la facture"}
          </DialogTitle>
          <DialogDescription>
            {isRelance
              ? "Envoyez un rappel de paiement par WhatsApp ou par email."
              : "Transmettez la facture au client accompagnée d'un message."}
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <>
            {/* Résumé de la facture */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Facture</p>
                <p className="truncate text-sm font-semibold" title={invoice.number}>
                  {invoice.number}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Client</p>
                <p className="truncate text-sm font-semibold" title={invoice.clientName || "Client comptoir"}>
                  {invoice.clientName || "Client comptoir"}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Reste à payer</p>
                <p className="truncate text-sm font-semibold tabular-nums text-red-600" title={formatMoney(reste)}>
                  {formatMoney(reste)}
                </p>
              </div>
            </div>

            {/* Message éditable */}
            <div className="space-y-1.5">
              <Label htmlFor="share-message">Message</Label>
              <Textarea
                id="share-message"
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-sm"
                aria-label="Message à envoyer"
              />
            </div>

            {/* Actions d'envoi */}
            <div className="grid gap-2 sm:grid-cols-3">
              {phone ? (
                <Button onClick={handleWhatsApp} className="min-h-11 bg-green-600 font-semibold text-white hover:bg-green-700">
                  <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button disabled className="min-h-11 w-full">
                        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Aucun numéro de téléphone pour ce client</TooltipContent>
                </Tooltip>
              )}
              {clientEmail ? (
                <Button variant="outline" onClick={handleEmail} className="min-h-11 font-semibold">
                  <Mail className="h-4 w-4" aria-hidden /> Email
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button variant="outline" disabled className="min-h-11 w-full">
                        <Mail className="h-4 w-4" aria-hidden /> Email
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Aucun email pour ce client</TooltipContent>
                </Tooltip>
              )}
              <Button variant="outline" onClick={handleCopy} className="min-h-11 font-semibold">
                <Copy className="h-4 w-4" aria-hidden /> Copier le message
              </Button>
            </div>

            {/* PDF */}
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfBusy} className="min-h-11 w-full">
              {pdfBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Télécharger le PDF
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
