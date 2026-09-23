"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Loader2,
  Package,
  Plus,
  Printer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useFetch,
} from "@/hooks/use-fetch";
import { formatMoney, formatMoneyCompact } from "@/lib/constants";
import type { DailyReport, DashboardStats } from "@/lib/types";
import { PaymentBadge } from "@/components/status-badges";
import { buildDailyReportPDF, downloadPDF, printPDF, saveOrOpenInvoicePDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Palette bleutée (navy & cyan, inspirée du panneau dashboard) ─────

const KPI_TONES = {
  cyan: "bg-gradient-to-br from-cyan-500 to-sky-700 shadow-cyan-600/30",
  amber: "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30",
  red: "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30",
  navy: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-700/30",
} as const;

type Tone = keyof typeof KPI_TONES;

/** Carte KPI colorée façon « Weekly Sales » du modèle. */
function ColoredKpi({
  title,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-24 flex-col justify-between gap-2 rounded-xl p-4 text-white shadow-lg transition-transform hover:scale-[1.02]",
        KPI_TONES[tone]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{title}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
      <div>
        <p className="truncate text-lg font-extrabold tabular-nums sm:text-xl" title={value}>
          {value}
        </p>
        {hint && <p className="text-[11px] opacity-85">{hint}</p>}
      </div>
    </div>
  );
}

/** Petite carte stat large (façon « TOTAL CUSTOMERS » du modèle). */
function BigStat({
  title,
  value,
  icon: Icon,
  onClick,
  actionLabel,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  actionLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "card-luxe flex items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 text-left shadow-luxe transition-all",
        onClick && "hover:border-primary/40 hover:shadow-md"
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className="mt-1 truncate text-2xl font-extrabold tabular-nums">{value}</p>
        {actionLabel && onClick && (
          <p className="mt-0.5 text-[11px] font-semibold text-primary">{actionLabel} →</p>
        )}
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
    </button>
  );
}

/** Barre de progression avec pastille de valeur (façon « Completed Tasks »). */
function HBar({
  label,
  value,
  max,
  display,
  colorClass,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  colorClass: string;
}) {
  return (
    <div title={`${label} : ${display}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/70">
          <div
            className={cn("h-full rounded-full transition-all", colorClass)}
            style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
          />
        </div>
        <span className="min-w-16 shrink-0 rounded-md border bg-muted/40 px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums">
          {display}
        </span>
      </div>
    </div>
  );
}

function ChartTooltipMoney(value: number | string): string {
  return formatMoney(Number(value));
}

export function DashboardView({
  onNavigate,
  onNewInvoice,
}: {
  onNavigate: (view: string) => void;
  onNewInvoice: () => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: stats, loading } = useFetch<DashboardStats>(
    `/api/dashboard?year=${year}`
  );
  const { toast } = useToast();
  const [reportBusy, setReportBusy] = useState<"print" | "download" | null>(null);

  // ─── Rapport du jour (imprimer / télécharger) ─────────────────────────────
  const handleDailyReport = async (action: "print" | "download") => {
    setReportBusy(action);
    try {
      const res = await fetch(`/api/reports/daily`);
      const report = (await res.json()) as DailyReport;
      if (!res.ok) throw new Error((report as unknown as { error?: string }).error ?? "Erreur");
      const doc = await buildDailyReportPDF(report);
      if (action === "print") {
        printPDF(doc);
        toast({ title: "Rapport du jour", description: "Impression lancée." });
      } else {
        downloadPDF(doc, `rapport-du-jour-${report.date}.pdf`);
        toast({ title: "Rapport du jour", description: "PDF téléchargé." });
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Génération du rapport impossible",
        variant: "destructive",
      });
    } finally {
      setReportBusy(null);
    }
  };

  // ─── Données du graphique ─────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      (stats?.monthlyRevenue ?? []).map((m) => ({
        name: m.month,
        total: m.total,
        paid: m.paid,
      })),
    [stats]
  );

  const donutData = useMemo(() => {
    const sc = stats?.statusCounts;
    if (!sc) return [];
    return [
      { name: "Payées", value: sc.PAYE, color: "var(--chart-1)" },
      { name: "Partielles", value: sc.PARTIEL, color: "var(--chart-2)" },
      { name: "Impayées", value: sc.NON_PAYE, color: "var(--chart-3)" },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const paidPct = useMemo(() => {
    if (!stats) return 0;
    const total = stats.statusCounts.PAYE + stats.statusCounts.PARTIEL + stats.statusCounts.NON_PAYE;
    return total > 0 ? Math.round((stats.statusCounts.PAYE / total) * 100) : 0;
  }, [stats]);

  const maxClient = Math.max(1, ...(stats?.topClients ?? []).map((c) => c.total));
  const maxCategory = Math.max(1, ...(stats?.topCategories ?? []).map((c) => c.total));

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 w-full lg:col-span-2" />
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 w-full lg:col-span-2" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ─── Bandeau titre + actions ─── */}
      <div className="card-luxe rounded-xl border bg-card shadow-luxe">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-extrabold sm:text-xl">
              <span className="text-luxe-gradient">Tableau de bord — {stats.year}</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-muted/50">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)} aria-label="Année précédente">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-9 text-center text-sm font-bold tabular-nums">{year}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y + 1)} aria-label="Année suivante">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={reportBusy !== null}>
                  {reportBusy !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Printer className="h-4 w-4" aria-hidden />
                  )}
                  Rapport du jour
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDailyReport("print")}>
                  <Printer className="h-4 w-4" aria-hidden /> Imprimer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDailyReport("download")}>
                  <Download className="h-4 w-4" aria-hidden /> Télécharger le PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={onNewInvoice}>
              <Plus className="h-4 w-4" aria-hidden />
              Nouvelle facture
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Rangée 1 : 4 KPI colorées (façon panneau de référence) ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ColoredKpi
          title="Ventes du jour"
          value={formatMoneyCompact(stats.today.sales)}
          icon={FileText}
          tone="cyan"
          hint={`${stats.today.invoiceCount} facture(s)`}
        />
        <ColoredKpi
          title="Encaissé du jour"
          value={formatMoneyCompact(stats.today.received)}
          icon={Wallet}
          tone="amber"
          hint={`${stats.today.paymentCount} versement(s)`}
        />
        <ColoredKpi
          title="Créances clients"
          value={formatMoneyCompact(stats.unpaidTotal)}
          icon={CreditCard}
          tone="red"
          hint="Reste à encaisser"
        />
        <ColoredKpi
          title="Taux de paiement"
          value={`${paidPct}%`}
          icon={Gauge}
          tone="navy"
          hint={`${stats.statusCounts.PAYE} payée(s) sur ${stats.statusCounts.PAYE + stats.statusCounts.PARTIEL + stats.statusCounts.NON_PAYE}`}
        />
      </div>

      {/* ─── Rangée 2 : bar chart ventes + donut statuts ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-luxe shadow-luxe lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Ventes mensuelles — {stats.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.25)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : v >= 1000 ? `${Math.round(v / 1000)} k` : String(v))}
                />
                <Tooltip
                  formatter={ChartTooltipMoney}
                  cursor={{ fill: "rgba(100,116,139,0.12)" }}
                  contentStyle={{ borderRadius: 10, borderColor: "rgba(100,116,139,0.25)", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar
                  dataKey="total"
                  name="Facturé"
                  fill="var(--chart-4)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={26}
                />
                <Bar
                  dataKey="paid"
                  name="Encaissé"
                  fill="var(--chart-1)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut : répartition des statuts (pastille % au centre) */}
        <Card className="card-luxe shadow-luxe">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Statut des factures</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Aucune facture enregistrée.</p>
            ) : (
              <>
                <div className="relative mx-auto h-48 max-w-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="68%"
                        outerRadius="95%"
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {donutData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} facture(s)`, name]}
                        contentStyle={{ borderRadius: 10, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold tabular-nums">{paidPct}%</span>
                    <span className="text-[11px] text-muted-foreground">payées</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
                        {d.name}
                      </span>
                      <span className="font-semibold tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Rangée 3 : table dernières factures + grande carte revenu ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 overflow-hidden shadow-luxe lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Dernières factures
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onNavigate("factures")}>
                Voir tout
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {stats.recentInvoices.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucune facture.</p>
            ) : (
              <Table>
                {/* En-tête cyan façon tableau du modèle */}
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-primary">
                    <TableHead className="h-10 rounded-tl-lg text-primary-foreground">N°</TableHead>
                    <TableHead className="h-10 text-primary-foreground">Client</TableHead>
                    <TableHead className="h-10 text-primary-foreground">Paiement</TableHead>
                    <TableHead className="h-10 text-right text-primary-foreground">Montant</TableHead>
                    <TableHead className="h-10 rounded-tr-lg text-right text-primary-foreground">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentInvoices.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap text-xs font-semibold">{f.number}</TableCell>
                      <TableCell className="max-w-28 truncate text-xs" title={f.clientName}>
                        {f.clientName || "Comptoir"}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge status={f.paymentStatus} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                        {formatMoney(f.totalTTC)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await saveOrOpenInvoicePDF(f, "download");
                            } catch {
                              toast({ title: "Erreur PDF", variant: "destructive" });
                            }
                          }}
                          className="inline-flex text-muted-foreground hover:text-primary"
                          aria-label={`Télécharger ${f.number}`}
                        >
                          <Download className="h-4 w-4" aria-hidden />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Grande carte revenu (façon « Revenue » du modèle) */}
        <Card className="card-luxe shadow-luxe">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue — {stats.year}</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-4.2rem)] flex-col justify-center">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-sky-700 p-5 text-white shadow-lg shadow-cyan-600/25">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-90">Encaissé {stats.year}</p>
              <p className="mt-1.5 truncate text-3xl font-black tabular-nums" title={formatMoney(stats.paidTotal)}>
                {formatMoneyCompact(stats.paidTotal)}
              </p>
              <p className="mt-1 text-xs opacity-90">
                Facturé : {formatMoneyCompact(stats.revenueTotal)} · Créances : {formatMoneyCompact(stats.unpaidTotal)}
              </p>
              <Button
                size="sm"
                onClick={() => onNavigate("factures")}
                className="mt-4 border-0 bg-white/20 text-white hover:bg-white/30"
              >
                Voir les factures →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Rangée 4 : Top clients + Top catégories ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-luxe shadow-luxe">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Top clients — {stats.year}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onNavigate("clients")}>
                Détails
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topClients.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune vente enregistrée.</p>
            ) : (
              stats.topClients.slice(0, 5).map((c, i) => (
                <HBar
                  key={c.name}
                  label={c.name}
                  value={c.total}
                  max={maxClient}
                  display={formatMoneyCompact(c.total)}
                  colorClass={
                    i === 0
                      ? "bg-gradient-to-r from-sky-700 to-cyan-500"
                      : i === 1
                        ? "bg-gradient-to-r from-sky-600 to-cyan-400"
                        : "bg-gradient-to-r from-sky-500/90 to-cyan-300/80"
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="card-luxe shadow-luxe">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Revenu par catégorie
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onNavigate("produits")}>
                Détails
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune vente enregistrée.</p>
            ) : (
              stats.topCategories.slice(0, 5).map((c, i) => (
                <HBar
                  key={c.category}
                  label={c.label}
                  value={c.total}
                  max={maxCategory}
                  display={formatMoneyCompact(c.total)}
                  colorClass={
                    i === 0
                      ? "bg-gradient-to-r from-amber-600 to-orange-400"
                      : i === 1
                        ? "bg-gradient-to-r from-amber-500 to-orange-300"
                        : "bg-gradient-to-r from-amber-400/90 to-orange-200/80"
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Rangée 5 : grandes stats + alertes stock ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BigStat
          title="Total clients"
          value={String(stats.clientCount)}
          icon={Users}
          onClick={() => onNavigate("clients")}
          actionLabel="Gérer les clients"
        />
        <BigStat
          title="Produits au catalogue"
          value={String(stats.productCount)}
          icon={Package}
          onClick={() => onNavigate("produits")}
          actionLabel="Voir les produits"
        />
        <BigStat
          title="Commandes en attente"
          value={String(stats.pendingOrders)}
          icon={AlertTriangle}
          onClick={() => onNavigate("commandes")}
          actionLabel="Voir les commandes"
        />
      </div>

      <Card className="card-luxe shadow-luxe">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
            Alertes de stock
            <span className="ml-auto">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onNavigate("produits")}>
                Produits
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.lowStock.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Tous les stocks sont au niveau. 👍
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stats.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seuil : {p.minStock} {p.unit}
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                    {p.stock} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
