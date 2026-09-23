"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ClipboardList, Loader2, Plus, StickyNote, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";

// ─── Bouton « + » flottant : ajout rapide Client / Tâche / RDV / Note ────────

type QuickType = "CLIENT" | "TASK" | "EVENT" | "NOTE" | null;

interface NoteItem {
  id: string;
  content: string;
  author: string | null;
  createdAt: string;
}

const OPTIONS: { type: Exclude<QuickType, null>; label: string; icon: React.ComponentType<{ className?: string }>; ring: string }[] = [
  { type: "CLIENT", label: "Client", icon: UserPlus, ring: "ring-sky-300" },
  { type: "TASK", label: "Tâche", icon: ClipboardList, ring: "ring-emerald-300" },
  { type: "EVENT", label: "RDV", icon: CalendarDays, ring: "ring-violet-300" },
  { type: "NOTE", label: "Note", icon: StickyNote, ring: "ring-amber-300" },
];

export function QuickAddButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QuickType>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const loadNotes = useCallback(async () => {
    try {
      const res = await authFetch("/api/quick-add");
      const json = await res.json();
      if (res.ok) setNotes(json.notes ?? []);
    } catch {
      /* silencieux */
    }
  }, []);

  useEffect(() => {
    if (open) {
      setType(null);
      setForm({});
      loadNotes();
    }
  }, [open, loadNotes]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: json.message ?? "Ajouté avec succès" });
      if (type === "NOTE") {
        setForm({});
        loadNotes();
      } else {
        setOpen(false);
      }
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const res = await authFetch(`/api/quick-add?id=${id}`, { method: "DELETE" });
      if (res.ok) setNotes((n) => n.filter((x) => x.id !== id));
    } catch {
      /* silencieux */
    }
  };

  const inputCls = "w-full";
  const fieldSpacing = "space-y-1.5";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ajout rapide"
        title="Ajout rapide (client, tâche, RDV, note)"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#1f3fbf] text-white shadow-xl transition-transform hover:scale-105 hover:bg-[#3a5ce8] active:scale-95"
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Plus className="h-7 w-7" aria-hidden />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#1f3fbf]" aria-hidden /> Ajout rapide
            </DialogTitle>
            <DialogDescription>
              Créez un client, une tâche, un rendez-vous ou une note sans quitter la page.
            </DialogDescription>
          </DialogHeader>

          {!type ? (
            <div className="grid grid-cols-2 gap-2">
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setType(opt.type)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition hover:bg-muted/60",
                      "focus-visible:outline-none focus-visible:ring-2",
                      opt.ring,
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {OPTIONS.find((o) => o.type === type)?.label}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setType(null)}>
                  Changer
                </Button>
              </div>

              {type === "CLIENT" && (
                <div className="space-y-2.5">
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-name">Nom complet *</Label>
                    <Input id="qa-name" required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Nom du client" />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-phone">Téléphone</Label>
                    <Input id="qa-phone" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+221 77 000 00 00" />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-email">Email</Label>
                    <Input id="qa-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="client@exemple.com" />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-company">Entreprise / adresse (optionnel)</Label>
                    <Input id="qa-company" value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
                  </div>
                </div>
              )}

              {type === "TASK" && (
                <div className="space-y-2.5">
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-title">Titre de la tâche *</Label>
                    <Input id="qa-title" required value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Appeler le fournisseur…" />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-desc">Description</Label>
                    <Textarea id="qa-desc" rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-due">Échéance</Label>
                    <Input id="qa-due" type="datetime-local" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-prio">Priorité</Label>
                    <select
                      id="qa-prio"
                      value={form.priority ?? "MEDIUM"}
                      onChange={(e) => set("priority", e.target.value)}
                      className={cn(inputCls, "rounded-md border bg-background px-3 py-2 text-sm")}
                    >
                      <option value="LOW">Basse</option>
                      <option value="MEDIUM">Moyenne</option>
                      <option value="HIGH">Haute</option>
                    </select>
                  </div>
                </div>
              )}

              {type === "EVENT" && (
                <div className="space-y-2.5">
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-ev-title">Titre du RDV *</Label>
                    <Input id="qa-ev-title" required value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Rendez-vous client…" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={fieldSpacing}>
                      <Label htmlFor="qa-ev-date">Date *</Label>
                      <Input id="qa-ev-date" type="date" required value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} />
                    </div>
                    <div className={fieldSpacing}>
                      <Label htmlFor="qa-ev-time">Heure</Label>
                      <Input id="qa-ev-time" type="time" value={form.startTime ?? ""} onChange={(e) => set("startTime", e.target.value)} />
                    </div>
                  </div>
                  <div className={fieldSpacing}>
                    <Label htmlFor="qa-ev-place">Lieu / contact</Label>
                    <Input id="qa-ev-place" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Bureau, hôtel… / +221…" />
                  </div>
                </div>
              )}

              {type === "NOTE" && (
                <div className={fieldSpacing}>
                  <Label htmlFor="qa-note">Votre note *</Label>
                  <Textarea id="qa-note" required rows={4} value={form.content ?? ""} onChange={(e) => set("content", e.target.value)} placeholder="Idée, rappel, information…" />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" className="flex-1 bg-[#1f3fbf] font-bold text-white hover:bg-[#3a5ce8]" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  Ajouter
                </Button>
              </div>

              {type === "NOTE" && notes.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Notes récentes
                  </p>
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {notes.map((n) => (
                      <li key={n.id} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
                        <p className="min-w-0 flex-1 whitespace-pre-line">{n.content}</p>
                        <button
                          type="button"
                          onClick={() => deleteNote(n.id)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Supprimer la note"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
