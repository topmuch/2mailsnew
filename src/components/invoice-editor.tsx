"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_LABELS, formatMoney, PRODUCT_CATEGORIES, toISODate } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Client, Invoice, Product } from "@/lib/types";
import {
  DraftItem,
  ItemsEditor,
  emptyItem,
  itemToApi,
} from "@/components/items-editor";

interface InvoiceEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  type: "VENTE" | "PROFORMA";
  invoice: Invoice | null; // null = création
  clients: Client[];
  products: Product[];
}

interface FormState {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  date: string;
  dueDate: string;
  deliveryStatus: "LIVRE" | "NON_LIVRE";
  paymentStatus: "PAYE" | "PARTIEL" | "NON_PAYE";
  amountPaid: string;
  taxRate: string;
  updateStock: boolean;
  notes: string;
  items: DraftItem[];
}

function defaultForm(): FormState {
  const today = toISODate(new Date());
  return {
    clientId: "",
    clientName: "",
    clientPhone: "",
    clientAddress: "",
    date: today,
    dueDate: "",
    deliveryStatus: "NON_LIVRE",
    paymentStatus: "NON_PAYE",
    amountPaid: "0",
    taxRate: "18",
    updateStock: true,
    notes: "",
    items: [emptyItem()],
  };
}

function fromInvoice(invoice: Invoice): FormState {
  return {
    clientId: invoice.clientId ?? "",
    clientName: invoice.clientName ?? "",
    clientPhone: invoice.clientPhone ?? "",
    clientAddress: invoice.clientAddress ?? "",
    date: toISODate(invoice.date),
    dueDate: toISODate(invoice.dueDate),
    deliveryStatus: invoice.deliveryStatus,
    paymentStatus: invoice.paymentStatus,
    amountPaid: String(invoice.amountPaid ?? 0),
    taxRate: String(invoice.taxRate ?? 18),
    updateStock: true,
    notes: invoice.notes ?? "",
    items: invoice.items.map((it) => ({
      productId: it.productId ?? null,
      productName: it.productName,
      category: it.category ?? null,
      unit: it.unit,
      quantity: String(it.quantity),
      unitPrice: String(it.unitPrice),
    })),
  };
}

/* ─── Dialogue de création rapide de client ─────────────────────────────── */

function QuickClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (client: Client) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [clientType, setClientType] = useState<"PARTICULIER" | "ENTREPRISE">("PARTICULIER");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setAddress("");
      setClientType("PARTICULIER");
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      toast({
        title: "Nom requis",
        description: "Le nom du client est obligatoire.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          type: clientType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de création");
      toast({ title: "Client créé", description: json.name });
      onCreated(json as Client);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" aria-hidden /> Nouveau client
          </DialogTitle>
          <DialogDescription>
            Le client sera ajouté à votre répertoire et sélectionné pour cette facture.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qc-name">Nom *</Label>
            <Input
              id="qc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : M. Abdoulaye Diop"
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qc-phone">Téléphone</Label>
              <Input
                id="qc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+221 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={clientType} onValueChange={(v) => setClientType(v as "PARTICULIER" | "ENTREPRISE")}>
                <SelectTrigger aria-label="Type de client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARTICULIER">Particulier</SelectItem>
                  <SelectItem value="ENTREPRISE">Entreprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qc-address">Adresse</Label>
            <Input
              id="qc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Quartier, ville"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Créer le client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Dialogue de création rapide de produit ────────────────────────────── */

function QuickProductDialog({
  open,
  onOpenChange,
  presetName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetName: string;
  onCreated: (product: Product) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<{ code: string; label: string }[]>([]);
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [stock, setStock] = useState("0");
  const [unit, setUnit] = useState("pièce");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(presetName);
      setPurchasePrice("0");
      setSalePrice("0");
      setStock("0");
      setUnit("pièce");
      (async () => {
        let list: { code: string; label: string }[] = [];
        try {
          const res = await fetch("/api/categories");
          if (res.ok) list = await res.json();
        } catch {
          /* repli ci-dessous */
        }
        if (list.length === 0) {
          // Repli statique si la base n'a pas de catégories (comme CategoriesProvider)
          list = PRODUCT_CATEGORIES.map((code) => ({
            code,
            label: CATEGORY_LABELS[code] ?? code,
          }));
        }
        setCategories(list);
        setCategory(list[0]?.code ?? "");
      })();
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      toast({
        title: "Désignation requise",
        description: "Le nom du produit est obligatoire.",
        variant: "destructive",
      });
      return;
    }
    if (!category) {
      toast({
        title: "Catégorie requise",
        description: "Choisissez une catégorie pour le produit.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          purchasePrice: Number(purchasePrice) || 0,
          salePrice: Number(salePrice) || 0,
          stock: Number(stock) || 0,
          unit: unit.trim() || "pièce",
          minStock: 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de création");
      toast({ title: "Produit créé", description: json.name });
      onCreated(json as Product);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" aria-hidden /> Nouveau produit
          </DialogTitle>
          <DialogDescription>
            Le produit sera ajouté au catalogue et inséré dans cette facture.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qp-name">Désignation *</Label>
            <Input
              id="qp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Robinet mélangeur"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Catégorie *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Catégorie du produit">
                <SelectValue placeholder="Choisir une catégorie…" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {categories.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qp-purchase">Prix d&apos;achat (FCFA)</Label>
              <Input
                id="qp-purchase"
                type="number"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qp-sale">Prix de vente (FCFA)</Label>
              <Input
                id="qp-sale"
                type="number"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qp-stock">Stock initial</Label>
              <Input
                id="qp-stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qp-unit">Unité</Label>
              <Input
                id="qp-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pièce, m, sac…"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Créer le produit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Éditeur principal ─────────────────────────────────────────────────── */

/**
 * Éditeur de facture / proforma en PAGE PLEIN ÉCRAN — mise en page COMPACTE
 * 2 colonnes : articles + totaux à gauche, client/paramètres à droite.
 * Recherche de produits, création rapide de client et de produit intégrées.
 */
export function InvoiceEditor({
  open,
  onClose,
  onSaved,
  type,
  invoice,
  clients,
  products,
}: InvoiceEditorProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const isEdit = invoice !== null;
  const isProforma = type === "PROFORMA";

  // Listes locales (enrichies par les créations rapides)
  const [localClients, setLocalClients] = useState<Client[]>(clients);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  useEffect(() => setLocalClients(clients), [clients]);
  useEffect(() => setLocalProducts(products), [products]);

  // Dialogues de création rapide
  const [clientDialog, setClientDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [productPreset, setProductPreset] = useState("");

  useEffect(() => {
    if (open) {
      setForm(invoice ? fromInvoice(invoice) : defaultForm());
    }
  }, [open, invoice]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const totals = useMemo(() => {
    const ht = form.items.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
      0
    );
    const rate = Number(form.taxRate) || 0;
    const ttc = Math.round(ht * (1 + rate / 100));
    return { ht, tva: ttc - ht, ttc };
  }, [form.items, form.taxRate]);

  const onClientChange = (clientId: string) => {
    if (!clientId) {
      set({ clientId: "", clientName: "", clientPhone: "", clientAddress: "" });
      return;
    }
    const client = localClients.find((c) => c.id === clientId);
    if (!client) return;
    set({
      clientId,
      clientName: client.name,
      clientPhone: client.phone ?? "",
      clientAddress: client.address ?? "",
    });
  };

  const submit = async () => {
    const items = form.items.filter(
      (it) => it.productName.trim() && (Number(it.quantity) || 0) > 0
    );
    if (items.length === 0) {
      toast({
        title: "Articles manquants",
        description: "Ajoutez au moins un article avec un nom et une quantité.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type,
        clientId: form.clientId || null,
        clientName: form.clientName.trim() || "Client comptoir",
        clientPhone: form.clientPhone.trim(),
        clientAddress: form.clientAddress.trim(),
        date: form.date ? new Date(`${form.date}T12:00:00`) : new Date(),
        dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`) : null,
        deliveryStatus: form.deliveryStatus,
        paymentStatus: form.paymentStatus,
        amountPaid: form.paymentStatus === "PARTIEL" ? Number(form.amountPaid) || 0 : 0,
        taxRate: Number(form.taxRate) || 0,
        updateStock: form.updateStock,
        notes: form.notes,
        items: items.map(itemToApi),
      };
      const res = await fetch(
        isEdit ? `/api/invoices/${invoice!.id}` : "/api/invoices",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur d'enregistrement");

      toast({
        title: isEdit ? "Document modifié" : "Document enregistré",
        description: `N° ${json.number} — ${formatMoney(json.totalTTC)}`,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const docLabel = isProforma ? "proforma" : "facture";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={isEdit ? `Modifier le ${docLabel} ${invoice!.number}` : `Nouveau ${docLabel}`}>
      {/* Barre supérieure collante */}
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              aria-label="Retour à la liste"
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-lg">
                {isEdit
                  ? `Modifier ${isProforma ? "le proforma" : "la facture"} ${invoice!.number}`
                  : isProforma
                    ? "Nouvelle facture proforma"
                    : "Nouvelle facture de vente"}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {isProforma
                  ? "Devis prévisionnel — convertissable en facture définitive."
                  : "Articles, client, paiement et paramètres."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 md:flex">
              <span className="text-xs text-muted-foreground">Total TTC</span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {formatMoney(totals.ttc)}
              </span>
            </div>
            <Button onClick={submit} disabled={saving} className="min-w-32">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Contenu compact : 2 colonnes ─── */}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 pb-12 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Colonne principale : articles + totaux */}
        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemsEditor
              items={form.items}
              onChange={(items) => set({ items })}
              products={localProducts}
              priceField="salePrice"
              onCreateProduct={(term) => {
                setProductPreset(term);
                setProductDialog(true);
              }}
            />

            {/* Totaux intégrés (une seule ligne compacte) */}
            <Separator className="my-4" />
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <span className="text-xs text-muted-foreground">Total HT</span>
                <p className="font-semibold tabular-nums">{formatMoney(totals.ht)}</p>
              </div>
              <div className="flex items-end gap-1.5">
                <div className="w-20">
                  <Label htmlFor="inv-tva" className="text-xs text-muted-foreground">
                    TVA (%)
                  </Label>
                  <Input
                    id="inv-tva"
                    type="number"
                    min="0"
                    max="100"
                    value={form.taxRate}
                    onChange={(e) => set({ taxRate: e.target.value })}
                    className="h-8"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Montant TVA</span>
                  <p className="text-sm font-semibold tabular-nums">{formatMoney(totals.tva)}</p>
                </div>
              </div>
              <div className="ml-auto text-right">
                <span className="text-xs text-muted-foreground">Total TTC</span>
                <p className="text-lg font-bold tabular-nums text-primary">
                  {formatMoney(totals.ttc)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colonne latérale : client, paramètres, crédit, notes */}
        <div className="space-y-4">
          {/* Client */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                Client
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setClientDialog(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden /> Créer
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Client existant</Label>
                <Select value={form.clientId} onValueChange={onClientChange}>
                  <SelectTrigger aria-label="Choisir un client existant">
                    <SelectValue placeholder="— Client libre / comptoir —" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {localClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Nom du client</Label>
                <Input
                  id="inv-name"
                  value={form.clientName}
                  onChange={(e) => set({ clientName: e.target.value, clientId: "" })}
                  placeholder="Ex : M. Abdoulaye Diop"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-phone">Téléphone</Label>
                  <Input
                    id="inv-phone"
                    value={form.clientPhone}
                    onChange={(e) => set({ clientPhone: e.target.value })}
                    placeholder="+221 …"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-address">Adresse</Label>
                  <Input
                    id="inv-address"
                    value={form.clientAddress}
                    onChange={(e) => set({ clientAddress: e.target.value })}
                    placeholder="Quartier, ville"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Paramètres du document */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Paramètres</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-date">Date</Label>
                <Input
                  id="inv-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-due">Échéance (optionnel)</Label>
                <Input
                  id="inv-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set({ dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Livraison</Label>
                <Select
                  value={form.deliveryStatus}
                  onValueChange={(v) => set({ deliveryStatus: v as FormState["deliveryStatus"] })}
                >
                  <SelectTrigger aria-label="Statut de livraison">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NON_LIVRE">Non livré</SelectItem>
                    <SelectItem value="LIVRE">Livré</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Paiement</Label>
                <Select
                  value={form.paymentStatus}
                  onValueChange={(v) => set({ paymentStatus: v as FormState["paymentStatus"] })}
                >
                  <SelectTrigger aria-label="Statut de paiement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NON_PAYE">Non payé</SelectItem>
                    <SelectItem value="PARTIEL">Partiel</SelectItem>
                    <SelectItem value="PAYE">Payé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.paymentStatus === "PARTIEL" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="inv-paid">Montant payé (FCFA)</Label>
                  <Input
                    id="inv-paid"
                    type="number"
                    min="0"
                    value={form.amountPaid}
                    onChange={(e) => set({ amountPaid: e.target.value })}
                  />
                </div>
              )}
              {type === "VENTE" && !isEdit && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    id="inv-stock"
                    checked={form.updateStock}
                    onCheckedChange={(v) => set({ updateStock: v === true })}
                  />
                  <Label htmlFor="inv-stock" className="font-normal text-sm">
                    Décrémenter le stock
                  </Label>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                id="inv-notes"
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Conditions, remarques…"
                rows={2}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Dialogues de création rapide ─── */}
      <QuickClientDialog
        open={clientDialog}
        onOpenChange={setClientDialog}
        onCreated={(client) => {
          setLocalClients((list) => [client, ...list]);
          set({
            clientId: client.id,
            clientName: client.name,
            clientPhone: client.phone ?? "",
            clientAddress: client.address ?? "",
          });
        }}
      />
      <QuickProductDialog
        open={productDialog}
        onOpenChange={setProductDialog}
        presetName={productPreset}
        onCreated={(product) => {
          setLocalProducts((list) => [...list, product]);
          set({
            items: [
              ...form.items.filter((it) => it.productName.trim() || (Number(it.quantity) || 0) > 0),
              {
                productId: product.id,
                productName: product.name,
                category: product.category,
                unit: product.unit,
                quantity: "1",
                unitPrice: String(product.salePrice),
              },
            ],
          });
        }}
      />
    </div>
  );
}
