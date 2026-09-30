"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Info,
  QrCode,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { actionLabel, formatRelativeFr } from "@/components/crm/crm-shared";
import StatsCard, { StatsCardSkeleton } from "@/components/crm/stats-card";
import ActivityFeed from "@/components/crm/activity-feed";
import SyncButton from "@/components/crm/sync-button";
import {
  dominantTone,
  formatFcfa,
  formatNumber,
  formatTodayLong,
  pieColor,
  pieTotal,
  platformSubValue,
  sumPlatforms,
} from "@/lib/crm-format";
import type { CrmPlatformDto, CrmStats } from "@/lib/types";

// ─── CRM Unifié — Tableau de Bord Unifié (qrtags.pro + qrbags.com + verifscan.com) ──
// Adaptation du « Prompt 2 » : le dashboard consomme la couche API locale
// (/api/crm/stats) qui agrège les données reçues des deux plateformes
// (webhooks + synchronisation). Aucun appel direct vers les plateformes
// depuis le navigateur.

const PIE_CHART_CONFIG = {
  QRTAGS: { label: "QRTags", color: "var(--color-gold, #d4a017)" },
  QRBAGS: { label: "QRBags", color: "#3b82f6" },
  VERIFSCAN: { label: "VerifScan", color: "#0d9488" },
} satisfies ChartConfig;

interface PlatformConfigDraft {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  estimatedPackPrice: string;
  isActive: boolean;
}

export default function CrmDashboardView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configPlatform, setConfigPlatform] = useState<CrmPlatformDto | null>(null);
  const [draft, setDraft] = useState<PlatformConfigDraft>({ apiUrl: "", apiKey: "", webhookSecret: "", estimatedPackPrice: "", isActive: true });
  const [savingConfig, setSavingConfig] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/stats");
      if (!res.ok) throw new Error("Chargement impossible");
      setStats(await res.json());
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les statistiques CRM", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
    const t = setInterval(load, 30_000); // rafraîchissement automatique 30 s
    return () => clearInterval(t);
  }, [load]);

  const doSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/crm/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const created = (json.results ?? []).reduce((a: number, r: { created: number }) => a + r.created, 0);
      const errors = json.errors ?? [];
      if (errors.length) {
        toast({ title: "Synchronisation partielle", description: errors.map((e: { platform: string; error: string }) => `${e.platform} : ${e.error}`).join(" · ") });
      } else {
        toast({ title: "Synchronisation terminée", description: `${created} nouvel(s) item(s) importé(s)` });
      }
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const openConfig = (p: CrmPlatformDto) => {
    setConfigPlatform(p);
    setDraft({
      apiUrl: p.apiUrl ?? "",
      apiKey: "",
      webhookSecret: "",
      estimatedPackPrice: p.estimatedPackPrice != null ? String(p.estimatedPackPrice) : "",
      isActive: p.isActive,
    });
  };

  const saveConfig = async () => {
    if (!configPlatform) return;
    setSavingConfig(true);
    try {
      const payload: Record<string, unknown> = {
        id: configPlatform.id,
        apiUrl: draft.apiUrl,
        isActive: draft.isActive,
      };
      if (draft.apiKey) payload.apiKey = draft.apiKey;
      if (draft.webhookSecret) payload.webhookSecret = draft.webhookSecret;
      if (draft.estimatedPackPrice !== "") payload.estimatedPackPrice = Number(draft.estimatedPackPrice);
      const res = await authFetch("/api/crm/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Plateforme mise à jour", description: configPlatform.label || configPlatform.name });
      setConfigPlatform(null);
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setSavingConfig(false);
    }
  };

  // ─── Données dérivées des stats ──────────────────────────────────────────
  const ps = stats?.platformStats;
  const activations = sumPlatforms(ps, (s) => s.activationsToday);
  const scans = sumPlatforms(ps, (s) => s.scansToday);
  const found = stats?.totals.found ?? 0;
  const lost = stats?.totals.lost ?? 0;
  const successRate = stats?.totals.successRate ?? null;
  const revenue = stats?.totals.estimatedRevenue ?? 0;
  const newItemsToday = stats?.totals.newItemsToday ?? 0;

  const pieSlices = useMemo(
    () =>
      (stats?.pieData ?? [])
        .map((s) => ({ ...s, fill: pieColor(s.name) }))
        .filter((s) => s.value > 0),
    [stats?.pieData]
  );
  const pieSum = pieTotal(stats?.pieData);

  if (loading) {
    // Skeletons (API lente ou premier chargement)
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-9 w-52 rounded-md" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* En-tête : Tableau de Bord Unifié + date + SyncButton */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-gold" aria-hidden />
            CRM Unifié — Tableau de Bord
          </h1>
          <p className="text-sm text-muted-foreground mt-1 first-letter:uppercase">
            {formatTodayLong()} · suivi des QR codes <strong>qrtags.pro</strong>, <strong>qrbags.com</strong> et <strong>verifscan.com</strong> en temps réel.
          </p>
        </div>
        <SyncButton onSync={doSyncAll} syncing={syncing} />
      </div>

      {/* 4 cartes de statistiques du jour (bordure : or = QRTags dominant, bleu = QRBags dominant, vert = global) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title="Total activations (jour)"
          value={formatNumber(activations)}
          subValue={platformSubValue(ps, (s) => s.activationsToday)}
          icon={Sparkles}
          tone={dominantTone(
            ps?.find((x) => x.name === "QRTAGS")?.activationsToday ?? 0,
            ps?.find((x) => x.name === "QRBAGS")?.activationsToday ?? 0,
            ps?.find((x) => x.name === "VERIFSCAN")?.activationsToday ?? 0,
          )}
        />
        <StatsCard
          title="Total scans (jour)"
          value={formatNumber(scans)}
          subValue={platformSubValue(ps, (s) => s.scansToday)}
          icon={ScanLine}
          tone={dominantTone(
            ps?.find((x) => x.name === "QRTAGS")?.scansToday ?? 0,
            ps?.find((x) => x.name === "QRBAGS")?.scansToday ?? 0,
            ps?.find((x) => x.name === "VERIFSCAN")?.scansToday ?? 0,
          )}
        />
        <StatsCard
          title="Objets retrouvés"
          value={formatNumber(found)}
          subValue={successRate != null ? `Taux de succès : ${successRate} %` : "Taux de succès : —"}
          hint={`Perdus en cours : ${formatNumber(lost)}`}
          icon={BadgeCheck}
          tone="global"
        />
        <StatsCard
          title="Revenu estimé (jour)"
          value={formatFcfa(revenue)}
          subValue={`${formatNumber(newItemsToday)} pack(s) vendu(s) aujourd'hui`}
          hint={platformSubValue(ps, (s) => s.estimatedRevenue)}
          icon={Wallet}
          tone={dominantTone(
            ps?.find((x) => x.name === "QRTAGS")?.estimatedRevenue ?? 0,
            ps?.find((x) => x.name === "QRBAGS")?.estimatedRevenue ?? 0,
            ps?.find((x) => x.name === "VERIFSCAN")?.estimatedRevenue ?? 0,
          )}
        />
      </div>

      {/* Cartes plateformes (configuration admin conservée) */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(stats?.platforms ?? []).map((p) => {
          const stat = ps?.find((x) => x.name === p.name);
          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-sky-700 text-white">
                    {p.name === "QRBAGS" ? <QrCode className="h-5 w-5" aria-hidden /> : p.name === "VERIFSCAN" ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <ScanLine className="h-5 w-5" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm flex items-center gap-2">
                      {p.label || p.name}
                      <Badge variant={p.isActive ? "outline" : "secondary"} className={p.isActive ? "border-cyan-300 text-cyan-700 dark:text-cyan-400" : ""}>
                        {p.isActive ? "Connectée" : "Inactive"}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.itemCount} item(s) · dernière synchro : {formatRelativeFr(p.lastSyncAt)}
                    </p>
                    {!p.hasApiKey && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                        URL API et clé API à configurer pour la synchronisation
                      </p>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => openConfig(p)} className="gap-1.5 shrink-0">
                    <Settings2 className="h-3.5 w-3.5" aria-hidden />
                    Config
                  </Button>
                )}
              </div>
              {stat && (
                <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-2.5 text-center">
                  {[
                    { label: "Activations", value: stat.activationsToday },
                    { label: "Scans", value: stat.scansToday },
                    { label: "Retrouvés", value: stat.found },
                    { label: "Perdus", value: stat.lost },
                  ].map((k) => (
                    <div key={k.label}>
                      <p className="text-sm font-bold tabular-nums">{formatNumber(k.value)}</p>
                      <p className="text-[10px] text-muted-foreground">{k.label} (jour)</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Info webhook */}
      <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-xs leading-relaxed">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
        <div>
          <p className="font-semibold text-foreground">Brancher les webhooks des plateformes</p>
          <p className="text-muted-foreground mt-0.5">
            Dans l&apos;administration de chaque plateforme, configurez le webhook :
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono">{origin || "https://votre-domaine"}/api/crm/webhooks</code>
            avec l&apos;en-tête <code className="rounded bg-muted px-1.5 py-0.5 font-mono">X-Webhook-Secret</code> (secret défini dans « Config » ci-dessus).
            Événements : <em>item_activated, item_scanned, item_lost, item_found, item_suspended</em>.
          </p>
        </div>
      </div>

      {/* Camembert répartition + Activations / Pertes / Retrouvailles */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Répartition de l&apos;activité du jour</CardTitle>
          </CardHeader>
          <CardContent>
            {pieSum === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                <Activity className="h-7 w-7 text-muted-foreground/40" aria-hidden />
                <p className="text-sm font-medium">Aucune activité aujourd&apos;hui</p>
                <p className="text-xs text-muted-foreground">Le camembert apparaît dès réception du premier événement.</p>
              </div>
            ) : (
              <ChartContainer config={PIE_CHART_CONFIG} className="mx-auto aspect-square max-h-64">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie
                    data={pieSlices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={46}
                    strokeWidth={4}
                    label={({ name, value }) => `${name === "QRTAGS" ? "QRTags" : name === "QRBAGS" ? "QRBags" : "VerifScan"} : ${value}`}
                  >
                    {pieSlices.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            <div className="mt-2 flex items-center justify-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden /> QRTags
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden /> QRBags
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-600" aria-hidden /> VerifScan
              </span>
              <span className="text-muted-foreground">{formatNumber(pieSum)} événement(s) aujourd&apos;hui</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-gold" aria-hidden />
              Activations / Pertes / Retrouvailles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {(stats?.lastEvents ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucun événement pour l&apos;instant. Les webhooks des plateformes alimentent cette liste automatiquement.</p>
            )}
            {(stats?.lastEvents ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{e.platform}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.details || actionLabel(e.action)}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRelativeFr(e.timestamp)}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{actionLabel(e.action)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Flux d'activité récent (ActivityFeed avec indicateur Live) */}
      <Card>
        <CardContent className="pt-5">
          <ActivityFeed activities={stats?.recentActivity ?? []} loading={false} max={10} />
        </CardContent>
      </Card>

      {/* Dialog de configuration plateforme (admin) */}
      <Dialog open={Boolean(configPlatform)} onOpenChange={(o) => !o && setConfigPlatform(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
              Configurer {configPlatform?.label || configPlatform?.name}
            </DialogTitle>
            <DialogDescription>
              URL de l&apos;API, clé d&apos;authentification, secret du webhook et prix estimé d&apos;un pack pour cette plateforme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="crm-api-url">URL de l&apos;API (ex. https://qrbags.com)</Label>
              <Input
                id="crm-api-url"
                placeholder="https://qrbags.com"
                value={draft.apiUrl}
                onChange={(e) => setDraft((d) => ({ ...d, apiUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-api-key">Clé API (Bearer) {configPlatform?.hasApiKey ? "(déjà définie — laisser vide pour conserver)" : ""}</Label>
              <Input
                id="crm-api-key"
                type="password"
                placeholder={configPlatform?.hasApiKey ? "••••••••••••" : "Clé API de la plateforme"}
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-webhook-secret">Secret du webhook {configPlatform?.hasWebhookSecret ? "(déjà défini — laisser vide pour conserver)" : ""}</Label>
              <Input
                id="crm-webhook-secret"
                type="password"
                placeholder={configPlatform?.hasWebhookSecret ? "••••••••••••" : "Secret partagé pour valider les webhooks"}
                value={draft.webhookSecret}
                onChange={(e) => setDraft((d) => ({ ...d, webhookSecret: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-pack-price">Prix estimé d&apos;un pack (FCFA)</Label>
              <Input
                id="crm-pack-price"
                type="number"
                min="0"
                placeholder="ex. 5000"
                value={draft.estimatedPackPrice}
                onChange={(e) => setDraft((d) => ({ ...d, estimatedPackPrice: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Utilisé pour la carte « Revenu estimé » : nouveaux items du jour × prix du pack.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="crm-active" className="text-sm font-normal">
                Plateforme connectée (active)
              </Label>
              <Switch id="crm-active" checked={draft.isActive} onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigPlatform(null)} disabled={savingConfig}>
              Annuler
            </Button>
            <Button onClick={saveConfig} disabled={savingConfig} className="gap-2">
              {savingConfig ? <LoaderSpinner /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoaderSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
