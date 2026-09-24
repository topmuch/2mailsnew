"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import type { CrmLead } from "@/lib/types";

// ─── Leads : pipeline commercial (nouveau → gagné/perdu) ─────────────────────

const STAGES: { value: CrmLead["status"]; label: string; dot: string }[] = [
  { value: "NEW", label: "Nouveau", dot: "bg-emerald-500" },
  { value: "CONTACTED", label: "Contacté", dot: "bg-amber-500" },
  { value: "QUALIFIED", label: "Qualifié", dot: "bg-sky-600" },
  { value: "PROPOSAL", label: "Devis envoyé", dot: "bg-purple-600" },
  { value: "WON", label: "Gagné", dot: "bg-green-600" },
  { value: "LOST", label: "Perdu", dot: "bg-red-500" },
];

const SOURCE_LABEL: Record<string, string> = {
  QRTAGS: "QRTags",
  QRBAGS: "QRBags",
  RECOMMANDATION: "Recommandation",
  SITE_WEB: "Site web",
  AUTRE: "Autre",
};

const fmtFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

interface LeadForm {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  value: string;
  notes: string;
}

const EMPTY_FORM: LeadForm = { name: "", company: "", email: "", phone: "", source: "AUTRE", status: "NEW", value: "", notes: "" };

export default function CrmLeadsView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pipelineValue, setPipelineValue] = useState(0);
  const [wonValue, setWonValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/leads");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads ?? []);
      setCounts(data.counts ?? {});
      setPipelineValue(data.pipelineValue ?? 0);
      setWonValue(data.wonValue ?? 0);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les leads", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = query.trim()
    ? leads.filter((l) =>
        [l.name, l.company, l.email, l.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(query.trim().toLowerCase())),
      )
    : leads;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (l: CrmLead) => {
    setEditing(l);
    setForm({
      name: l.name,
      company: l.company ?? "",
      email: l.email ?? "",
      phone: l.phone ?? "",
      source: l.source,
      status: l.status,
      value: l.value ? String(l.value) : "",
      notes: l.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Le nom du lead est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/crm/leads/${editing.id}` : "/api/crm/leads", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, value: form.value ? Number(form.value) : 0 }),
      });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Lead mis à jour" : "Lead ajouté au pipeline" });
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (lead: CrmLead, status: string) => {
    try {
      const res = await authFetch(`/api/crm/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast({ title: "Erreur", description: "Changement de statut impossible", variant: "destructive" });
    }
  };

  const remove = async (lead: CrmLead) => {
    if (!confirm(`Supprimer le lead « ${lead.name} » ?`)) return;
    try {
      const res = await authFetch(`/api/crm/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Lead supprimé" });
      load();
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible (admin requis)", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Briefcase className="h-6 w-6 text-gold" /> Leads
          </h1>
          <p className="text-sm text-muted-foreground">Pipeline commercial — prospects QRTags, QRBags et partenaires.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nouveau lead
        </Button>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-gold">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">En pipeline</p>
            <p className="flex items-center gap-1.5 text-xl font-bold text-sidebar">
              <TrendingUp className="h-4 w-4 text-gold" /> {fmtFcfa(pipelineValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gold">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gagné (cumul)</p>
            <p className="text-xl font-bold text-emerald-600">{fmtFcfa(wonValue)}</p>
          </CardContent>
        </Card>
        {["NEW", "PROPOSAL"].map((s) => (
          <Card key={s} className="border-l-4 border-l-gold">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{STAGES.find((st) => st.value === s)?.label}</p>
              <p className="text-xl font-bold">{loading ? "—" : counts[s] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher un lead…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {/* Kanban pipeline — grille responsive : toutes les étapes visibles,
          hauteur plafonnée avec défilement interne (la page ne s'allonge plus) */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {STAGES.map((s) => (
            <div key={s.value} className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((l) => l.status === stage.value);
            const stageValue = stageLeads.reduce((s, l) => s + (l.value ?? 0), 0);
            return (
              <div key={stage.value} className="flex min-w-0 flex-col rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2 w-2 rounded-full ${stage.dot}`} aria-hidden />
                    {stage.label}
                  </p>
                  <Badge variant="outline" className="text-[10px]">{stageLeads.length}</Badge>
                </div>
                <p className="px-3 pt-1.5 text-[11px] text-muted-foreground">{fmtFcfa(stageValue)}</p>
                <div className="max-h-[380px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pr-1">
                  {stageLeads.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">Vide</p>
                  ) : (
                    stageLeads.map((l) => (
                      <Card key={l.id} className="group p-2.5">
                        <CardContent className="space-y-1.5 p-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-semibold leading-tight">{l.name}</p>
                            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(l)} aria-label={`Modifier ${l.name}`}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {isAdmin && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(l)} aria-label={`Supprimer ${l.name}`}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {l.company && <p className="text-xs text-muted-foreground">{l.company}</p>}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {l.value > 0 && <Badge variant="outline" className="bg-gold/10 text-gold border-gold/30 text-[10px]">{fmtFcfa(l.value)}</Badge>}
                            {l.source !== "AUTRE" && <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[l.source]}</Badge>}
                          </div>
                          {(l.email || l.phone) && (
                            <p className="text-[11px] text-muted-foreground">{l.email ?? l.phone}</p>
                          )}
                          <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                            <SelectTrigger className="h-7 w-full text-[11px]" aria-label={`Statut de ${l.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le lead" : "Nouveau lead"}</DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations du prospect." : "Ajoutez un prospect au pipeline commercial."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nom du contact *</Label>
              <Input id="lead-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. : Ibrahima Fall" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-company">Société / Hôtel</Label>
                <Input id="lead-company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Ex. : Hôtel Terrou-Bi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-value">Valeur estimée (FCFA)</Label>
                <Input id="lead-value" type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="250000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Téléphone</Label>
                <Input id="lead-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+221 77 …" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QRTAGS">QRTags</SelectItem>
                    <SelectItem value="QRBAGS">QRBags</SelectItem>
                    <SelectItem value="RECOMMANDATION">Recommandation</SelectItem>
                    <SelectItem value="SITE_WEB">Site web</SelectItem>
                    <SelectItem value="AUTRE">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea id="lead-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
