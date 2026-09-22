"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BellRing,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useFetch } from "@/hooks/use-fetch";
import { authFetch } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

type EventColor = CalendarEvent["color"];
type EventType = CalendarEvent["type"];

interface EventFormState {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm ou ""
  endTime: string; // HH:mm ou ""
  description: string;
  color: EventColor;
  type: EventType;
}

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

const TYPE_LABEL: Record<EventType, string> = {
  RDV: "Rendez-vous",
  TACHE: "Tâche",
  RAPPEL: "Rappel",
};

const COLOR_LABEL: Record<EventColor, string> = {
  green: "Vert",
  gold: "Or",
  orange: "Orange",
  red: "Rouge",
};

const COLOR_DOT: Record<EventColor, string> = {
  green: "bg-primary",
  gold: "bg-gold",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

const COLOR_BADGE: Record<EventColor, string> = {
  green: "border-primary/30 bg-primary/10 text-primary",
  gold: "border-gold/50 bg-gold-soft/50 text-gold",
  orange: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  red: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LIMIT = 3; // maximum d'événements affichés par cellule

const emptyForm: EventFormState = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  description: "",
  color: "green",
  type: "RDV",
};

// ─── Helpers de dates (clés AAAA-MM-JJ, formats FR) ─────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Clé AAAA-MM-JJ d'une date construite en UTC. */
function keyOfDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Clé AAAA-MM-JJ du jour courant (heure locale de l'utilisateur). */
function keyOfToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** Jour (AAAA-MM-JJ) d'un événement — la date ISO est stockée à midi UTC. */
function eventDay(ev: CalendarEvent): string {
  return ev.date.slice(0, 10);
}

const monthFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const longDateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatTimeRange(ev: CalendarEvent): string {
  if (ev.startTime && ev.endTime) return `${ev.startTime} – ${ev.endTime}`;
  if (ev.startTime) return ev.startTime;
  return "Toute la journée";
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function CalendarView() {
  const { toast } = useToast();
  const now = new Date();

  const [view, setView] = useState(() => ({
    y: now.getFullYear(),
    m: now.getMonth(), // 0-based
  }));
  const monthKey = `${view.y}-${pad2(view.m + 1)}`;
  const todayKey = keyOfToday();

  const { data, loading, refetch } = useFetch<{ events: CalendarEvent[] }>(
    `/api/events?month=${monthKey}`
  );

  // Événements du mois affiché, triés (date puis heure)
  const monthEvents = useMemo(() => {
    const list = data?.events ?? [];
    return [...list].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
    });
  }, [data]);

  // ── Panneau « À venir » (mois courant + 2 suivants, à partir d'aujourd'hui) ──
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [upcomingLoaded, setUpcomingLoaded] = useState(false);

  const loadUpcoming = useCallback(async () => {
    try {
      const n = new Date();
      const todayKey = keyOfToday();
      const requests = [0, 1, 2].map((add) => {
        const total = n.getUTCMonth() + add;
        const y = n.getUTCFullYear() + Math.floor(total / 12);
        const key = `${y}-${pad2((total % 12) + 1)}`;
        return authFetch(`/api/events?month=${key}`).then((r) =>
          r.ok ? (r.json() as Promise<{ events: CalendarEvent[] }>) : { events: [] }
        );
      });
      const results = await Promise.all(requests);
      const merged = results
        .flatMap((r) => r.events ?? [])
        .filter((ev) => eventDay(ev) >= todayKey)
        .sort((a, b) => {
          const d = a.date.localeCompare(b.date);
          if (d !== 0) return d;
          return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
        });
      setUpcoming(merged.slice(0, 6));
    } catch (error) {
      console.error("Calendrier : chargement des événements à venir", error);
    } finally {
      setUpcomingLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);

  const refreshAll = useCallback(() => {
    refetch();
    loadUpcoming();
  }, [refetch, loadUpcoming]);

  // ── Dialog (détail / formulaire) ────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"detail" | "form">("detail");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingDone, setTogglingDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditing = dialogMode === "form" && selected !== null;

  const openCreate = (dateKey: string) => {
    setSelected(null);
    setForm({ ...emptyForm, date: dateKey });
    setDialogMode("form");
    setDialogOpen(true);
  };

  const openDetail = (ev: CalendarEvent) => {
    setSelected(ev);
    setDialogMode("detail");
    setDialogOpen(true);
  };

  const startEdit = () => {
    if (!selected) return;
    setForm({
      title: selected.title,
      date: eventDay(selected),
      startTime: selected.startTime ?? "",
      endTime: selected.endTime ?? "",
      description: selected.description ?? "",
      color: selected.color,
      type: selected.type,
    });
    setDialogMode("form");
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelected(null);
      setDialogMode("detail");
    }
  };

  const submitForm = async () => {
    if (!form.title.trim()) {
      toast({ title: "Le titre est obligatoire", variant: "destructive" });
      return;
    }
    if (!DATE_RE.test(form.date)) {
      toast({ title: "Date invalide", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(isEditing ? `/api/events/${selected?.id}` : "/api/events", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          description: form.description.trim(),
          color: form.color,
          type: form.type,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast({
          title: json?.error ?? "Erreur lors de l'enregistrement",
          variant: "destructive",
        });
        return;
      }
      toast({ title: isEditing ? "Événement modifié" : "Événement créé" });
      closeDialog(false);
      refreshAll();
    } catch (error) {
      console.error("Calendrier : enregistrement de l'événement", error);
      toast({ title: "Erreur réseau", description: "Enregistrement impossible.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (ev: CalendarEvent) => {
    setTogglingDone(true);
    try {
      const res = await authFetch(`/api/events/${ev.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !ev.done }),
      });
      const json = (await res.json().catch(() => null)) as
        | { event?: CalendarEvent; error?: string }
        | null;
      if (!res.ok || !json?.event) {
        toast({ title: json?.error ?? "Mise à jour impossible", variant: "destructive" });
        return;
      }
      setSelected(json.event);
      toast({ title: json.event.done ? "Marqué comme fait" : "Marqué à faire" });
      refreshAll();
    } catch (error) {
      console.error("Calendrier : bascule fait/à faire", error);
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setTogglingDone(false);
    }
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/events/${ev.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast({ title: json?.error ?? "Suppression impossible", variant: "destructive" });
        return;
      }
      toast({ title: "Événement supprimé", description: ev.title });
      closeDialog(false);
      refreshAll();
    } catch (error) {
      console.error("Calendrier : suppression de l'événement", error);
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Grille du mois (6 semaines commençant lundi) ────────────────────────────
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
    const out: { date: Date; inMonth: boolean; key: string }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(Date.UTC(view.y, view.m, 1 - offset + i));
      out.push({ date: d, inMonth: d.getUTCMonth() === view.m, key: keyOfDateUTC(d) });
    }
    return out;
  }, [view]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of monthEvents) {
      const k = eventDay(ev);
      const arr = map.get(k);
      if (arr) arr.push(ev);
      else map.set(k, [ev]);
    }
    return map;
  }, [monthEvents]);

  // Mini-stats du mois affiché
  const stats = useMemo(
    () => ({
      rdv: monthEvents.filter((e) => e.type === "RDV" && eventDay(e) >= todayKey).length,
      taches: monthEvents.filter((e) => e.type === "TACHE").length,
      rappels: monthEvents.filter((e) => e.type === "RAPPEL").length,
    }),
    [monthEvents, todayKey]
  );

  const navigate = (delta: number) =>
    setView((v) => {
      const total = v.m + delta;
      return { y: v.y + Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });

  const goToday = () => {
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() });
  };

  return (
    <motion.section
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      aria-label="Calendrier des événements"
    >
      {/* En-tête de vue */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Calendrier</h2>
          <p className="text-sm text-muted-foreground">
            Rendez-vous, tâches et rappels de l&apos;activité.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Aujourd&apos;hui
          </Button>
          <Button size="sm" onClick={() => openCreate(todayKey)}>
            <Plus className="h-4 w-4" /> Nouvel événement
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        {/* Grille mensuelle */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(-1)}
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold sm:text-base" aria-live="polite">
                {monthFmt.format(new Date(Date.UTC(view.y, view.m, 1)))}
              </p>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(1)}
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden>
              {WEEK_DAYS.map((d) => (
                <div
                  key={d}
                  className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {loading
                ? Array.from({ length: 42 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-lg lg:h-28" />
                  ))
                : cells.map((cell) => {
                    const isToday = cell.key === todayKey;
                    const dayEvents = eventsByDay.get(cell.key) ?? [];
                    const visible = dayEvents.slice(0, MONTH_LIMIT);
                    const extra = dayEvents.length - visible.length;
                    return (
                      <div
                        key={cell.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`Journée du ${cell.key}${
                          dayEvents.length ? `, ${dayEvents.length} événement(s)` : ""
                        }`}
                        onClick={() => openCreate(cell.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openCreate(cell.key);
                          }
                        }}
                        className={cn(
                          "flex h-24 cursor-pointer flex-col gap-0.5 overflow-hidden rounded-lg border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold lg:h-28",
                          cell.inMonth
                            ? "bg-card hover:bg-accent/40"
                            : "bg-muted/40 opacity-60 hover:bg-muted/60",
                          isToday && "border-gold/60 bg-gold-soft/40 ring-2 ring-gold"
                        )}
                      >
                        <div className="flex items-center justify-center sm:justify-start">
                          {isToday ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:text-[11px]">
                              {cell.date.getUTCDate()}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "text-[11px] font-medium sm:text-xs",
                                cell.inMonth ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              {cell.date.getUTCDate()}
                            </span>
                          )}
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                          {visible.map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              title={ev.title}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(ev);
                              }}
                              className="flex w-full items-center gap-1 rounded px-0.5 py-px text-left hover:bg-accent/60"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full sm:h-auto sm:w-1 sm:self-stretch",
                                  COLOR_DOT[ev.color]
                                )}
                                aria-hidden
                              />
                              <span
                                className={cn(
                                  "hidden min-w-0 flex-1 truncate text-[10px] leading-tight sm:block",
                                  ev.done && "line-through opacity-60"
                                )}
                              >
                                {ev.title}
                              </span>
                            </button>
                          ))}
                          {extra > 0 && (
                            <span className="px-0.5 text-[9px] font-medium text-muted-foreground sm:text-[10px]">
                              +{extra} autre(s)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>
          </CardContent>
        </Card>

        {/* Panneau latéral */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-gold" /> À venir
              </h3>
              {!upcomingLoaded ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Rien à venir</p>
              ) : (
                <ul className="space-y-2">
                  {upcoming.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(ev)}
                        className="flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <span
                          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", COLOR_DOT[ev.color])}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {shortDateFmt.format(new Date(ev.date))}
                            {ev.startTime && (
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="h-3 w-3" /> {formatTimeRange(ev)}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "block truncate text-sm font-medium",
                              ev.done && "line-through opacity-60"
                            )}
                          >
                            {ev.title}
                          </span>
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {TYPE_LABEL[ev.type]}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid grid-cols-3 gap-2 p-4">
              <div className="flex flex-col items-center gap-1 rounded-lg bg-primary/5 p-2 text-center">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <p className="text-lg font-bold tabular-nums">{stats.rdv}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">RDV à venir</p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-gold-soft/40 p-2 text-center">
                <ListTodo className="h-4 w-4 text-gold" />
                <p className="text-lg font-bold tabular-nums">{stats.taches}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">Tâches</p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-primary/5 p-2 text-center">
                <BellRing className="h-4 w-4 text-primary" />
                <p className="text-lg font-bold tabular-nums">{stats.rappels}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">Rappels</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog détail / création-édition */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-lg">
          {dialogMode === "detail" && selected ? (
            <>
              <DialogHeader>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[11px]">
                    {TYPE_LABEL[selected.type]}
                  </Badge>
                  <Badge variant="outline" className={cn("gap-1 text-[11px]", COLOR_BADGE[selected.color])}>
                    <span
                      className={cn("inline-block h-2 w-2 rounded-full", COLOR_DOT[selected.color])}
                      aria-hidden
                    />
                    {COLOR_LABEL[selected.color]}
                  </Badge>
                  {selected.done && (
                    <Badge className="border-primary/30 bg-primary/10 text-[11px] text-primary">
                      Fait
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                <DialogDescription>
                  {longDateFmt.format(new Date(selected.date))} · {formatTimeRange(selected)}
                </DialogDescription>
              </DialogHeader>
              {selected.description ? (
                <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  {selected.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Aucune description.</p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteEvent(selected)}
                  disabled={deleting || togglingDone || saving}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Supprimer
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button variant="outline" size="sm" onClick={() => closeDialog(false)}>
                    Fermer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleDone(selected)}
                    disabled={deleting || togglingDone || saving}
                  >
                    {togglingDone ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selected.done ? (
                      <Undo2 className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {selected.done ? "Marquer à faire" : "Marquer fait"}
                  </Button>
                  <Button size="sm" onClick={startEdit}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle>
                <DialogDescription>
                  {isEditing
                    ? "Modifiez les informations puis enregistrez."
                    : "Renseignez les informations de l'événement."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="event-title">Titre *</Label>
                  <Input
                    id="event-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex. Livraison client, réunion, rappel…"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="event-date">Date</Label>
                    <Input
                      id="event-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="event-start">Début</Label>
                    <Input
                      id="event-start"
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="event-end">Fin</Label>
                    <Input
                      id="event-end"
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Type</Label>
                    <Select
                      value={form.type}
                      onValueChange={(v) => setForm((f) => ({ ...f, type: v as EventType }))}
                    >
                      <SelectTrigger aria-label="Type d'événement">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RDV">Rendez-vous</SelectItem>
                        <SelectItem value="TACHE">Tâche</SelectItem>
                        <SelectItem value="RAPPEL">Rappel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Couleur</Label>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Couleur">
                      {(Object.keys(COLOR_DOT) as EventColor[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={form.color === c}
                          aria-label={COLOR_LABEL[c]}
                          title={COLOR_LABEL[c]}
                          onClick={() => setForm((f) => ({ ...f, color: c }))}
                          className={cn(
                            "h-7 w-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            COLOR_DOT[c],
                            form.color === c && "ring-2 ring-gold ring-offset-2 ring-offset-background"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="event-description">Description</Label>
                  <Textarea
                    id="event-description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Notes, adresse, participants…"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    selected ? setDialogMode("detail") : closeDialog(false)
                  }
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button onClick={submitForm} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {isEditing ? "Enregistrer" : "Créer"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}
