"use client";

import { useEffect, useState } from "react";
import { QrCode, Luggage, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { actionLabel, formatRelativeFr } from "@/components/crm/crm-shared";
import type { CrmActivity } from "@/lib/types";

// ─── ActivityFeed : flux des derniers webhooks reçus ────────────────────────
// - Icône selon la plateforme : 🏷️ QrCode → QRTags, 🧳 Luggage → QRBags
// - Indicateur « Live » (point vert clignotant) si un webhook a été reçu
//   dans la dernière minute
// - État vide explicite quand aucune activité

function platformIcon(platform: string) {
  return platform === "QRBAGS" ? Luggage : QrCode;
}

function LiveDot({ live }: { live: boolean }) {
  if (!live) return null;
  return (
    <span className="flex items-center gap-1.5 shrink-0" title="Webhook reçu il y a moins d'une minute">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Live</span>
    </span>
  );
}

export default function ActivityFeed({
  activities,
  loading = false,
  max = 10,
  title = "Flux d'activité",
}: {
  activities: CrmActivity[];
  loading?: boolean;
  max?: number;
  title?: string;
}) {
  const [, setTick] = useState(0);

  // Re-render chaque 15 s pour rafraîchir l'indicateur « Live » et les dates relatives
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const list = activities.slice(0, max);
  const lastWebhookAt = list
    .filter((a) => a.action !== "SYNC" && a.action !== "WEBHOOK_ERROR")
    .map((a) => new Date(a.timestamp).getTime())
    .sort((a, b) => b - a)[0];
  const isLive = lastWebhookAt != null && Date.now() - lastWebhookAt < 60_000;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">{title}</p>
        <LiveDot live={isLive} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-8 text-center">
          <MapPin className="h-6 w-6 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-medium">Aucune activité aujourd&apos;hui</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Les webhooks des plateformes (activations, scans, pertes) apparaissent ici en temps réel.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {list.map((a) => {
            const Icon = platformIcon(a.platform);
            return (
              <div key={a.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <div
                  className={
                    a.platform === "QRBAGS"
                      ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold"
                  }
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.details || actionLabel(a.action)}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRelativeFr(a.timestamp)}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {actionLabel(a.action)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
