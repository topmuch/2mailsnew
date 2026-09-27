"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  MailCheck,
  Play,
  Save,
  Send,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { formatRelativeFr } from "@/components/crm/crm-shared";
import { formatTodayLong } from "@/lib/crm-format";
import type { CrmAutomationConfig, CrmAutomationStatus, CrmSentMessage } from "@/lib/types";

// ─── Automatisations : rapports quotidiens, coach virtuel, rappels RDV ───────
// Règle horaire : arrêt le samedi à 13h, reprise le lundi — dimanche = repos.

const TYPE_META: Record<string, { label: string; className: string }> = {
  REPORT_MORNING: { label: "Briefing matin", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  REPORT_EVENING: { label: "Bilan soir", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  COACH: { label: "Coach virtuel", className: "bg-gold/15 text-gold border-gold/30" },
  REMINDER: { label: "Rappel RDV", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  TEST: { label: "Test", className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" },
};

type ConfigState = CrmAutomationConfig & { reportMorningTime: string; reportEveningTime: string };

const REMINDER_SLOTS: { key: "J1" | "H1" | "H15"; label: string }[] = [
  { key: "J1", label: "J-1 à 18h" },
  { key: "H1", label: "H-1 (1h avant)" },
  { key: "H15", label: "H-15 min" },
];

const DEFAULT_CONFIG: ConfigState = {
  ownerName: "Monsieur Diop",
  recipientEmail: "",
  reportMorningEnabled: true,
  reportMorningTime: "08:30",
  reportEveningEnabled: true,
  reportEveningTime: "19:00",
  coachEnabled: true,
  coach11Enabled: true,
  coach12Enabled: true,
  coach14Enabled: true,
  coach17Enabled: true,
  coach18Enabled: true,
  remindersEnabled: true,
  reminderSlots: "H1",
  dailyGoal: "",
};

export default function CrmAutomationsView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<CrmAutomationStatus | null>(null);
  const [logs, setLogs] = useState<CrmSentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cfgRes, logsRes] = await Promise.all([
        authFetch("/api/crm/automation/config"),
        authFetch("/api/crm/automation/logs?limit=60"),
      ]);
      if (!cfgRes.ok) throw new Error("config");
      const data = await cfgRes.json();
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      setStatus(data.status);
      if (logsRes.ok) {
        const l = await logsRes.json();
        setLogs(l.logs ?? []);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les automatisations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/crm/automation/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Configuration enregistrée", description: "Le scheduler applique les horaires à la minute." });
      load();
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible (admin requis)", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (kind: string, label: string) => {
    setTesting(kind);
    try {
      const res = await authFetch("/api/crm/automation/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: `${label} — envoi effectué`, description: data.preview ?? "Vérifiez la boîte du destinataire." });
      } else {
        toast({ title: `${label} — échec`, description: data.error ?? data.preview ?? "Erreur inconnue", variant: "destructive" });
      }
      load();
    } catch {
      toast({ title: "Erreur", description: "Test impossible", variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const patch = (p: Partial<ConfigState>) => setConfig((c) => ({ ...c, ...p }));

  const toggleReminderSlot = (slot: "J1" | "H1" | "H15", on: boolean | "indeterminate") => {
    const active = new Set(config.reminderSlots.split(",").map((s) => s.trim()).filter(Boolean));
    if (on === true) active.add(slot);
    else active.delete(slot);
    // ordre canonique J1 → H1 → H15 pour un stockage stable
    patch({ reminderSlots: REMINDER_SLOTS.map((s) => s.key).filter((k) => active.has(k)).join(",") });
  };

  const statusCards = [
    {
      icon: Zap,
      label: "Planificateur",
      value: status?.schedulerRunning ? "Actif" : "Arrêté",
      sub: status?.schedulerRunning ? "Vérification chaque minute" : "Redémarrez le serveur",
      ok: Boolean(status?.schedulerRunning),
    },
    {
      icon: CalendarClock,
      label: "Période actuelle",
      value: status?.businessHoursNow ? "Heures ouvrées" : "Repos",
      sub: status?.businessHoursNow ? "Les envois automatiques sont autorisés" : "Samedi ≥ 13h & dimanche : aucun envoi",
      ok: Boolean(status?.businessHoursNow),
    },
    {
      icon: MailCheck,
      label: "E-mail & SMTP",
      value: status?.smtpConfigured ? (status?.recipientConfigured ? "Prêts" : "Destinataire manquant") : "SMTP non configuré",
      sub: status?.smtpConfigured ? `${status.sentToday} envoi(s) réussi(s) aujourd'hui` : "Paramètres → Boîte mail",
      ok: Boolean(status?.smtpConfigured && status?.recipientConfigured),
    },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BellRing className="h-6 w-6 text-gold" /> Automatisations
          </h1>
          <p className="text-sm text-muted-foreground">{formatTodayLong()} — rapports quotidiens, coach virtuel et rappels de RDV.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={status?.schedulerRunning ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" : "hidden"} />
            <span className={status?.schedulerRunning ? "relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" : "relative inline-flex h-2.5 w-2.5 rounded-full bg-zinc-400"} />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {status?.schedulerRunning ? "Scheduler en marche" : "Scheduler à l'arrêt"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-40" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {statusCards.map((c) => (
            <Card key={c.label} className="border-l-4 border-l-gold">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <c.icon className="h-4 w-4" /> {c.label}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-lg font-bold">{c.value}</span>
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Configuration */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Configuration des envois</h2>
              <p className="text-xs text-muted-foreground">
                Les envois s&apos;arrêtent automatiquement le samedi à 13h et reprennent le lundi.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Clock className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recipient">E-mail destinataire des rapports</Label>
              <Input
                id="recipient"
                type="email"
                placeholder="admin@qrtags.pro (vide = e-mail de la société)"
                value={config.recipientEmail}
                onChange={(e) => patch({ recipientEmail: e.target.value })}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner">Personnalisation du coach</Label>
              <Input
                id="owner"
                placeholder="Monsieur Diop"
                value={config.ownerName}
                onChange={(e) => patch({ ownerName: e.target.value })}
                disabled={!isAdmin}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Rapport matin */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">📅 Briefing du matin</p>
                <p className="text-xs text-muted-foreground">RDV du jour, tâches en retard, factures impayées, e-mails, objectif</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-24"
                  value={config.reportMorningTime}
                  onChange={(e) => patch({ reportMorningTime: e.target.value })}
                  disabled={!isAdmin}
                  aria-label="Heure du rapport du matin"
                />
                <Switch
                  checked={config.reportMorningEnabled}
                  onCheckedChange={(v) => patch({ reportMorningEnabled: v })}
                  disabled={!isAdmin}
                  aria-label="Activer le briefing du matin"
                />
              </div>
            </div>
            {/* Rapport soir */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">📊 Bilan du soir</p>
                <p className="text-xs text-muted-foreground">KPIs QRTags/QRBags, CA estimé, tâches finies, suggestion</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-24"
                  value={config.reportEveningTime}
                  onChange={(e) => patch({ reportEveningTime: e.target.value })}
                  disabled={!isAdmin}
                  aria-label="Heure du rapport du soir"
                />
                <Switch
                  checked={config.reportEveningEnabled}
                  onCheckedChange={(v) => patch({ reportEveningEnabled: v })}
                  disabled={!isAdmin}
                  aria-label="Activer le bilan du soir"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Coach */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">🤖 Coach virtuel (5 messages/jour)</p>
                <Switch checked={config.coachEnabled} onCheckedChange={(v) => patch({ coachEnabled: v })} disabled={!isAdmin} aria-label="Activer le coach virtuel" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {([
                  ["11h", "coach11Enabled"],
                  ["12h", "coach12Enabled"],
                  ["14h", "coach14Enabled"],
                  ["17h", "coach17Enabled"],
                  ["18h", "coach18Enabled"],
                ] as const).map(([slot, key]) => (
                  <label key={slot} className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium">
                    <Switch
                      checked={config[key]}
                      onCheckedChange={(v) => patch({ [key]: v } as Partial<ConfigState>)}
                      disabled={!isAdmin || !config.coachEnabled}
                      aria-label={`Coach ${slot}`}
                    />
                    {slot}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                11h / 14h / 17h : coach business — <span className="font-medium text-foreground">12h &amp; 18h : rappel de poster des visuels sur TikTok, LinkedIn et Facebook</span>.
              </p>
            </div>
            {/* Rappels */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">⏰ Rappels de RDV</p>
                  <p className="text-xs text-muted-foreground">1 e-mail max par RDV et créneau — jamais de doublon</p>
                </div>
                <Switch checked={config.remindersEnabled} onCheckedChange={(v) => patch({ remindersEnabled: v })} disabled={!isAdmin} aria-label="Activer les rappels de rendez-vous" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {REMINDER_SLOTS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium cursor-pointer has-[[data-state=checked]]:border-gold/50 has-[[data-state=checked]]:bg-gold/5"
                  >
                    <Checkbox
                      checked={config.reminderSlots.split(",").map((s) => s.trim()).includes(key)}
                      onCheckedChange={(v) => toggleReminderSlot(key, v)}
                      disabled={!isAdmin || !config.remindersEnabled}
                      aria-label={`Rappel ${label}`}
                    />
                    <span className="leading-tight">{label}</span>
                  </label>
                ))}
              </div>
              {!config.reminderSlots.trim() && config.remindersEnabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Aucun créneau coché : aucun rappel ne sera envoyé.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal">Objectif du jour (fixe — vide = objectif aléatoire)</Label>
            <Input
              id="goal"
              placeholder="Ex. : Contacter l'hôtel Terrou-Bi pour les bracelets"
              value={config.dailyGoal}
              onChange={(e) => patch({ dailyGoal: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tests manuels */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold">Tests manuels</h2>
          <p className="mb-4 text-xs text-muted-foreground">Envoi immédiat du contenu réel (contourne la règle samedi 13h / dimanche).</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["MORNING", "Tester le briefing", Send],
              ["EVENING", "Tester le bilan", Send],
              ["COACH_11", "Coach 11h", Play],
              ["COACH_12", "Visuels 12h", Play],
              ["COACH_14", "Coach 14h", Play],
              ["COACH_17", "Coach 17h", Play],
              ["COACH_18", "Visuels 18h", Play],
              ["REMINDERS", "Vérifier rappels", Play],
            ].map(([kind, label, Icon]) => (
              <Button
                key={kind as string}
                variant="outline"
                size="sm"
                disabled={!isAdmin || testing !== null}
                onClick={() => runTest(kind as string, label as string)}
              >
                {testing === kind ? <Clock className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
                {label as string}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Historique des envois */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-3 text-base font-semibold">Historique des envois</h2>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun envoi enregistré pour le moment. Le premier rapport partira demain matin à {config.reportMorningTime}.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => {
                    const meta = TYPE_META[l.type] ?? TYPE_META.TEST;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate" title={l.error ?? l.subject}>
                          {l.subject}
                          {l.error && <span className="ml-2 text-xs text-destructive">{l.error.slice(0, 80)}</span>}
                        </TableCell>
                        <TableCell>
                          {l.status === "SENT" ? (
                            <span className="text-xs font-semibold text-emerald-600">Envoyé</span>
                          ) : (
                            <span className="text-xs font-semibold text-destructive">Échec</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{formatRelativeFr(l.sentAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
