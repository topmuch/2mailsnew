"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-client";

// ─── Widget « Prochaine action » : les 3 priorités du moment ────────────────
// Affiché en haut du tableau de bord. Les priorités sont calculées par
// /api/next-actions (factures en retard > RDV < 2 h > tâches en retard >
// clients sans contact > 30 j).

export interface NextAction {
  id: string;
  type: "INVOICE" | "EVENT" | "TASK" | "CLIENT";
  title: string;
  description: string;
  priority: number;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  action: string;
  context: string;
  targetView: string;
}

const TYPE_LABELS: Record<NextAction["type"], string> = {
  INVOICE: "Facture",
  EVENT: "RDV",
  TASK: "Tâche",
  CLIENT: "Client",
};

const URGENCY_STYLES: Record<NextAction["urgency"], string> = {
  HIGH: "bg-red-500 text-white",
  MEDIUM: "bg-orange-500 text-white",
  LOW: "bg-emerald-500 text-white",
};

export function NextActionWidget({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [actions, setActions] = useState<NextAction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/next-actions");
      const json = await res.json();
      if (res.ok) {
        setActions(json.actions ?? []);
        setTotal(json.total ?? 0);
      } else {
        setActions([]);
      }
    } catch {
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section
      aria-label="Priorités du moment"
      className="min-w-0 overflow-hidden rounded-2xl bg-gradient-to-r from-[#1f3fbf] to-[#3a5ce8] p-4 shadow-lg sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-xl">
          <Target className="h-5 w-5" aria-hidden />
          Mes 3 priorités du moment
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
          onClick={load}
          aria-label="Recalculer les priorités"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        </Button>
      </div>

      {loading && !actions ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/20" />
          ))}
        </div>
      ) : !actions || actions.length === 0 ? (
        <div className="rounded-xl bg-white/90 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">🎉 Tout est à jour !</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aucune action urgente détectée : aucune facture en retard, aucun RDV imminent, aucune tâche dépassée.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.slice(0, 3).map((action, index) => (
            <div
              key={action.id}
              className="flex min-w-0 items-start gap-3 overflow-hidden rounded-xl bg-white/90 p-3.5 sm:p-4"
            >
              <div className="w-7 shrink-0 text-center text-2xl font-black text-[#1f3fbf]" aria-hidden>
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                      URGENCY_STYLES[action.urgency],
                    )}
                  >
                    {action.urgency === "HIGH" ? "Urgent" : action.urgency === "MEDIUM" ? "Important" : "À faire"}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {TYPE_LABELS[action.type]}
                  </span>
                </div>
                <h3 className="truncate text-sm font-bold text-foreground sm:text-base">{action.title}</h3>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">{action.description}</p>
                <p className="mt-1 text-xs font-bold text-[#1f3fbf]">
                  → {action.action} : {action.context}
                </p>
              </div>
              {onNavigate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-[#1f3fbf]"
                  onClick={() => onNavigate(action.targetView)}
                  aria-label={`Ouvrir ${action.title}`}
                  title="Ouvrir la section concernée"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {total > 3 && (
            <p className="pl-1 text-[11px] font-medium text-white/80">
              + {total - 3} autre(s) action(s) moins prioritaire(s)
            </p>
          )}
        </div>
      )}
    </section>
  );
}
