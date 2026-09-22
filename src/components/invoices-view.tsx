"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Download,
  Eye,
  FileDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Repeat1,
  Search,
  Send,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue, useFetch } from "@/hooks/use-fetch";
import { formatMoney } from "@/lib/constants";
import type { Client, Invoice, Product } from "@/lib/types";
import {
  DeliveryBadge,
  PaymentBadge,
} from "@/components/status-badges";
import { InvoiceEditor } from "@/components/invoice-editor";
import { InvoiceShareDialog } from "@/components/invoice-share-dialog";
import { PaymentsDialog } from "@/components/payments-dialog";
import {
  buildDeliveryNotePDF,
  buildInvoiceListPDF,
  openPDF,
  printInvoiceA4,
  saveOrOpenInvoicePDF,
} from "@/lib/pdf";

interface InvoicesViewProps {
  type: "VENTE" | "PROFORMA";
  onNavigateToInvoices?: () => void;
  /** Ouvre automatiquement la page de création de facture (bouton du tableau de bord). */
  autoOpenNew?: boolean;
  /** Signale que l'ouverture automatique a été consommée. */
  onAutoOpenNewConsumed?: () => void;
}

export function InvoicesView({ type, onNavigateToInvoices, autoOpenNew, onAutoOpenNewConsumed }: InvoicesViewProps) {
  const { toast } = useToast();
  const isProforma = type === "PROFORMA";

  const [q, setQ] = useState("");
  const [payment, setPayment] = useState("");
  const [delivery, setDelivery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const debouncedQ = useDebouncedValue(q);

  const query = useMemo(() => {
    const params = new URLSearchParams({ type });
    if (debouncedQ) params.set("q", debouncedQ);
    if (payment) params.set("payment", payment);
    if (delivery) params.set("delivery", delivery);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (minAmount) params.set("minAmount", minAmount);
    if (maxAmount) params.set("maxAmount", maxAmount);
    return params.toString();
  }, [type, debouncedQ, payment, delivery, from, to, minAmount, maxAmount]);

  const { data: invoices, loading, refetch } = useFetch<Invoice[]>(`/api/invoices?${query}`);
  const { data: clients } = useFetch<Client[]>("/api/clients");
  const { data: products } = useFetch<Product[]>("/api/products");

  // Page plein écran de création / édition (remplace la modale)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [convertTarget, setConvertTarget] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialogs de partage & paiements (factures de vente uniquement)
  const [shareInvoice, setShareInvoice] = useState<Invoice | null>(null);
  const [shareMode, setShareMode] = useState<"relance" | "envoi">("relance");
  const [paymentsInvoice, setPaymentsInvoice] = useState<Invoice | null>(null);

  const totals = useMemo(() => {
    const list = invoices ?? [];
    const ttc = list.reduce((s, f) => s + f.totalTTC, 0);
    const paid = list.reduce((s, f) => s + f.amountPaid, 0);
    return { count: list.length, ttc, paid, reste: ttc - paid };
  }, [invoices]);

  const resetFilters = () => {
    setQ("");
    setPayment("");
    setDelivery("");
    setFrom("");
    setTo("");
    setMinAmount("");
    setMaxAmount("");
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (inv: Invoice) => {
    setEditing(inv);
    setEditorOpen(true);
  };

  // Ouverture automatique (bouton « Nouvelle facture » du tableau de bord)
  useEffect(() => {
    if (autoOpenNew) {
      setEditing(null);
      setEditorOpen(true);
      onAutoOpenNewConsumed?.();
    }
  }, [autoOpenNew, onAutoOpenNewConsumed]);

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression impossible");
      toast({ title: "Supprimée", description: `Facture ${deleting.number} supprimée.` });
      setDeleting(null);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const doConvert = async () => {
    if (!convertTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${convertTarget.id}/convert`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Conversion impossible");
      toast({
        title: "Proforma converti",
        description: `Facture de vente ${json.number} créée.`,
      });
      setConvertTarget(null);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const exportListPDF = async () => {
    if (!invoices || invoices.length === 0) {
      toast({ title: "Aucune facture", description: "Rien à exporter." });
      return;
    }
    const title = isProforma ? "LISTE DES PROFORMAS" : "LISTE DES FACTURES";
    const doc = await buildInvoiceListPDF(invoices, title, `${invoices.length} document(s)`);
    doc.save(`${isProforma ? "proformas" : "factures"}-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "Export PDF", description: `${invoices.length} document(s) exporté(s).` });
  };

  const handlePDF = async (inv: Invoice, action: "download" | "open") => {
    try {
      await saveOrOpenInvoicePDF(inv, action);
    } catch {
      toast({ title: "Erreur PDF", description: "Génération du PDF impossible.", variant: "destructive" });
    }
  };

  const handleDeliveryNote = async (inv: Invoice) => {
    try {
      const doc = await buildDeliveryNotePDF(inv);
      openPDF(doc);
    } catch {
      toast({
        title: "Erreur PDF",
        description: "Génération du bon de livraison impossible.",
        variant: "destructive",
      });
    }
  };

  const handlePrintA4 = async (inv: Invoice) => {
    try {
      await printInvoiceA4(inv);
    } catch {
      toast({
        title: "Erreur impression",
        description: "Lancement de l'impression impossible.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{isProforma ? "Factures proforma" : "Factures de vente"}</h2>
          <p className="text-sm text-muted-foreground">
            {isProforma
              ? "Devis prévisionnels convertissables en factures définitives."
              : "Suivi des livraisons et des paiements."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refetch} aria-label="Actualiser">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportListPDF}>
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {isProforma ? "Nouveau proforma" : "Nouvelle facture"}
          </Button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Documents</p>
            <p className="text-lg font-bold tabular-nums">{totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total TTC</p>
            <p className="text-lg font-bold tabular-nums">{formatMoney(totals.ttc)}</p>
          </CardContent>
        </Card>
        {!isProforma && (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Encaissé</p>
                <p className="text-lg font-bold tabular-nums text-green-700">
                  {formatMoney(totals.paid)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Reste à encaisser</p>
                <p className="text-lg font-bold tabular-nums text-red-600">
                  {formatMoney(totals.reste)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recherche & filtres */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher par numéro ou nom du client…"
                className="pl-8"
                aria-label="Rechercher une facture"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                aria-label="Filtrer par paiement"
              >
                <option value="">Paiement : tous</option>
                <option value="PAYE">Payé</option>
                <option value="PARTIEL">Partiel</option>
                <option value="NON_PAYE">Non payé</option>
              </select>
              <select
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                aria-label="Filtrer par livraison"
              >
                <option value="">Livraison : toutes</option>
                <option value="LIVRE">Livré</option>
                <option value="NON_LIVRE">Non livré</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((v) => !v)}
                className="col-span-2 sm:col-span-1"
              >
                {showAdvanced ? "Masquer" : "Plus de filtres"}
              </Button>
            </div>
          </div>
          {showAdvanced && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="f-from" className="text-xs">Du</Label>
                <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-to" className="text-xs">Au</Label>
                <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-min" className="text-xs">Montant min (FCFA)</Label>
                <Input id="f-min" type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-max" className="text-xs">Montant max (FCFA)</Label>
                <Input id="f-max" type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9" placeholder="∞" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aucune facture ne correspond à votre recherche.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Livraison</TableHead>
                  <TableHead className="w-12" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">
                      {inv.number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(inv.date).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="max-w-40 truncate" title={inv.clientName}>
                      {inv.clientName || "Client comptoir"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatMoney(inv.totalTTC)}
                    </TableCell>
                    <TableCell>
                      <PaymentBadge status={inv.paymentStatus} />
                    </TableCell>
                    <TableCell>
                      {isProforma ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <DeliveryBadge status={inv.deliveryStatus} />
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions pour ${inv.number}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handlePDF(inv, "open")}>
                            <Eye className="h-4 w-4" /> Voir le PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePDF(inv, "download")}>
                            <Download className="h-4 w-4" /> Télécharger le PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintA4(inv)}>
                            <Printer className="h-4 w-4" /> Imprimer (A4)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(inv)}>
                            <Pencil className="h-4 w-4" /> Modifier
                          </DropdownMenuItem>
                          {!isProforma && (
                            <>
                              <DropdownMenuItem onClick={() => setPaymentsInvoice(inv)}>
                                <Wallet className="h-4 w-4" /> Paiements
                              </DropdownMenuItem>
                              {inv.paymentStatus !== "PAYE" && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setShareMode("relance");
                                    setShareInvoice(inv);
                                  }}
                                >
                                  <Bell className="h-4 w-4" /> Relancer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  setShareMode("envoi");
                                  setShareInvoice(inv);
                                }}
                              >
                                <Send className="h-4 w-4" /> Envoyer par…
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeliveryNote(inv)}>
                                <Truck className="h-4 w-4" /> Bon de livraison
                              </DropdownMenuItem>
                            </>
                          )}
                          {isProforma && (
                            <DropdownMenuItem onClick={() => setConvertTarget(inv)}>
                              <Repeat1 className="h-4 w-4" /> Convertir en facture
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleting(inv)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Page plein écran création / édition */}
      <InvoiceEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          refetch();
        }}
        type={type}
        invoice={editing}
        clients={clients ?? []}
        products={products ?? []}
      />

      {/* Dialog partage : relance / envoi (WhatsApp, email, copie, PDF) */}
      <InvoiceShareDialog
        invoice={shareInvoice}
        mode={shareMode}
        open={shareInvoice !== null}
        onOpenChange={(v) => !v && setShareInvoice(null)}
      />

      {/* Dialog paiements (versements multiples) */}
      <PaymentsDialog
        invoice={paymentsInvoice}
        open={paymentsInvoice !== null}
        onOpenChange={(v) => !v && setPaymentsInvoice(null)}
        onUpdated={refetch}
      />

      {/* Confirmation suppression */}
      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer la facture ?</DialogTitle>
            <DialogDescription>
              {deleting &&
                `La facture ${deleting.number} (${formatMoney(deleting.totalTTC)}) sera définitivement supprimée${
                  !isProforma ? " et le stock des produits concernés sera restauré." : "."
                }`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation conversion proforma */}
      <Dialog open={convertTarget !== null} onOpenChange={(v) => !v && setConvertTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir en facture de vente ?</DialogTitle>
            <DialogDescription>
              {convertTarget &&
                `Une facture définitive sera créée à partir du proforma ${convertTarget.number}. Le stock des produits du catalogue sera décrémenté.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={doConvert} disabled={busy}>
              {busy ? "Conversion…" : "Convertir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
