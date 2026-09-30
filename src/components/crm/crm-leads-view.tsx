"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Clock3,
  FileText,
  Inbox,
  LayoutGrid,
  List,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
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
// Refonte pro (Task 62) : bandeau héro, KPIs enrichis, entonnoir filtrant,
// kanban avec avatars + temps relatif, bascule Kanban ⇄ Liste.
// Toutes les fonctions d'origine sont conservées (CRUD, statut, recherche, admin).

const STAGES: { value: CrmLead["status"]; label: string; hex: string; icon: LucideIcon; chip: string }[] = [
  { value: "NEW", label: "Nouveau", hex: "#10B981", icon: Sparkles, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  { value: "CONTACTED", label: "Contacté", hex: "#F59E0B", icon: PhoneCall, chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  { value: "QUALIFIED", label: "Qualifié", hex: "#0284C7", icon: BadgeCheck, chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" },
  { value: "PROPOSAL", label: "Devis envoyé", hex: "#9333EA", icon: FileText, chip: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  { value: "WON", label: "Gagné", hex: "#16A34A", icon: Trophy, chip: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  { value: "LOST", label: "Perdu", hex: "#EF4444", icon: XCircle, chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
];

const SOURCE_LABEL: Record<string, string> = {
  QRTAGS: "QRTags",
  QRBAGS: "QRBags",
  RECOMMANDATION: "Recommandation",
  SITE_WEB: "Site web",
  AUTRE: "Autre",
};

const fmtFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

/** Format compact pour les entêtes de colonnes et les chips (1 200 000 F → 1,2 M F). */
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

/** Initiales pour l'avatar (2 premières lettres des 2 premiers mots). */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

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
  const [stageFilter, setStageFilter] = useState<string | null>(null);

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
  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;
  const proposalCount = counts.PROPOSAL ?? 0;
  const newCount = counts.NEW ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) =>
        !q
          ? true
          : [l.name, l.company, l.email, l.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      )
      .filter((l) => (stageFilter ? l.status === stageFilter : true));
  }, [leads, query, stageFilter]);

  const toggleStage = (v: string) => setStageFilter((cur) => (cur === v ? null : v));

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

  // ─── Cartes KPI ───
  const KPIS = [
    { label: "Valeur du pipeline", value: fmtFcfa(pipelineValue), sub: `${activeCount} lead${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}`, icon: TrendingUp, color: "#FFC918" },
    { label: "Gagné (cumul)", value: fmtFcfa(wonValue), sub: `${wonCount} deal${wonCount > 1 ? "s" : ""} signé${wonCount > 1 ? "s" : ""}`, icon: Trophy, color: "#059669" },
    { label: "Devis envoyés", value: String(proposalCount), sub: "en attente de réponse", icon: FileText, color: "#9333EA" },
    { label: "Taux de conversion", value: winRate == null ? "—" : `${winRate} %`, sub: `${wonCount} gagnés · ${lostCount} perdus`, icon: Target, color: "#17AFA5" },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Bandeau héro : identité marque navy & or ─── */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg md:p-8"
        style={{ background: "linear-gradient(135deg, #0b366b 0%, #14417f 48%, #0a2c58 100%)" }}
        aria-label="Pipeline commercial"
      >
        {/* halos décoratifs */}
        <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
              <Briefcase className="h-3.5 w-3.5" aria-hidden /> CRM · Pipeline commercial
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/70">
              Suivez vos prospects QRTags, QRBags et partenaires — de la première prise de contact jusqu&apos;à la signature.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: Users, label: `${leads.length} lead${leads.length > 1 ? "s" : ""}` },
                { icon: Sparkles, label: `${newCount} nouveau${newCount > 1 ? "x" : ""}` },
                { icon: FileText, label: `${proposalCount} devis` },
                { icon: Trophy, label: `${wonCount} gagné${wonCount > 1 ? "s" : ""}` },
              ].map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm"
                >
                  <c.icon className="h-3.5 w-3.5 text-gold" aria-hidden /> {c.label}
                </span>
              ))}
            </div>
          </div>
          <Button
            onClick={openCreate}
            size="lg"
            className="w-full shrink-0 font-semibold shadow-xl transition-transform hover:scale-[1.02] md:w-auto"
            style={{ background: "#FFC918", color: "#0a2c58" }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nouveau lead
          </Button>
        </div>
      </motion.section>

      {/* ─── Chiffres clés ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * i }}
          >
            <Card className="relative overflow-hidden border-l-4 p-4 shadow-sm" style={{ borderLeftColor: k.color }}>
              <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-full opacity-[0.07]" style={{ background: k.color }} aria-hidden />
              {loading ? (
                <div className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-28 animate-pulse rounded bg-muted/70" />
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                    <p className="mt-1 truncate text-2xl font-bold tabular-nums">{k.value}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{k.sub}</p>
                  </div>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${k.color}1A`, color: k.color }}
                    aria-hidden
                  >
                    <k.icon className="h-5 w-5" />
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ─── Entonnoir : répartition du pipeline (cliquable = filtre) ─── */}
      <Card className="p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-gold" aria-hidden /> Répartition du pipeline
            {stageFilter && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
                filtre actif
              </span>
            )}
          </p>
          {stageFilter && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStageFilter(null)}>
              Afficher tout
            </Button>
          )}
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="group" aria-label="Répartition des leads par étape">
          {!loading &&
            STAGES.map((s) => {
              const c = counts[s.value] ?? 0;
              if (c === 0 || leads.length === 0) return null;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleStage(s.value)}
                  title={`${s.label} : ${c}`}
                  aria-label={`Filtrer sur l'étape ${s.label} (${c} lead${c > 1 ? "s" : ""})`}
                  aria-pressed={stageFilter === s.value}
                  className={cn(
                    "h-full transition-all first:rounded-l-full last:rounded-r-full hover:opacity-80",
                    stageFilter && stageFilter !== s.value && "opacity-30",
                  )}
                  style={{ width: `${(c / leads.length) * 100}%`, background: s.hex }}
                />
              );
            })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => toggleStage(s.value)}
              aria-pressed={stageFilter === s.value}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                stageFilter === s.value
                  ? "border-gold bg-gold/10 font-semibold"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.hex }} aria-hidden />
              {s.label}
              <span className="tabular-nums">{loading ? "—" : counts[s.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* ─── Barre d'outils : recherche + bascule de vue ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un lead…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="hidden text-xs text-muted-foreground md:block" aria-live="polite">
            {loading ? "—" : `${filtered.length} lead${filtered.length > 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Mode d'affichage">
            <Button
              size="sm"
              variant={view === "kanban" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setView("kanban")}
              role="tab"
              aria-selected={view === "kanban"}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setView("list")}
              role="tab"
              aria-selected={view === "list"}
            >
              <List className="h-3.5 w-3.5" /> Liste
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Pipeline vide : invitation engageante ─── */}
      {!loading && leads.length === 0 && (
        <Card className="border-dashed p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15">
            <Briefcase className="h-7 w-7 text-gold" aria-hidden />
          </div>
          <p className="text-lg font-semibold">Votre pipeline est vide</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Ajoutez votre premier prospect — QRTags, QRBags, recommandation… — et suivez-le jusqu&apos;à la signature.
          </p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="mr-2 h-4 w-4" /> Créer mon premier lead
          </Button>
        </Card>
      )}

      {/* ─── Contenu principal : kanban ou liste ─── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div key="skeleton" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {STAGES.map((s) => (
              <div key={s.value} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : view === "kanban" ? (
          <motion.div
            key="kanban"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
          >
            {STAGES.map((stage) => {
              const StageIcon = stage.icon;
              const stageLeads = leads
                .filter((l) => l.status === stage.value)
                .filter((l) => {
                  const q = query.trim().toLowerCase();
                  return !q ? true : [l.name, l.company, l.email, l.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
                });
              const stageValue = stageLeads.reduce((s, l) => s + (l.value ?? 0), 0);
              const dimmed = stageFilter !== null && stageFilter !== stage.value;
              return (
                <div
                  key={stage.value}
                  className={cn(
                    "flex min-w-0 flex-col rounded-xl border border-t-4 bg-muted/30 transition-all duration-200",
                    dimmed && "opacity-35",
                    stageFilter === stage.value && "ring-2 ring-gold/60",
                  )}
                  style={{ borderTopColor: stage.hex }}
                >
                  <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <StageIcon className="h-4 w-4 shrink-0" style={{ color: stage.hex }} aria-hidden />
                      {stage.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleStage(stage.value)}
                      aria-label={`Filtrer sur l'étape ${stage.label}`}
                      title="Cliquer pour filtrer"
                      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                    >
                      <Badge variant="outline" className="text-[10px] tabular-nums">{stageLeads.length}</Badge>
                    </button>
                  </div>
                  <p className="px-3 pt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {fmtCompact(stageValue)}
                  </p>
                  <div className="max-h-[420px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-1.5">
                    {stageLeads.length === 0 ? (
                      <div className="flex flex-col items-center gap-1 py-8 text-center">
                        <Inbox className="h-6 w-6 text-muted-foreground/40" aria-hidden />
                        <p className="text-xs text-muted-foreground">Aucun lead</p>
                      </div>
                    ) : (
                      stageLeads.map((l) => (
                        <motion.div key={l.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                          <Card className="group p-3 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex items-start gap-2.5">
                              <div
                                className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", stage.chip)}
                                aria-hidden
                              >
                                {initials(l.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-1">
                                  <p className="truncate text-sm font-semibold leading-tight">{l.name}</p>
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
                                {l.company && (
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                    <Building2 className="h-3 w-3 shrink-0" aria-hidden /> {l.company}
                                  </p>
                                )}
                                {(l.email || l.phone) && (
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                    {l.email ? (
                                      <>
                                        <Mail className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{l.email}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Phone className="h-3 w-3 shrink-0" aria-hidden /> {l.phone}
                                      </>
                                    )}
                                  </p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {l.value > 0 && (
                                    <Badge variant="outline" className="border-gold/30 bg-gold/10 text-[10px] text-gold">
                                      {fmtCompact(l.value)}
                                    </Badge>
                                  )}
                                  {l.source !== "AUTRE" && <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[l.source]}</Badge>}
                                  {l.notes && (
                                    <span title={l.notes} aria-label="Ce lead a des notes">
                                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock3 className="h-3 w-3" aria-hidden /> {relTime(l.updatedAt)}
                              </span>
                              <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                                <SelectTrigger className="h-7 max-w-[132px] flex-1 text-[11px]" aria-label={`Statut de ${l.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </Card>
                        </motion.div>
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
                <table className="w-full min-w-[820px] text-sm">
                  <caption className="sr-only">Liste des leads du pipeline commercial</caption>
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Prospect</th>
                      <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                      <th scope="col" className="px-4 py-3 font-medium">Source</th>
                      <th scope="col" className="px-4 py-3 font-medium">Valeur</th>
                      <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                      <th scope="col" className="px-4 py-3 font-medium">Mise à jour</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          Aucun lead ne correspond à votre recherche.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((l) => {
                        const st = STAGES.find((s) => s.value === l.status);
                        return (
                          <tr key={l.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", st?.chip)}
                                  aria-hidden
                                >
                                  {initials(l.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{l.name}</p>
                                  {l.company && <p className="truncate text-xs text-muted-foreground">{l.company}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {l.email && <p className="flex items-center gap-1 truncate text-xs"><Mail className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /> {l.email}</p>}
                              {l.phone && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" aria-hidden /> {l.phone}</p>}
                              {!l.email && !l.phone && <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[l.source] ?? l.source}</Badge>
                            </td>
                            <td className="px-4 py-3 tabular-nums">{l.value > 0 ? fmtFcfa(l.value) : "—"}</td>
                            <td className="px-4 py-3">
                              <Select value={l.status} onValueChange={(v) => changeStatus(l, v)}>
                                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Statut de ${l.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      <span className="flex items-center gap-2">
                                        <s.icon className="h-3.5 w-3.5" style={{ color: s.hex }} aria-hidden /> {s.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
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
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Dialog création / édition ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15">
                <Briefcase className="h-4 w-4 text-gold" aria-hidden />
              </span>
              {editing ? "Modifier le lead" : "Nouveau lead"}
            </DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations du prospect." : "Ajoutez un prospect au pipeline commercial."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">Prospect</p>
              <div className="space-y-1.5">
                <Label htmlFor="lead-name">Nom du contact *</Label>
                <Input id="lead-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. : Ibrahima Fall" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-company">Société / Hôtel</Label>
                  <Input id="lead-company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Ex. : Hôtel Terrou-Bi" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-value">Valeur estimée (FCFA)</Label>
                  <Input id="lead-value" type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="250000" />
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">Contact</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">E-mail</Label>
                  <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Téléphone</Label>
                  <Input id="lead-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+221 77 …" />
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">Qualification</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </section>
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
