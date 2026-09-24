"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  FAVORITE_CATEGORIES,
  FAVORITE_CATEGORY_LABELS,
  domainColor,
  urlDomain,
} from "@/lib/favorites-utils";
import type { Favorite } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Favoris : sauvegarde et organisation des liens internet utiles ──────────

interface FavForm {
  title: string;
  url: string;
  description: string;
  category: string;
  pinned: boolean;
}

const EMPTY_FORM: FavForm = { title: "", url: "", description: "", category: "GENERAL", pinned: false };

/** Favicon avec repli local (initiale colorée) si le service externe échoue. */
function Favicon({ url, size = 36 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = urlDomain(url);
  const letter = domain.replace(/^(www\.)?/, "").charAt(0).toUpperCase() || "•";
  if (failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg font-bold text-white"
        style={{ height: size, width: size, backgroundColor: domainColor(domain), fontSize: size * 0.45 }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size * 2}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-lg border bg-white object-contain p-0.5"
      onError={() => setFailed(true)}
      aria-hidden
    />
  );
}

export default function FavoritesView() {
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Favorite | null>(null);
  const [form, setForm] = useState<FavForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Favorite | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/favorites");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { favorites: Favorite[] };
      setFavorites(json.favorites);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les favoris", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fav of favorites) {
      counts.set(fav.category, (counts.get(fav.category) ?? 0) + 1);
    }
    return counts;
  }, [favorites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return favorites.filter((f) => {
      if (categoryFilter !== "ALL" && f.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.url.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [favorites, search, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (fav: Favorite) => {
    setEditing(fav);
    setForm({
      title: fav.title,
      url: fav.url,
      description: fav.description ?? "",
      category: fav.category,
      pinned: fav.pinned,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "Le titre est requis", variant: "destructive" });
      return;
    }
    if (!form.url.trim()) {
      toast({ title: "Le lien est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(editing ? `/api/favorites/${editing.id}` : "/api/favorites", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: editing ? "Favori modifié" : "Favori ajouté" });
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

  const togglePin = async (fav: Favorite) => {
    try {
      const res = await authFetch(`/api/favorites/${fav.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !fav.pinned }),
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
      const res = await authFetch(`/api/favorites/${deleting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Favori supprimé" });
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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md" aria-hidden>
              <Star className="h-5 w-5 fill-current" />
            </span>
            Favoris
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sauvegardez vos liens internet utiles — fournisseurs, outils, sites clients — et retrouvez-les en un clic.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0] shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Ajouter un lien
        </Button>
      </div>

      {/* Recherche + filtres catégories */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un favori (titre, adresse, description)…"
            className="pl-9"
            aria-label="Rechercher un favori"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              categoryFilter === "ALL"
                ? "border-[#1F3FBF] bg-[#1F3FBF] text-white"
                : "border-border bg-muted/50 text-muted-foreground hover:border-[#1F3FBF]/50 hover:text-foreground",
            )}
            aria-pressed={categoryFilter === "ALL"}
          >
            Tous <span className="opacity-60">({favorites.length})</span>
          </button>
          {FAVORITE_CATEGORIES.filter((c) => categoryCounts.get(c)).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === cat ? "ALL" : cat)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                categoryFilter === cat
                  ? "border-[#1F3FBF] bg-[#1F3FBF] text-white"
                  : "border-border bg-muted/50 text-muted-foreground hover:border-[#1F3FBF]/50 hover:text-foreground",
              )}
              aria-pressed={categoryFilter === cat}
            >
              {FAVORITE_CATEGORY_LABELS[cat]} <span className="opacity-60">({categoryCounts.get(cat)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Liste des favoris */}
      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Star className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="font-semibold">Aucun favori pour le moment</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ajoutez vos premiers liens : site d&apos;un fournisseur, outil en ligne, page de suivi colis, portail client…
          </p>
          <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
            <Plus className="h-4 w-4" aria-hidden /> Ajouter un lien
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="font-semibold">Aucun résultat</p>
          <p className="text-sm text-muted-foreground">Aucun favori ne correspond à votre recherche.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCategoryFilter("ALL");
            }}
          >
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((fav) => (
            <Card key={fav.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <Favicon url={fav.url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <a
                      href={fav.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-[#1F3FBF]"
                      title={fav.title}
                    >
                      {fav.title}
                    </a>
                    {fav.pinned && (
                      <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-label="Favori épinglé" />
                    )}
                  </div>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Globe className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{urlDomain(fav.url)}</span>
                  </p>
                  {fav.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{fav.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {FAVORITE_CATEGORY_LABELS[fav.category] ?? fav.category}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground/70">Ajouté par {fav.author ?? "Anonyme"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex"
                    onClick={() => window.open(fav.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ouvrir
                  </Button>
                  <button
                    type="button"
                    onClick={() => window.open(fav.url, "_blank", "noopener,noreferrer")}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted sm:hidden"
                    aria-label={`Ouvrir ${fav.title}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(fav)}
                    className={cn(
                      "rounded-md p-2 transition-colors",
                      fav.pinned ? "text-amber-500" : "text-muted-foreground/50 hover:text-foreground",
                    )}
                    title={fav.pinned ? "Désépingler" : "Épingler en haut"}
                    aria-label={fav.pinned ? "Désépingler le favori" : "Épingler le favori"}
                  >
                    {fav.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(fav)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                    title="Modifier"
                    aria-label={`Modifier le favori ${fav.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(fav)}
                    className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                    title="Supprimer"
                    aria-label={`Supprimer le favori ${fav.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Éditeur de favori */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le favori" : "Nouveau favori"}</DialogTitle>
            <DialogDescription>
              Sauvegardez un lien internet pour le retrouver rapidement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="fav-url">Adresse du lien *</Label>
              <Input
                id="fav-url"
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="Ex. qrtags.pro ou https://qrbags.com/suivi"
              />
              <p className="text-[11px] text-muted-foreground">
                Le « https:// » est ajouté automatiquement si absent.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fav-title">Titre *</Label>
              <Input
                id="fav-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex. Suivi des colis QRBags"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fav-desc">Description (facultatif)</Label>
              <Textarea
                id="fav-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="À quoi sert ce lien ? Identifiants à utiliser ?"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fav-cat">Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="fav-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAVORITE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {FAVORITE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm pb-1">
                <Checkbox
                  checked={form.pinned}
                  onCheckedChange={(v) => setForm({ ...form, pinned: v === true })}
                  aria-label="Épingler ce favori en haut"
                />
                <Pin className="h-3.5 w-3.5" aria-hidden /> Épingler
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.url.trim()} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Star className="h-4 w-4" aria-hidden />}
              {editing ? "Enregistrer" : "Ajouter le favori"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce favori ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleting?.title} » ({deleting ? urlDomain(deleting.url) : ""}) sera définitivement supprimé.
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
