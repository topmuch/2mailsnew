"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, NotebookPen, Pencil, Pin, PinOff, Plus, Search, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { formatRelativeFr } from "@/components/crm/crm-shared";
import type { BlogPost } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Blog note : notes riches partagées (titre, contenu, tags, couleurs) ─────

const COLOR_META: Record<string, { label: string; bar: string; chip: string; dot: string }> = {
  blue: { label: "Bleu", bar: "bg-[#1F3FBF]", chip: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300", dot: "bg-[#1F3FBF]" },
  green: { label: "Vert", bar: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-600" },
  amber: { label: "Ambre", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
  red: { label: "Rouge", bar: "bg-red-600", chip: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300", dot: "bg-red-600" },
  purple: { label: "Violet", bar: "bg-purple-600", chip: "bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-300", dot: "bg-purple-600" },
};
const COLOR_KEYS = Object.keys(COLOR_META);

interface NoteForm {
  title: string;
  content: string;
  tags: string;
  color: string;
  pinned: boolean;
}

const EMPTY_FORM: NoteForm = { title: "", content: "", tags: "", color: "blue", pinned: false };

export default function BlogNotesView() {
  const { toast } = useToast();
  const [notes, setNotes] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<NoteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BlogPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/blog-notes");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { notes: BlogPost[] };
      setNotes(json.notes);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les notes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Tous les tags distincts (comptés) pour les filtres rapides
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags.split(",").map((t) => t.trim()).filter(Boolean)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (tagFilter && !n.tags.split(",").map((t) => t.trim()).includes(tagFilter)) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q) ||
        (n.author ?? "").toLowerCase().includes(q)
      );
    });
  }, [notes, search, tagFilter]);

  const pinnedCount = notes.filter((n) => n.pinned).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (note: BlogPost) => {
    setEditing(note);
    setForm({ title: note.title, content: note.content, tags: note.tags, color: note.color, pinned: note.pinned });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "Le titre est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/blog-notes/${editing.id}` : "/api/blog-notes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: editing ? "Note modifiée" : "Note publiée" });
      setDialogOpen(false);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement impossible",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (note: BlogPost) => {
    try {
      const res = await authFetch(`/api/blog-notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast({ title: "Erreur", description: "Épinglage impossible", variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await authFetch(`/api/blog-notes/${deleting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Note supprimée" });
      setDeleting(null);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Suppression impossible",
        variant: "destructive",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1F3FBF] text-white shadow-md" aria-hidden>
              <NotebookPen className="h-5 w-5" />
            </span>
            Blog note
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Notes partagées de l&apos;équipe — idées, mémos techniques, informations importantes.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0] shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Nouvelle note
        </Button>
      </div>

      {/* Recherche + filtres tags */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans les notes (titre, contenu, tag, auteur)…"
            className="pl-9"
            aria-label="Rechercher une note"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  tagFilter === tag
                    ? "border-[#1F3FBF] bg-[#1F3FBF] text-white"
                    : "border-border bg-muted/50 text-muted-foreground hover:border-[#1F3FBF]/50 hover:text-foreground",
                )}
                aria-pressed={tagFilter === tag}
              >
                {tag} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compteur */}
      {!loading && notes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} note{filtered.length > 1 ? "s" : ""}
          {pinnedCount > 0 && ` • ${pinnedCount} épinglée${pinnedCount > 1 ? "s" : ""}`}
          {tagFilter && ` • filtre : « ${tagFilter} »`}
        </p>
      )}

      {/* Liste des notes */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-1.5 w-full bg-muted" />
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <NotebookPen className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="font-semibold">Aucune note pour le moment</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Créez votre première note pour partager une idée, un mémo ou une information importante avec l&apos;équipe.
          </p>
          <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
            <Plus className="h-4 w-4" aria-hidden /> Créer une note
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="font-semibold">Aucun résultat</p>
          <p className="text-sm text-muted-foreground">Aucune note ne correspond à votre recherche.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setTagFilter(null);
            }}
          >
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((note) => {
            const meta = COLOR_META[note.color] ?? COLOR_META.blue;
            const tags = note.tags.split(",").map((t) => t.trim()).filter(Boolean);
            return (
              <Card
                key={note.id}
                className="group relative overflow-hidden pt-0 transition-shadow hover:shadow-md"
              >
                <div className={cn("h-1.5 w-full", meta.bar)} aria-hidden />
                <CardContent className="flex h-full flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(note)}
                      className="text-left font-semibold leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-[#1F3FBF]"
                      title="Ouvrir la note"
                    >
                      {note.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(note)}
                      className={cn(
                        "mt-0.5 shrink-0 rounded-md p-1 transition-colors",
                        note.pinned ? "text-amber-500" : "text-muted-foreground/40 hover:text-foreground",
                      )}
                      title={note.pinned ? "Désépingler" : "Épingler en haut"}
                      aria-label={note.pinned ? "Désépingler la note" : "Épingler la note"}
                    >
                      {note.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                    </button>
                  </div>
                  {note.content && (
                    <p className="whitespace-pre-line text-sm text-muted-foreground line-clamp-5">
                      {note.content}
                    </p>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="outline" className={cn("text-[10px] font-medium", meta.chip)}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {note.author ?? "Anonyme"} • {formatRelativeFr(note.updatedAt)}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(note)}
                        className="rounded-md p-1.5 hover:bg-muted"
                        title="Modifier"
                        aria-label={`Modifier la note ${note.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(note)}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                        title="Supprimer"
                        aria-label={`Supprimer la note ${note.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Éditeur de note */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la note" : "Nouvelle note"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez le contenu de la note — les changements sont visibles par toute l'équipe."
                : "Partagez une idée, un mémo ou une information importante avec l'équipe."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="note-title">Titre *</Label>
              <Input
                id="note-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex. Procédure d'installation des compteurs"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-content">Contenu</Label>
              <Textarea
                id="note-content"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Écrivez votre note… (retours à la ligne conservés)"
                rows={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-tags">Tags (séparés par des virgules)</Label>
              <Input
                id="note-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="Ex. technique, astuce, urgent"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <div className="flex items-center gap-2" role="radiogroup" aria-label="Couleur de la note">
                {COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={form.color === key}
                    aria-label={`Couleur ${COLOR_META[key].label}`}
                    onClick={() => setForm({ ...form, color: key })}
                    className={cn(
                      "h-7 w-7 rounded-full transition-transform",
                      COLOR_META[key].dot,
                      form.color === key ? "scale-110 ring-2 ring-offset-2 ring-foreground/50 dark:ring-offset-background" : "opacity-70 hover:opacity-100",
                    )}
                  />
                ))}
                <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={form.pinned}
                    onCheckedChange={(v) => setForm({ ...form, pinned: v === true })}
                    aria-label="Épingler cette note en haut"
                  />
                  <Pin className="h-3.5 w-3.5" aria-hidden /> Épingler
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !form.title.trim()} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <NotebookPen className="h-4 w-4" aria-hidden />}
              {editing ? "Enregistrer" : "Publier la note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette note ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleting?.title} » sera définitivement supprimée. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
