"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Inbox, LayoutGrid, List, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/lib/types";

// ─── Leads : pipeline commercial (nouveau → gagné/perdu) ─────────────────────
// Version épurée (Task 63) : en-tête simple, une ligne de chiffres clés,
// kanban lisible (point coloré par étape), bascule Kanban ⇄ Liste.
// Fonctions conservées : création/édition, changement de statut, recherche,
// suppression admin, valeur estimée, temps relatif.

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

/** Format compact pour les cartes et entêtes de colonnes (1 200 000 F → 1,2 M F). */
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M F`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k F`;
  return fmtFcfa(n);
};

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

type ViewMode = "kanban" | "list";

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
  const [view, setView] = useState<ViewMode>("kanban");

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

  // ─── Indicateurs dérivés ───
  const wonCount = counts.WON ?? 0;
  const lostCount = counts.LOST ?? 0;
  const activeCount = leads.length - wonCount - lostCount;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;
  const proposalCount = counts.PROPOSAL ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) =>
      !q ? true : [l.name, l.company, l.email, l.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [leads, query]);

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

  // ─── Chiffres clés (une seule ligne, 4 colonnes) ───
  const STATS = [
    { label: "En pipeline", value: fmtFcfa(pipelineValue), sub: `${activeCount} lead${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}`, dot: "bg-gold" },
    { label: "Gagné", value: fmtFcfa(wonValue), sub: `${wonCount} deal${wonCount > 1 ? "s" : ""} signé${wonCount > 1 ? "s" : ""}`, dot: "bg-emerald-500" },
    { label: "Devis envoyés", value: String(proposalCount), sub: "en attente de réponse", dot: "bg-purple-500" },
    { label: "Taux de conversion", value: winRate == null ? "—" : `${winRate} %`, sub: `${wonCount} gagnés · ${lostCount} perdus`, dot: "bg-teal-500" },
  ];

  return (
    <div className="space-y-6">
      {/* ─── En-tête simple ─── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Briefcase className="h-6 w-6 text-gold" aria-hidden /> Leads
          </h1>
          <p className="text-sm text-muted-foreground">Pipeline commercial — suivez vos prospects jusqu&apos;à la signature.</p>
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

      {/* ─── Chiffres clés : une carte, 4 colonnes, séparateurs fins ─── */}
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="grid grid-cols-2 gap-px bg-border/60 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-card p-4 md:p-5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
                {s.label}
              </p>
              <p className="mt-1.5 truncate text-xl font-bold tabular-nums md:text-2xl">{loading ? "—" : s.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{loading ? "" : s.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Barre d'outils : comptage + bascule de vue ─── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {loading ? "…" : `${filtered.length} lead${filtered.length > 1 ? "s" : ""}${query.trim() ? ` trouvé${filtered.length > 1 ? "s" : ""}` : ""}`}
        </p>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Mode d'affichage">
          <Button size="sm" variant={view === "kanban" ? "default" : "ghost"} className="h-8 gap-1.5 px-3 text-xs" onClick={() => setView("kanban")} role="tab" aria-selected={view === "kanban"}>
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Kanban
          </Button>
          <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="h-8 gap-1.5 px-3 text-xs" onClick={() => setView("list")} role="tab" aria-selected={view === "list"}>
            <List className="h-3.5 w-3.5" aria-hidden /> Liste
          </Button>
        </div>
      </div>

      {/* ─── Pipeline vide : invitation ─── */}
      {!loading && leads.length === 0 && (
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
      )}

      {/* ─── Contenu : kanban ou liste ─── */}
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
        <AnimatePresence mode="wait">
          {view === "kanban" ? (
            <motion.div
              key="kanban"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
            >
              {STAGES.map((stage) => {
                const stageLeads = filtered.filter((l) => l.status === stage.value);
                const stageValue = stageLeads.reduce((s, l) => s + (l.value ?? 0), 0);
                return (
                  <div key={stage.value} className="flex min-w-0 flex-col rounded-xl border bg-muted/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", stage.dot)} aria-hidden />
                        {stage.label}
                      </p>
                      <Badge variant="outline" className="text-[10px] tabular-nums">{stageLeads.length}</Badge>
                    </div>
                    <p className="px-3 pb-2 text-[11px] tabular-nums text-muted-foreground">{fmtCompact(stageValue)}</p>
                    <div className="max-h-[420px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-1.5">
                      {stageLeads.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 py-8 text-center">
                          <Inbox className="h-6 w-6 text-muted-foreground/40" aria-hidden />
                          <p className="text-xs text-muted-foreground">Vide</p>
                        </div>
                      ) : (
                        stageLeads.map((l) => (
                          <Card key={l.id} className="group border-border/60 p-3 shadow-none transition-shadow hover:shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold leading-tight">{l.name}</p>
                                {(l.company || l.source !== "AUTRE") && (
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {l.company}
                                    {l.company && l.source !== "AUTRE" ? " · " : ""}
                                    {l.source !== "AUTRE" ? SOURCE_LABEL[l.source] : ""}
                                  </p>
                                )}
                                {(l.email || l.phone) && (
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{l.email ?? l.phone}</p>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
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
                            <div className="mt-2 flex items-center justify-between gap-2">
                              {l.value > 0 ? (
                                <p className="text-sm font-bold tabular-nums text-gold">{fmtCompact(l.value)}</p>
                              ) : (
                                <span />
                              )}
                              <span className="text-[10px] text-muted-foreground">{relTime(l.updatedAt)}</span>
                            </div>
                            <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                              <SelectTrigger className="mt-2 h-7 w-full text-[11px]" aria-label={`Statut de ${l.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STAGES.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Card className="overflow-hidden p-0 shadow-sm">
                <div className="overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:h-1.5">
                  <table className="w-full min-w-[720px] text-sm">
                    <caption className="sr-only">Liste des leads du pipeline commercial</caption>
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-4 py-3 font-medium">Prospect</th>
                        <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                        <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                        <th scope="col" className="px-4 py-3 font-medium">Valeur</th>
                        <th scope="col" className="px-4 py-3 font-medium">Mise à jour</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Aucun lead ne correspond à votre recherche.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((l) => (
                          <tr key={l.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{l.name}</p>
                              {(l.company || l.source !== "AUTRE") && (
                                <p className="text-xs text-muted-foreground">
                                  {l.company}
                                  {l.company && l.source !== "AUTRE" ? " · " : ""}
                                  {l.source !== "AUTRE" ? SOURCE_LABEL[l.source] : ""}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {l.email && <p className="truncate text-xs">{l.email}</p>}
                              {l.phone && <p className="text-xs text-muted-foreground">{l.phone}</p>}
                              {!l.email && !l.phone && <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Statut de ${l.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 font-semibold tabular-nums">{l.value > 0 ? fmtFcfa(l.value) : "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{relTime(l.updatedAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)} aria-label={`Modifier ${l.name}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {isAdmin && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(l)} aria-label={`Supprimer ${l.name}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ─── Dialog création / édition ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le lead" : "Nouveau lead"}</DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations du prospect." : "Ajoutez un prospect au pipeline commercial."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
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
            <div className="space-y-1.5 sm:col-span-2">
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
