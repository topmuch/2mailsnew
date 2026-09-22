"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Globe2,
  Info,
  Luggage,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { CrmPlatformDto, CrmStats } from "@/lib/types";

// ─── CRM Unifié — Vue d'ensemble (qrtags.pro + qrbags.com) ──────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "danger" | "gold";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-destructive",
    gold: "text-gold",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{hint}</p>}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface PlatformConfigDraft {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
}

export default function CrmDashboardView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configPlatform, setConfigPlatform] = useState<CrmPlatformDto | null>(null);
  const [draft, setDraft] = useState<PlatformConfigDraft>({ apiUrl: "", apiKey: "", webhookSecret: "", isActive: true });
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

  const syncAll = async () => {
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
    setDraft({ apiUrl: p.apiUrl ?? "", apiKey: "", webhookSecret: "", isActive: p.isActive });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const active = stats?.byStatus?.ACTIVE ?? 0;
  const lost = stats?.byStatus?.LOST ?? 0;
  const found = stats?.byStatus?.FOUND ?? 0;

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Globe2 className="h-6 w-6 text-gold" aria-hidden />
            CRM Unifié
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi centralisé des QR codes <strong>qrtags.pro</strong> et <strong>qrbags.com</strong> — activés, perdus, scannés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={syncAll} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Synchroniser maintenant
          </Button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Items suivis" value={stats?.totals.items ?? 0} icon={QrCode} hint="Toutes plateformes" />
        <StatCard label="QR actifs" value={active} icon={MapPin} tone="success" hint="Statut ACTIF" />
        <StatCard label="QR perdus" value={lost} icon={TriangleAlert} tone="danger" hint="Déclarés perdus" />
        <StatCard label="Scans aujourd'hui" value={stats?.totals.scansToday ?? 0} icon={Activity} tone="gold" hint={`${stats?.totals.activitiesToday ?? 0} événements au total`} />
      </div>

      {/* Plateformes */}
      <div className="grid md:grid-cols-2 gap-3">
        {(stats?.platforms ?? []).map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 text-white">
                  {p.name === "QRBAGS" ? <Luggage className="h-5 w-5" aria-hidden /> : <QrCode className="h-5 w-5" aria-hidden />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm flex items-center gap-2">
                    {p.label || p.name}
                    <Badge variant={p.isActive ? "outline" : "secondary"} className={p.isActive ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" : ""}>
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
          </Card>
        ))}
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

      {/* Derniers événements importants + flux d'activité */}
      <div className="grid lg:grid-cols-2 gap-3">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" aria-hidden />
              Flux d&apos;activité (temps réel)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {(stats?.recentActivity ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucune activité pour l&apos;instant.</p>
            )}
            {(stats?.recentActivity ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{a.platform}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{a.details || actionLabel(a.action)}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRelativeFr(a.timestamp)}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{actionLabel(a.action)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de configuration plateforme (admin) */}
      <Dialog open={Boolean(configPlatform)} onOpenChange={(o) => !o && setConfigPlatform(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
              Configurer {configPlatform?.label || configPlatform?.name}
            </DialogTitle>
            <DialogDescription>
              URL de l&apos;API, clé d&apos;authentification et secret du webhook pour cette plateforme.
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
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
