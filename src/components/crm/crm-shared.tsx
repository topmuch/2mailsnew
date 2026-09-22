"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, HelpCircle, MapPin, RefreshCw, ShieldOff, Sparkles, TriangleAlert } from "lucide-react";

// ─── Helpers partagés des vues CRM Unifié ───────────────────────────────────

/** Date relative en français ("il y a 3 min", "il y a 2 h", "il y a 4 j", date sinon). */
export function formatRelativeFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Actif", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  LOST: { label: "Perdu", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
  FOUND: { label: "Retrouvé", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  SUSPENDED: { label: "Suspendu", className: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" },
  INACTIVE: { label: "Inactif", className: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" },
};

/** Badge de statut d'item CRM (Actif / Perdu / Retrouvé / Suspendu / Inactif). */
export function ItemStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.INACTIVE;
  return (
    <Badge variant="outline" className={cn("font-semibold", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export const ACTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  SCAN: { label: "Scan", icon: MapPin, className: "bg-sidebar-accent text-emerald-700 dark:text-emerald-400" },
  ACTIVATION: { label: "Activation", icon: Sparkles, className: "bg-gold/15 text-gold" },
  LOST: { label: "Perte déclarée", icon: TriangleAlert, className: "bg-destructive/10 text-destructive" },
  FOUND: { label: "Retrouvé", icon: CheckCircle2, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  SUSPENDED: { label: "Suspendu", icon: ShieldOff, className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
  UPDATED: { label: "Mise à jour", icon: RefreshCw, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  SYNC: { label: "Synchronisation", icon: RefreshCw, className: "bg-muted text-muted-foreground" },
  WEBHOOK_ERROR: { label: "Webhook refusé", icon: HelpCircle, className: "bg-destructive/10 text-destructive" },
};

/** Libellé lisible d'une action CRM. */
export function actionLabel(action: string): string {
  return ACTION_META[action]?.label ?? action;
}
