"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  FileWarning,
  ListChecks,
  Loader2,
  Package,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { authFetch } from "@/lib/auth-client";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  AppNotification["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  INVOICE_OVERDUE: { icon: FileWarning, label: "Facture" },
  RDV_TODAY: { icon: CalendarDays, label: "Agenda" },
  TASK_OVERDUE: { icon: ListChecks, label: "Tâche" },
  FOLLOWUP_CREATED: { icon: CheckCircle2, label: "Relance" },
  STOCK_LOW: { icon: Package, label: "Stock" },
};

const SEVERITY_STYLES: Record<AppNotification["severity"], string> = {
  high: "border-l-destructive bg-destructive/5",
  medium: "border-l-amber-500 bg-amber-500/5",
  low: "border-l-muted-foreground/40",
};

/**
 * Centre de notifications : cloche avec badge, liste des alertes calculées
 * (factures en retard, RDV du jour, tâches en retard, relances auto, stock).
 * Rafraîchit toutes les 2 minutes et à chaque ouverture.
 */
export function NotificationBell({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/notifications");
      if (res.ok) {
        const json = (await res.json()) as { notifications?: AppNotification[] };
        setItems(json.notifications ?? []);
      }
    } catch {
      /* silencieux — garde les données précédentes */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const count = items?.length ?? 0;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
          aria-label={`Notifications (${count})`}
          title="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {count > 0 && (
            <span
              className={cn(
                "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow",
                items?.some((n) => n.severity === "high") ? "bg-destructive" : "bg-amber-500"
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Bell className="h-4 w-4 text-primary" aria-hidden />
            Notifications
            {count > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {count}
              </span>
            )}
          </p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} aria-label="Rafraîchir" disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {items === null && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</p>
          )}
          {items !== null && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium">Aucune notification</p>
              <p className="text-xs text-muted-foreground">
                Tout est à jour — aucune facture en retard, aucun RDV oublié.
              </p>
            </div>
          )}
          {items?.map((n) => {
            const meta = TYPE_META[n.type];
            const Icon = meta?.icon ?? Bell;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate(n.view);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border/60 border-l-2 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                  SEVERITY_STYLES[n.severity]
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{n.title}</p>
                  {n.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
                  )}
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {meta?.label ?? "Info"} · ouvrir →
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
