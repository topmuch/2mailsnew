"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileDown,
  Home,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue, useFetch } from "@/hooks/use-fetch";
import { currentMonth, formatDate, formatMoney, monthLabel } from "@/lib/constants";
import type { Rent, Tenant } from "@/lib/types";
import { RentStatusBadge } from "@/components/status-badges";
import { buildRentReceiptPDF, buildTenantRentsPDF, downloadPDF } from "@/lib/pdf";

interface TenantFormState {
  name: string;
  phone: string;
  building: string;
  unit: string;
  monthlyRent: string;
  notes: string;
}

const emptyTenantForm: TenantFormState = {
  name: "",
  phone: "",
  building: "",
  unit: "",
  monthlyRent: "0",
  notes: "",
};

interface RentFormState {
  month: string;
  amount: string;
  status: "PAYE" | "NON_PAYE";
}

export function ImmoView() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const { data: tenants, loading, refetch } = useFetch<Tenant[]>(
    `/api/tenants${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`
  );

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const selectedTenant = (tenants ?? []).find((t) => t.id === selectedTenantId) ?? null;

  // Dialog locataire
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState<TenantFormState>(emptyTenantForm);
  const [savingTenant, setSavingTenant] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);

  // Dialog loyer
  const [rentDialogOpen, setRentDialogOpen] = useState(false);
  const [rentForm, setRentForm] = useState<RentFormState>({
    month: currentMonth(),
    amount: "0",
    status: "NON_PAYE",
  });
  const [savingRent, setSavingRent] = useState(false);
  const [rentToDelete, setRentToDelete] = useState<Rent | null>(null);

  const thisMonth = currentMonth();

  useEffect(() => {
    if (tenantDialogOpen) {
      setTenantForm(
        editingTenant
          ? {
              name: editingTenant.name,
              phone: editingTenant.phone ?? "",
              building: editingTenant.building,
              unit: editingTenant.unit ?? "",
              monthlyRent: String(editingTenant.monthlyRent),
              notes: editingTenant.notes ?? "",
            }
          : emptyTenantForm
      );
    }
  }, [tenantDialogOpen, editingTenant]);

  useEffect(() => {
    if (rentDialogOpen && selectedTenant) {
      setRentForm({
        month: currentMonth(),
        amount: String(selectedTenant.monthlyRent),
        status: "NON_PAYE",
      });
    }
  }, [rentDialogOpen, selectedTenant]);

  const stats = useMemo(() => {
    const list = tenants ?? [];
    const expected = list.reduce((s, t) => s + t.monthlyRent, 0);
    const allRents = list.flatMap((t) => t.rents);
    const collectedThisMonth = allRents
      .filter((r) => r.month === thisMonth && r.status === "PAYE")
      .reduce((s, r) => s + r.amount, 0);
    const unpaid = allRents.filter((r) => r.status === "NON_PAYE");
    const unpaidTotal = unpaid.reduce((s, r) => s + r.amount, 0);
    return { expected, collectedThisMonth, unpaidCount: unpaid.length, unpaidTotal };
  }, [tenants, thisMonth]);

  const submitTenant = async () => {
    if (!tenantForm.name.trim()) {
      toast({ title: "Nom du locataire obligatoire", variant: "destructive" });
      return;
    }
    if (!tenantForm.building.trim()) {
      toast({ title: "Immeuble obligatoire", variant: "destructive" });
      return;
    }
    setSavingTenant(true);
    try {
      const res = await fetch(editingTenant ? `/api/tenants/${editingTenant.id}` : "/api/tenants", {
        method: editingTenant ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...tenantForm,
          monthlyRent: Number(tenantForm.monthlyRent) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur d'enregistrement");
      toast({
        title: editingTenant ? "Locataire modifié" : "Locataire créé",
        description: tenantForm.name,
      });
      setTenantDialogOpen(false);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSavingTenant(false);
    }
  };

  const doDeleteTenant = async () => {
    if (!tenantToDelete) return;
    try {
      const res = await fetch(`/api/tenants/${tenantToDelete.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suppression impossible");
      toast({ title: "Dossier supprimé", description: tenantToDelete.name });
      if (selectedTenantId === tenantToDelete.id) setSelectedTenantId(null);
      setTenantToDelete(null);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  };

  const submitRent = async () => {
    if (!selectedTenant) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rentForm.month)) {
      toast({ title: "Choisissez un mois", variant: "destructive" });
      return;
    }
    setSavingRent(true);
    try {
      const res = await fetch("/api/rents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          month: rentForm.month,
          amount: Number(rentForm.amount) || 0,
          status: rentForm.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur d'enregistrement");
      toast({
        title: "Loyer enregistré",
        description: `${monthLabel(rentForm.month)} — ${selectedTenant.name}`,
      });
      setRentDialogOpen(false);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSavingRent(false);
    }
  };

  const toggleRentStatus = async (rent: Rent) => {
    const nextStatus = rent.status === "PAYE" ? "NON_PAYE" : "PAYE";
    try {
      const res = await fetch(`/api/rents/${rent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({
        title: nextStatus === "PAYE" ? "Loyer marqué payé" : "Loyer marqué non payé",
        description: monthLabel(rent.month),
      });
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  };

  const doDeleteRent = async () => {
    if (!rentToDelete) return;
    try {
      const res = await fetch(`/api/rents/${rentToDelete.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suppression impossible");
      toast({ title: "Loyer supprimé", description: monthLabel(rentToDelete.month) });
      setRentToDelete(null);
      refetch();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  };

  const exportQuittance = async (tenant: Tenant, rent: Rent) => {
    try {
      const doc = await buildRentReceiptPDF(tenant, rent);
      downloadPDF(
        doc,
        `${rent.status === "PAYE" ? "Quittance" : "Avis"}-${tenant.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${rent.month}.pdf`
      );
      toast({ title: "PDF téléchargé", description: monthLabel(rent.month) });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Génération PDF impossible",
        variant: "destructive",
      });
    }
  };

  const exportEcheancier = async (tenant: Tenant) => {
    try {
      const doc = await buildTenantRentsPDF(tenant);
      downloadPDF(doc, `Echeancier-${tenant.name.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`);
      toast({ title: "Échéancier exporté en PDF" });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Génération PDF impossible",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Immobilier — Loyers</h2>
          <p className="text-sm text-muted-foreground">
            Dossiers par locataire : immeuble, loyer mensuel et suivi des mois payés / non payés.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingTenant(null);
            setTenantDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nouveau locataire
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Locataires</p>
              <p className="text-lg font-bold tabular-nums">{(tenants ?? []).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Loyers attendus / mois</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(stats.expected)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BadgeCheck className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Encaissé ({monthLabel(thisMonth)})</p>
              <p className="text-lg font-bold tabular-nums text-green-700">
                {formatMoney(stats.collectedThisMonth)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Impayés</p>
              <p className="text-lg font-bold tabular-nums text-red-600">
                {formatMoney(stats.unpaidTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stats.unpaidCount} mois non payé(s)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un locataire ou un immeuble…"
              className="pl-8"
              aria-label="Rechercher un locataire"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] items-start">
        {/* Dossiers locataires */}
        <div className="space-y-3 min-w-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !tenants || tenants.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Aucun locataire. Créez un premier dossier avec « Nouveau locataire ».
              </CardContent>
            </Card>
          ) : (
            tenants.map((t) => {
              const currentRent = t.rents.find((r) => r.month === thisMonth);
              const unpaidMonths = t.rents.filter((r) => r.status === "NON_PAYE").length;
              const isSelected = t.id === selectedTenantId;
              return (
                <Card
                  key={t.id}
                  className={`cursor-pointer transition-colors hover:border-primary/50 ${
                    isSelected ? "border-primary ring-1 ring-primary/40" : ""
                  }`}
                  onClick={() => setSelectedTenantId(t.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{t.name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {t.building}
                            {t.unit ? ` — ${t.unit}` : ""}
                          </span>
                        </p>
                        <p className="text-sm font-medium text-primary mt-1 tabular-nums">
                          {formatMoney(t.monthlyRent)} / mois
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {currentRent ? (
                          <RentStatusBadge status={currentRent.status} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground border rounded-md px-2 py-0.5">
                            {monthLabel(thisMonth)} : sans échéance
                          </span>
                        )}
                        {unpaidMonths > 0 && (
                          <span className="text-[11px] font-semibold text-red-600">
                            {unpaidMonths} mois impayé(s)
                          </span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Actions pour ${t.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingTenant(t);
                                setTenantDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setTenantToDelete(t)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Échéancier du locataire sélectionné */}
        <Card className="overflow-hidden lg:sticky lg:top-4 min-w-0">
          <CardContent className="p-0">
            {!selectedTenant ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Home className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                Sélectionnez un locataire pour suivre ses loyers mois par mois.
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{selectedTenant.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedTenant.building}
                      {selectedTenant.unit ? ` — ${selectedTenant.unit}` : ""} •{" "}
                      {formatMoney(selectedTenant.monthlyRent)} / mois
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportEcheancier(selectedTenant)}
                      aria-label="Exporter l'échéancier en PDF"
                      title="Échéancier PDF"
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setRentDialogOpen(true)}>
                      <Plus className="h-4 w-4" /> Loyer
                    </Button>
                  </div>
                </div>
                {selectedTenant.rents.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Aucun loyer enregistré. Ajoutez une échéance (ex : {monthLabel(thisMonth)}).
                  </div>
                ) : (
                  <div className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Mois</TableHead>
                          <TableHead className="text-right">Loyer</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="w-24 text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTenant.rents.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {monthLabel(r.month)}
                              {r.status === "PAYE" && r.paidAt && (
                                <div className="text-[11px] font-normal text-muted-foreground">
                                  Réglé le {formatDate(r.paidAt)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                              {formatMoney(r.amount)}
                            </TableCell>
                            <TableCell>
                              <RentStatusBadge status={r.status} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-7 w-7 ${
                                    r.status === "PAYE"
                                      ? "text-green-700 hover:text-green-700"
                                      : "text-muted-foreground hover:text-green-700"
                                  }`}
                                  onClick={() => toggleRentStatus(r)}
                                  aria-label={
                                    r.status === "PAYE"
                                      ? "Marquer comme non payé"
                                      : "Marquer comme payé"
                                  }
                                  title={
                                    r.status === "PAYE"
                                      ? "Marquer non payé"
                                      : "Marquer payé"
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => exportQuittance(selectedTenant, r)}
                                  aria-label={`Télécharger le PDF pour ${monthLabel(r.month)}`}
                                  title={
                                    r.status === "PAYE"
                                      ? "Quittance PDF"
                                      : "Avis d'échéance PDF"
                                  }
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setRentToDelete(r)}
                                  aria-label={`Supprimer le loyer de ${monthLabel(r.month)}`}
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog locataire */}
      <Dialog open={tenantDialogOpen} onOpenChange={(v) => !v && setTenantDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTenant ? "Modifier le locataire" : "Nouveau locataire"}</DialogTitle>
            <DialogDescription>
              Dossier locataire : immeuble occupé et loyer mensuel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nom du locataire *</Label>
              <Input
                id="t-name"
                value={tenantForm.name}
                onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                placeholder="Ex : Moussa Diop"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-building">Immeuble *</Label>
                <Input
                  id="t-building"
                  value={tenantForm.building}
                  onChange={(e) => setTenantForm({ ...tenantForm, building: e.target.value })}
                  placeholder="Ex : Immeuble F"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-unit">Logement / local</Label>
                <Input
                  id="t-unit"
                  value={tenantForm.unit}
                  onChange={(e) => setTenantForm({ ...tenantForm, unit: e.target.value })}
                  placeholder="Ex : Appartement 2B"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-rent">Loyer mensuel (FCFA)</Label>
                <Input
                  id="t-rent"
                  type="number"
                  min="0"
                  value={tenantForm.monthlyRent}
                  onChange={(e) => setTenantForm({ ...tenantForm, monthlyRent: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-phone">Téléphone</Label>
                <Input
                  id="t-phone"
                  value={tenantForm.phone}
                  onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                  placeholder="+221 …"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-notes">Notes</Label>
              <Textarea
                id="t-notes"
                value={tenantForm.notes}
                onChange={(e) => setTenantForm({ ...tenantForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantDialogOpen(false)} disabled={savingTenant}>
              Annuler
            </Button>
            <Button onClick={submitTenant} disabled={savingTenant}>
              {savingTenant ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog loyer */}
      <Dialog open={rentDialogOpen} onOpenChange={(v) => !v && setRentDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle échéance de loyer</DialogTitle>
            <DialogDescription>
              {selectedTenant && `${selectedTenant.name} — ${selectedTenant.building}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-month">Mois concerné *</Label>
              <Input
                id="r-month"
                type="month"
                value={rentForm.month}
                onChange={(e) => setRentForm({ ...rentForm, month: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-amount">Montant (FCFA)</Label>
              <Input
                id="r-amount"
                type="number"
                min="0"
                value={rentForm.amount}
                onChange={(e) => setRentForm({ ...rentForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <div className="flex gap-2">
                {(["NON_PAYE", "PAYE"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={rentForm.status === s ? "default" : "outline"}
                    onClick={() => setRentForm({ ...rentForm, status: s })}
                  >
                    {s === "PAYE" ? "Payé" : "Non payé"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRentDialogOpen(false)} disabled={savingRent}>
              Annuler
            </Button>
            <Button onClick={submitRent} disabled={savingRent}>
              {savingRent ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression loyer */}
      <Dialog open={rentToDelete !== null} onOpenChange={(v) => !v && setRentToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce loyer ?</DialogTitle>
            <DialogDescription>
              {rentToDelete && `L'échéance de ${monthLabel(rentToDelete.month)} sera définitivement supprimée.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRentToDelete(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={doDeleteRent}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression locataire */}
      <Dialog open={tenantToDelete !== null} onOpenChange={(v) => !v && setTenantToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce dossier ?</DialogTitle>
            <DialogDescription>
              {tenantToDelete &&
                `Le dossier de « ${tenantToDelete.name} » (${tenantToDelete.building}) et tout son historique de loyers seront supprimés.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantToDelete(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={doDeleteTenant}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
