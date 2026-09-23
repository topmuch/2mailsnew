"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
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
import { formatRelativeFr } from "@/components/crm/crm-shared";
import type { CrmTask } from "@/lib/types";

// ─── Tâches CRM (à faire / en cours / terminées) ─────────────────────────────

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  HIGH: { label: "Haute", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
  MEDIUM: { label: "Moyenne", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  LOW: { label: "Basse", className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" },
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
};

interface TaskForm {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  status: string;
}

const EMPTY_FORM: TaskForm = { title: "", description: "", dueDate: "", priority: "MEDIUM", status: "TODO" };

interface TasksResponse {
  tasks: CrmTask[];
  counts: { todo: number; inProgress: number; done: number; late: number };
}

export default function CrmTasksView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<TasksResponse>({ tasks: [], counts: { todo: 0, inProgress: 0, done: 0, late: 0 } });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmTask | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/tasks");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les tâches", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (statusFilter === "ALL" ? data.tasks : data.tasks.filter((t) => t.status === statusFilter)),
    [data.tasks, statusFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (t: CrmTask) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? "",
      dueDate: t.dueDate ? t.dueDate.slice(0, 10) : "",
      priority: t.priority,
      status: t.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "Le titre est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/crm/tasks/${editing.id}` : "/api/crm/tasks", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dueDate: form.dueDate || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Tâche mise à jour" : "Tâche créée" });
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (t: CrmTask, status: string) => {
    try {
      const res = await authFetch(`/api/crm/tasks/${t.id}`, {
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

  const remove = async (t: CrmTask) => {
    if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return;
    try {
      const res = await authFetch(`/api/crm/tasks/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Tâche supprimée" });
      load();
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible (admin requis)", variant: "destructive" });
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const isLate = (t: CrmTask) => t.status !== "DONE" && t.dueDate !== null && t.dueDate.slice(0, 10) < todayStr;

  const chips = [
    { label: "À faire", value: data.counts.todo, cls: "text-sidebar" },
    { label: "En cours", value: data.counts.inProgress, cls: "text-amber-600" },
    { label: "En retard", value: data.counts.late, cls: "text-destructive" },
    { label: "Terminées", value: data.counts.done, cls: "text-emerald-600" },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ListChecks className="h-6 w-6 text-gold" /> Tâches
          </h1>
          <p className="text-sm text-muted-foreground">Les tâches en retard apparaissent dans le briefing du matin.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nouvelle tâche
        </Button>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {chips.map((c) => (
          <Card key={c.label} className="border-l-4 border-l-gold">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-bold ${c.cls}`}>{loading ? "—" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtre */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" aria-label="Filtrer par statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            <SelectItem value="TODO">À faire</SelectItem>
            <SelectItem value="IN_PROGRESS">En cours</SelectItem>
            <SelectItem value="DONE">Terminées</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} tâche(s)</span>
      </div>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Aucune tâche — cliquez sur « Nouvelle tâche » pour commencer.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tâche</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="font-medium leading-tight">{t.title}</p>
                        {t.description && <p className="line-clamp-1 text-xs text-muted-foreground">{t.description}</p>}
                      </TableCell>
                      <TableCell>
                        {t.dueDate ? (
                          <span className={`inline-flex items-center gap-1 text-xs ${isLate(t) ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                            <CalendarDays className="h-3.5 w-3.5" />
                            {new Date(t.dueDate).toLocaleDateString("fr-FR")}
                            {isLate(t) && " · en retard"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_META[t.priority]?.className}>
                          {PRIORITY_META[t.priority]?.label ?? t.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={t.status} onValueChange={(v) => changeStatus(t, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs" aria-label={`Statut de ${t.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABEL).map(([v, label]) => (
                              <SelectItem key={v} value={v}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Modifier ${t.title}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(t)} aria-label={`Supprimer ${t.title}`}>
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
            <DialogTitle>{editing ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
            <DialogDescription>
              {editing ? "Mettez à jour les informations de la tâche." : "Ajoutez une tâche pour la suivre dans le CRM et le briefing du matin."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Titre *</Label>
              <Input id="task-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex. : Relancer l'hôtel Terrou-Bi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea id="task-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Échéance</Label>
                <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Basse</SelectItem>
                    <SelectItem value="MEDIUM">Moyenne</SelectItem>
                    <SelectItem value="HIGH">Haute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">À faire</SelectItem>
                    <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                    <SelectItem value="DONE">Terminée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
