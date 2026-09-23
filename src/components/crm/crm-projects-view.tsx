"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { CrmProject, CrmProjectClient } from "@/lib/types";

// ─── Projets : dossiers clients (déploiements, packs, chantiers QR) ──────────

const STATUS_META: Record<string, { label: string; className: string }> = {
  PLANNING: { label: "Planifié", className: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700" },
  IN_PROGRESS: { label: "En cours", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  ON_HOLD: { label: "En pause", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  DONE: { label: "Terminé", className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900" },
  CANCELLED: { label: "Annulé", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
};

const fmtFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

interface ProjectForm {
  name: string;
  description: string;
  clientId: string;
  status: string;
  budget: string;
  startDate: string;
  endDate: string;
  progress: number;
}

const EMPTY_FORM: ProjectForm = { name: "", description: "", clientId: "", status: "PLANNING", budget: "", startDate: "", endDate: "", progress: 0 };

interface ProjectsResponse {
  projects: CrmProject[];
  counts: Record<string, number>;
}

export default function CrmProjectsView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<ProjectsResponse>({ projects: [], counts: {} });
  const [clients, setClients] = useState<CrmProjectClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmProject | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        authFetch("/api/crm/projects"),
        authFetch("/api/crm/clients"),
      ]);
      if (!pRes.ok) throw new Error();
      const pData = await pRes.json();
      setData({ projects: pData.projects ?? [], counts: pData.counts ?? {} });
      if (cRes.ok) {
        const cData = await cRes.json();
        setClients(cData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les projets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: CrmProject) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      clientId: p.clientId ?? "",
      status: p.status,
      budget: p.budget ? String(p.budget) : "",
      startDate: p.startDate ? p.startDate.slice(0, 10) : "",
      endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      progress: p.progress,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Le nom du projet est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/crm/projects/${editing.id}` : "/api/crm/projects", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          clientId: form.clientId || null,
          budget: form.budget ? Number(form.budget) : 0,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Projet mis à jour" : "Projet créé" });
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (p: CrmProject, status: string) => {
    try {
      const res = await authFetch(`/api/crm/projects/${p.id}`, {
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

  const remove = async (p: CrmProject) => {
    if (!confirm(`Supprimer le projet « ${p.name} » ?`)) return;
    try {
      const res = await authFetch(`/api/crm/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Projet supprimé" });
      load();
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible (admin requis)", variant: "destructive" });
    }
  };

  const chips = [
    { label: "Planifiés", value: data.counts.PLANNING ?? 0 },
    { label: "En cours", value: data.counts.IN_PROGRESS ?? 0 },
    { label: "En pause", value: data.counts.ON_HOLD ?? 0 },
    { label: "Terminés", value: data.counts.DONE ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FolderKanban className="h-6 w-6 text-gold" /> Projets
          </h1>
          <p className="text-sm text-muted-foreground">Dossiers clients : déploiements de tags, packs hôtels, partenariats transport.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nouveau projet
        </Button>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {chips.map((c) => (
          <Card key={c.label} className="border-l-4 border-l-gold">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold">{loading ? "—" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : data.projects.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Aucun projet — cliquez sur « Nouveau projet » pour commencer.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projet</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Avancement</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium leading-tight">{p.name}</p>
                        {p.description && <p className="line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{p.client?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm font-medium">{p.budget > 0 ? fmtFcfa(p.budget) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-gold" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{p.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => changeStatus(p, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs" aria-label={`Statut de ${p.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_META).map(([v, m]) => (
                              <SelectItem key={v} value={v}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={`Modifier ${p.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(p)} aria-label={`Supprimer ${p.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations du projet." : "Créez un dossier pour suivre un déploiement client."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Nom du projet *</Label>
              <Input id="proj-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. : Pack 500 bracelets — Hôtel Terrou-Bi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea id="proj-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client CRM</Label>
                <Select value={form.clientId || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "NONE" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Aucun client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-budget">Budget (FCFA)</Label>
                <Input id="proj-budget" type="number" min="0" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-start">Début</Label>
                <Input id="proj-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-end">Fin prévue</Label>
                <Input id="proj-end" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-progress">Avancement (%)</Label>
                <Input id="proj-progress" type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META).map(([v, m]) => (
                    <SelectItem key={v} value={v}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
