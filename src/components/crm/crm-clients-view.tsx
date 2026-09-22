"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Phone, Mail, Plus, Search, StickyNote, Trash2, Users2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { formatRelativeFr } from "@/components/crm/crm-shared";
import type { CrmClientDto } from "@/lib/types";

// ─── Clients CRM (base client locale du CRM unifié) ─────────────────────────

interface ClientForm {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: ClientForm = { name: "", email: "", phone: "", notes: "" };

export default function CrmClientsView() {
  const { toast } = useToast();
  const [clients, setClients] = useState<CrmClientDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmClientDto | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/clients");
      if (!res.ok) throw new Error("Chargement impossible");
      setClients(await res.json());
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les clients CRM", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.email, c.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [clients, query]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: CrmClientDto) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Le nom est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/crm/clients/${editing.id}` : "/api/crm/clients", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: editing ? "Client mis à jour" : "Client créé" });
      setDialogOpen(false);
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: CrmClientDto) => {
    if (!window.confirm(`Supprimer le client « ${c.name} » ? Les items liés seront détachés.`)) return;
    try {
      const res = await authFetch(`/api/crm/clients/${c.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Client supprimé" });
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6 text-gold" aria-hidden />
            Clients CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base client du CRM unifié — rattachement automatique des propriétaires de QR codes (par téléphone ou e-mail).
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Nouveau client
        </Button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Rechercher un client (nom, e-mail, téléphone…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un client"
        />
      </div>

      {/* Tableau */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center px-4">
              <Users2 className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="font-semibold">{clients.length === 0 ? "Aucun client CRM" : "Aucun résultat"}</p>
              <p className="text-sm text-muted-foreground max-w-md">
                {clients.length === 0
                  ? "Créez un client, ou laissez la synchronisation CRM rattacher automatiquement les propriétaires de QR codes."
                  : "Modifiez la recherche pour élargir la liste."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead className="hidden sm:table-cell">Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Créé</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-semibold text-sm truncate max-w-44">{c.name}</p>
                        {c.notes && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate max-w-44">
                            <StickyNote className="h-3 w-3" aria-hidden />
                            {c.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {c.phone && (
                          <p className="text-sm flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" aria-hidden />
                            {c.phone}
                          </p>
                        )}
                        {c.email && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" aria-hidden />
                            {c.email}
                          </p>
                        )}
                        {!c.phone && !c.email && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">{c.totalItems}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge
                          variant="outline"
                          className={
                            c.status === "ACTIVE"
                              ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {c.status === "ACTIVE" ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatRelativeFr(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label={`Modifier ${c.name}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(c)} aria-label={`Supprimer ${c.name}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog créer / modifier */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.name} »` : "Nouveau client CRM"}</DialogTitle>
            <DialogDescription>
              Un client peut être rattaché automatiquement aux QR codes dont le téléphone ou l&apos;e-mail correspond.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="crm-client-name">Nom *</Label>
              <Input
                id="crm-client-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom du client"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="crm-client-phone">Téléphone</Label>
                <Input
                  id="crm-client-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+221 77 000 00 00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-client-email">E-mail</Label>
                <Input
                  id="crm-client-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="client@exemple.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-client-notes">Notes</Label>
              <Textarea
                id="crm-client-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes internes (optionnel)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editing ? "Enregistrer" : "Créer le client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
