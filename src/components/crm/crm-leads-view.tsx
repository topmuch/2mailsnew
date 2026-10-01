"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/lib/types";

// ─── Leads : pipeline commercial (nouveau → gagné/perdu) ─────────────────────
// Version liste simple (Task 67, retour utilisateur) : UNE seule vue liste,
// filtres pilules par étape, résumé sur une ligne sous le titre, fiches
// lisibles (nom · société · valeur · statut modifiable · actions).
// Fonctions conservées : création/édition, changement de statut, recherche,
// suppression admin, valeur estimée, temps relatif.
// (La vue kanban de la Task 63 est retirée à la demande de l'utilisateur —
// reste disponible dans l'historique git au commit Task 63.)

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
  VERIFSCAN: "VerifScan",
  RECOMMANDATION: "Recommandation",
  SITE_WEB: "Site web",
  AUTRE: "Autre",
};

const fmtFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

/** Temps relatif depuis la dernière mise à jour (« aujourd'hui », « il y a 3 j »…). */
const relTime = (iso: string) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 30)} mois`;
};

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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
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
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les leads", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const wonCount = counts.WON ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.name, l.company, l.email, l.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [leads, query, statusFilter]);

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

  // ─── Filtres pilules : Tous + une par étape, avec compteurs ───
  const FILTERS = [
    { value: "ALL", label: "Tous", dot: "", count: leads.length },
    ...STAGES.map((s) => ({ ...s, count: counts[s.value] ?? 0 })),
  ];

  return (
    <div className="space-y-5">
      {/* ─── En-tête : titre, résumé sur une ligne, recherche + action ─── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Briefcase className="h-6 w-6 text-gold" aria-hidden /> Leads
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {loading
              ? "Chargement…"
              : `${leads.length} lead${leads.length > 1 ? "s" : ""} · ${fmtFcfa(pipelineValue)} en pipeline · ${wonCount} gagné${wonCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Rechercher un lead…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" aria-label="Rechercher un lead" />
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" /> Nouveau lead
          </Button>
        </div>
      </div>

      {/* ─── Filtres pilules (défilement horizontal sur mobile) ─── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par étape">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <Button
              key={f.value}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setStatusFilter(f.value)}
              aria-pressed={active}
            >
              {f.dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", f.dot)} aria-hidden />}
              {f.label}
              <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{loading ? "…" : f.count}</span>
            </Button>
          );
        })}
      </div>

      {/* ─── Contenu ─── */}
      {loading ? (
        <Card className="divide-y p-0 shadow-sm">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-56 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </Card>
      ) : leads.length === 0 ? (
        /* Pipeline vide : invitation */
        <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15">
            <Briefcase className="h-6 w-6 text-gold" aria-hidden />
          </div>
          <p className="font-semibold">Aucun lead pour le moment</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Ajoutez votre premier prospect — QRTags, QRBags, recommandation… — et suivez-le jusqu&apos;à la signature.
          </p>
          <Button onClick={openCreate} className="mt-2">
            <Plus className="mr-2 h-4 w-4" /> Nouveau lead
          </Button>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <Card className="p-0 shadow-sm">
            <p className="sr-only">Liste des leads du pipeline commercial</p>
            {filtered.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">Aucun lead ne correspond à votre recherche.</p>
            ) : (
              <ul className="divide-y">
                {filtered.map((l) => {
                  const stage = STAGES.find((s) => s.value === l.status);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", stage?.dot ?? "bg-muted-foreground")} aria-hidden />
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {l.name}
                          {l.company && <span className="font-normal text-muted-foreground"> · {l.company}</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[l.source !== "AUTRE" ? SOURCE_LABEL[l.source] : "", l.email ?? l.phone ?? "", relTime(l.updatedAt)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <p className={cn("ml-auto shrink-0 text-sm font-bold tabular-nums", l.value > 0 ? "text-gold" : "text-muted-foreground/50")}>
                        {l.value > 0 ? fmtFcfa(l.value) : "—"}
                      </p>
                      <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                        <SelectTrigger className="h-8 w-[132px] shrink-0 text-xs" aria-label={`Statut de ${l.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex shrink-0 gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)} aria-label={`Modifier ${l.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(l)} aria-label={`Supprimer ${l.name}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </motion.div>
      )}

      {/* ─── Dialog création / édition (une colonne, lisible) ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le lead" : "Nouveau lead"}</DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations du prospect." : "Ajoutez un prospect au pipeline commercial."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nom du contact *</Label>
              <Input id="lead-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. : Ibrahima Fall" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-company">Société / Hôtel</Label>
              <Input id="lead-company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Ex. : Hôtel Terrou-Bi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-value">Valeur estimée (FCFA)</Label>
              <Input id="lead-value" type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="250000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">E-mail</Label>
              <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">Téléphone</Label>
              <Input id="lead-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+221 77 …" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QRTAGS">QRTags</SelectItem>
                    <SelectItem value="QRBAGS">QRBags</SelectItem>
                    <SelectItem value="VERIFSCAN">VerifScan</SelectItem>
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
