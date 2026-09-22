"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatTone } from "@/lib/crm-format";

// ─── StatsCard du dashboard CRM unifié ──────────────────────────────────────
// Carte blanche, ombre légère, bordure gauche colorée :
// - Or/jaune  → QRTags dominant
// - Bleu      → QRBags dominant
// - Vert      → global / équilibre
// (codage demandé dans le prompt 2, adapté au thème vert & or de 2mails)

const TONE_BORDER: Record<StatTone, string> = {
  qrts: "border-l-4 border-l-gold",
  qrbg: "border-l-4 border-l-blue-500",
  global: "border-l-4 border-l-emerald-500",
};

const TONE_DOT: Record<StatTone, string> = {
  qrts: "bg-gold",
  qrbg: "bg-blue-500",
  global: "bg-emerald-500",
};

export default function StatsCard({
  title,
  value,
  subValue,
  icon: Icon,
  tone = "global",
  trend,
  hint,
}: {
  title: string;
  value: string | number;
  /** ex. « QRTags : 12 | QRBags : 8 » */
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** variation en % vs hier (positif/négatif/0) */
  trend?: number | null;
  hint?: string;
}) {
  const trendIcon = trend == null || trend === 0 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  const trendCls =
    trend == null || trend === 0
      ? "text-muted-foreground"
      : trend > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className={cn("p-4 shadow-sm", TONE_BORDER[tone])}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground truncate">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", TONE_DOT[tone])} aria-hidden />
              {title}
            </p>
            <p className="text-2xl font-bold tabular-nums mt-1 truncate">{value}</p>
            {subValue && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subValue}</p>}
            {hint && <p className="text-[11px] text-muted-foreground/80 truncate">{hint}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-accent">
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </div>
            {trend != null && (
              <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", trendCls)}>
                <trendIcon className="h-3 w-3" aria-hidden />
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/** Skeleton aligné sur la StatsCard (chargement API lente). */
export function StatsCardSkeleton() {
  return (
    <Card className="p-4 shadow-sm border-l-4 border-l-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-7 w-16 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-32 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
      </div>
    </Card>
  );
}
