"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Target, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { useSettingsStore } from "@/lib/settings-store";
import { formatMoney, formatMoneyCompact } from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Objectif du mois : CA du mois courant vs objectif défini dans les paramètres,
 * avec barre de progression et édition inline (admin).
 */
export function MonthlyGoalCard({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const { settings, setSettings } = useSettingsStore();
  const now = new Date();
  const currentYear = now.getFullYear();
  const { data: stats, loading } = useFetch<DashboardStats>(`/api/dashboard?year=${currentYear}`);

  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [saving, setSaving] = useState(false);

  const goal = settings?.monthlyGoal ?? 0;

  const monthData = useMemo(() => {
    if (!stats?.monthlyRevenue) return null;
    const monthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return stats.monthlyRevenue.find((x) => x.monthKey === monthKey) ?? null;
  }, [stats, currentYear, now]);

  // CA facturé du mois (objectif de chiffre d'affaires) + encaissé en détail
  const monthTotal = monthData?.total ?? 0;
  const monthPaid = monthData?.paid ?? 0;

  const pct = goal > 0 ? Math.min(100, Math.round((monthTotal / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - monthTotal);
  const reached = goal > 0 && monthTotal >= goal;

  const startEdit = () => {
    setGoalInput(goal > 0 ? String(Math.round(goal)) : "");
    setEditing(true);
  };

  const saveGoal = async () => {
    const value = Number(goalInput.replace(/[\s.]/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      toast({ title: "Montant invalide", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const s = settings;
      // On renvoie les champs de la société pour ne rien écraser (logo non renvoyé = conservé)
      const res = await authFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomSociete: s?.nomSociete ?? "2MAILS",
          tagline: s?.tagline ?? "",
          adresse: s?.adresse ?? "",
          telephone: s?.telephone ?? "",
          email: s?.email ?? "",
          rc: s?.rc ?? "",
          ninea: s?.ninea ?? "",
          monthlyGoal: value,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setSettings(json);
      setEditing(false);
      toast({
        title: "Objectif enregistré",
        description: `Objectif du mois : ${formatMoney(value)}`,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Enregistrement impossible",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-luxe shadow-luxe">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" aria-hidden />
          Objectif du mois —{" "}
          {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(now)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-2.5 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-extrabold tabular-nums sm:text-3xl">
                  {formatMoneyCompact(monthTotal)}
                  <span className="ml-1.5 text-sm font-semibold text-muted-foreground">
                    facturés ce mois
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  dont <span className="font-semibold text-foreground">{formatMoneyCompact(monthPaid)}</span> encaissés
                  {goal > 0 && (
                    reached ? (
                      <span className="ml-1 inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        — Objectif atteint ! 🎉
                      </span>
                    ) : (
                      <>
                        , reste <span className="font-semibold text-foreground">{formatMoneyCompact(remaining)}</span>{" "}
                        pour l&apos;objectif de {formatMoneyCompact(goal)}
                      </>
                    )
                  )}
                </p>
              </div>
              {isAdmin && !editing && (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {goal > 0 ? "Modifier" : "Définir l'objectif"}
                </Button>
              )}
              {editing && (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    inputMode="numeric"
                    placeholder="ex : 1 000 000"
                    className="h-9 w-40"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveGoal();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    aria-label="Objectif de CA du mois en FCFA"
                  />
                  <Button size="sm" onClick={saveGoal} disabled={saving} className="h-9">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    OK
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setEditing(false)}
                    aria-label="Annuler"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3">
              <div
                className={cn(
                  "h-3 w-full overflow-hidden rounded-full",
                  reached ? "bg-emerald-500/20" : "bg-muted/70"
                )}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progression de l'objectif du mois"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    reached
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                      : "bg-gradient-to-r from-primary to-cyan-400"
                  )}
                  style={{ width: `${Math.max(goal > 0 ? 3 : 0, pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" aria-hidden />
                  {goal > 0 ? `${pct}% de l'objectif` : "—"}
                </span>
                <span>{goal > 0 ? `${formatMoney(monthTotal)} / ${formatMoney(goal)}` : ""}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
