"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Download,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFetch } from "@/hooks/use-fetch";
import { formatMoney } from "@/lib/constants";
import type { DailyReport, DashboardStats } from "@/lib/types";
import { PaymentBadge } from "@/components/status-badges";
import { buildDailyReportPDF, downloadPDF, printPDF, saveOrOpenInvoicePDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NextActionWidget } from "@/components/next-action-widget";
import { MonthlyGoalCard } from "@/components/monthly-goal-card";

// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD « BI » — refonte complète façon tableau de bord de ventes
// (barre de titre rouge centrée, cartes KPI à liseré coloré + icône,
// calendrier doré « Période calendaire », barres horizontales crimson,
// barres verticales orange / teal avec boutons « Détails »).
// Canevas fidèle à la maquette en mode clair, décliné en sombre via les
// variantes dark: (mode sombre pleinement pris en charge).
// ═══════════════════════════════════════════════════════════════════════════

const BI = {
  crimson: "#D6455F",
  orange: "#F09A3E",
  teal: "#17AFA5",
  navy: "#333F50",
  stripNavy: "#1F3A66",
  stripNavyActive: "#2D5CA8",
  gold: "#FFC918",
  goldSoft: "rgba(255, 201, 24, 0.38)",
  title: "#D93025",
} as const;

const CARD_SHADOW = "shadow-[0_2px_6px_rgba(16,24,40,0.10)]";

/** Étiquette d'axe compacte : 2,5 M · 829 k · 67 181 (sans devise). */
function fmtAxis(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (a >= 100_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k`;
  return n.toLocaleString("fr-FR");
}

// ─── Carte blanche BI (titre gras à gauche, action à droite) ────────────────
function BiCard({
  title,
  right,
  children,
  className,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg bg-white p-4 text-stone-800 dark:bg-[#1E2634] dark:text-stone-100",
        CARD_SHADOW,
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold tracking-tight text-stone-900 sm:text-base dark:text-stone-50">{title}</h3>
        {right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

// ─── Carte KPI : liseré coloré + icône + libellé grisé + valeur grasse ──────
function BiKpi({
  label,
  value,
  fullTitle,
  hint,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  /** Valeur complète (avec devise) pour l'infobulle */
  fullTitle?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-white py-4 pl-3 pr-2 dark:bg-[#1E2634] sm:gap-2.5 sm:pl-3.5" style={{ boxShadow: "0 2px 6px rgba(16,24,40,0.10)" }}>
      <span aria-hidden className="w-3 shrink-0 self-stretch rounded-full sm:w-3.5" style={{ background: color }} />
      <Icon className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" style={{ color }} aria-hidden />
      <div className="min-w-0 flex-1 text-center">
        <p className="text-[11px] font-semibold leading-tight text-stone-400">{label}</p>
        <p
          className="mt-0.5 truncate text-[17px] font-extrabold leading-tight tabular-nums text-stone-800 dark:text-stone-100"
          title={fullTitle ?? value}
        >
          {value}
        </p>
        {hint && <p className="truncate text-[9.5px] leading-tight text-stone-400" title={hint}>{hint}</p>}
      </div>
    </div>
  );
}

// ─── Mini stat de la bande « Aujourd'hui » ───────────────────────────────────
function MiniStat({
  label,
  value,
  sub,
  color,
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  progress?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="truncate text-base font-extrabold tabular-nums text-stone-800 sm:text-lg dark:text-stone-100" title={value}>
        {value}
      </p>
      {sub && <p className="truncate text-[10px] text-stone-400">{sub}</p>}
      {typeof progress === "number" && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700/70">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Barres verticales plates (valeurs au-dessus, noms en dessous) ──────────
function VBars({
  items,
  color,
  emptyLabel = "Aucune donnée",
}: {
  items: { name: string; value: number }[];
  color: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-14 text-center text-sm text-stone-400">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-52 items-stretch gap-1.5 sm:h-64 sm:gap-3 xl:h-72" role="img" aria-label="Graphique en barres">
      {items.map((it) => {
        const hPct = Math.max(it.value > 0 ? 3 : 1.5, (it.value / max) * 100);
        return (
          <div key={it.name} className="flex min-w-0 flex-1 flex-col items-center" title={`${it.name} : ${formatMoney(it.value)}`}>
            {/* valeur au-dessus de la barre */}
            <div className="flex h-4 w-full items-end justify-center sm:h-5">
              <span className="whitespace-nowrap text-[8.5px] font-bold tabular-nums text-stone-700 sm:text-[10.5px] dark:text-stone-200">
                {fmtAxis(it.value)}
              </span>
            </div>
            {/* barre */}
            <div className="flex w-full flex-1 items-end justify-center px-0.5">
              <div
                className="w-full max-w-14 rounded-t-[3px] transition-all"
                style={{ height: `${hPct}%`, background: color, opacity: it.value > 0 ? 1 : 0.35 }}
              />
            </div>
            {/* nom */}
            <p className="mt-1.5 w-full truncate text-center text-[10px] font-semibold text-stone-700 dark:text-stone-200" title={it.name}>
              {it.name}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Bouton « Détails » façon maquette (pastille cerclée colorée) ────────────
function DetailsPill({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border-2 bg-white px-4 py-0.5 text-xs font-bold transition-transform hover:scale-[1.04] active:scale-95 dark:bg-transparent"
      style={{ borderColor: color, color }}
    >
      Détails
    </button>
  );
}

// ─── Accès rapide (bas de page, même style que les KPI) ─────────────────────
function BiQuickLink({
  label,
  value,
  icon: Icon,
  color,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-2.5 rounded-lg bg-white p-3.5 text-left transition-shadow hover:shadow-md sm:gap-3 dark:bg-[#1E2634]"
      style={{ boxShadow: "0 2px 6px rgba(16,24,40,0.10)" }}
    >
      <span aria-hidden className="w-3 shrink-0 self-stretch rounded-full sm:w-3.5" style={{ background: color }} />
      <Icon className="h-7 w-7 shrink-0" style={{ color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-stone-400">{label}</span>
        <span className="block truncate text-lg font-extrabold tabular-nums text-stone-800 dark:text-stone-100">{value}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" aria-hidden />
    </button>
  );
}

// ─── Mois du bandeau calendaire ──────────────────────────────────────────────
const MONTH_LABELS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function DashboardView({
  onNavigate,
  onNewInvoice,
  isAdmin,
}: {
  onNavigate: (view: string) => void;
  onNewInvoice: () => void;
  isAdmin?: boolean;
}) {
  const now = new Date();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  // Navy « texte / bordure » trop sombre sur fond sombre → version éclaircie en dark
  const biNavy = dark ? "#9DAFCC" : BI.navy;
  const biTitle = dark ? "#FF6B5E" : BI.title;
  const [year, setYear] = useState(now.getFullYear());
  // Mois affiché dans le calendrier AAAA-MM (piloté par le bandeau de mois)
  const [calMonth, setCalMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [monthsOpen, setMonthsOpen] = useState(false);
  const { toast } = useToast();
  const [reportBusy, setReportBusy] = useState<"print" | "download" | null>(null);

  const { data: stats, loading } = useFetch<DashboardStats>(`/api/dashboard?year=${year}&month=${calMonth}`);

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

  // ─── Navigation d'année (garde le mois courant) ───────────────────────────
  const changeYear = (delta: number) => {
    const y = year + delta;
    if (y < 2000 || y > 2100) return;
    setYear(y);
    setCalMonth(`${y}-${calMonth.split("-")[1]}`);
  };

  // ─── Navigation de mois (bandeau calendaire, traverse les années) ─────────
  const stepMonth = (delta: number) => {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    setCalMonth(key);
    if (d.getFullYear() !== year) setYear(d.getFullYear());
  };

  const calYear = Number(calMonth.split("-")[0]);
  const calMonthIdx = Number(calMonth.split("-")[1]) - 1;

  // ─── Grille du calendrier (lundi en premier) ──────────────────────────────
  const calendarCells = useMemo(() => {
    if (!stats) return { blanks: 0, days: [] as { day: number; total: number; count: number }[] };
    const [my, mm] = calMonth.split("-").map(Number);
    const offset = (new Date(my, mm - 1, 1).getDay() + 6) % 7; // lundi = 0
    return { blanks: offset, days: stats.dailyRevenue };
  }, [stats, calMonth]);

  const isCurrentDisplayedMonth = calMonth === `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const todayDay = now.getDate();

  // ─── Tranches : max pour les proportions ──────────────────────────────────
  const maxTranche = Math.max(1, ...(stats?.tranches ?? []).map((t) => t.count));

  // ─── Donut statuts de paiement ────────────────────────────────────────────
  const donutData = useMemo(() => {
    const sc = stats?.statusCounts;
    if (!sc) return [];
    return [
      { name: "Payées", value: sc.PAYE, color: BI.teal },
      { name: "Partielles", value: sc.PARTIEL, color: BI.gold },
      { name: "Impayées", value: sc.NON_PAYE, color: BI.crimson },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const paidPct = useMemo(() => {
    if (!stats) return 0;
    const total = stats.statusCounts.PAYE + stats.statusCounts.PARTIEL + stats.statusCounts.NON_PAYE;
    return total > 0 ? Math.round((stats.statusCounts.PAYE / total) * 100) : 0;
  }, [stats]);

  const paidInvoicesTotal = stats?.statusCounts.PAYE ?? 0;
  const allInvoicesTotal = paidInvoicesTotal + (stats?.statusCounts.PARTIEL ?? 0) + (stats?.statusCounts.NON_PAYE ?? 0);

  // ─── Données des graphiques verticaux ─────────────────────────────────────
  const top5Clients = useMemo(
    () => (stats?.topClients ?? []).slice(0, 5).map((c) => ({ name: c.name, value: c.total })),
    [stats],
  );
  const monthlyBars = useMemo(
    () => (stats?.monthlyRevenue ?? []).map((m) => ({ name: m.month, value: m.total })),
    [stats],
  );
  const monthsTotal = useMemo(() => (stats?.monthlyRevenue ?? []).reduce((s, m) => s + m.total, 0), [stats]);
  const monthsPaidTotal = useMemo(() => (stats?.monthlyRevenue ?? []).reduce((s, m) => s + m.paid, 0), [stats]);
  const maxCategory = Math.max(1, ...(stats?.topCategories ?? []).map((c) => c.total));

  // ─── Chargement initial ───────────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <div className="space-y-4 rounded-xl bg-[#E8EAF1] p-3 dark:bg-[#131822] sm:p-4">
        <Skeleton className="h-14 w-full rounded-lg bg-white/70 dark:bg-[#1E2634]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg bg-white/70 dark:bg-[#1E2634]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg bg-white/70 dark:bg-[#1E2634]" />
          ))}
        </div>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div
      className="space-y-4 rounded-xl bg-[#E8EAF1] p-3 dark:bg-[#131822] sm:space-y-5 sm:p-4"
      style={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}
    >
      {/* ═══ Barre de titre : titre rouge centré + actions à droite ═════════ */}
      <header className="relative flex flex-col items-center gap-2.5 rounded-lg bg-white px-3 py-3 dark:bg-[#1E2634] sm:px-4 sm:pr-48" style={{ boxShadow: "0 2px 6px rgba(16,24,40,0.10)" }}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeYear(-1)}
            aria-label="Année précédente"
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700/60 dark:hover:text-stone-200"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="text-center text-lg font-extrabold tracking-tight sm:text-2xl" style={{ color: biTitle }}>
            Tableau de bord des ventes - Année <span className="tabular-nums">{stats.year}</span>
          </h1>
          <button
            type="button"
            onClick={() => changeYear(1)}
            aria-label="Année suivante"
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700/60 dark:hover:text-stone-200"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2 sm:absolute sm:right-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Rapport du jour"
                disabled={reportBusy !== null}
                className="h-9 w-9 border-2 bg-white hover:bg-[#D6455F]/10 dark:bg-transparent dark:hover:bg-[#D6455F]/25"
                style={{ borderColor: BI.crimson, color: BI.crimson }}
              >
                {reportBusy !== null ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
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
          <Button size="sm" onClick={onNewInvoice} className="h-9 border-0 text-white" style={{ background: BI.crimson }}>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvelle facture
          </Button>
        </div>
      </header>

      {/* ═══ Rangée de 5 cartes KPI (liseré coloré + icône) ═════════════════ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-5">
        <BiKpi
          label="Total Revenue"
          value={fmtAxis(stats.revenueTotal)}
          fullTitle={formatMoney(stats.revenueTotal)}
          hint={`Encaissé : ${fmtAxis(stats.paidTotal)}`}
          icon={Banknote}
          color={BI.crimson}
        />
        <BiKpi
          label="Nombre Factures"
          value={String(stats.invoiceCount)}
          hint={`${stats.proformaCount} proforma(s)`}
          icon={ReceiptText}
          color={BI.crimson}
        />
        <BiKpi
          label="Nombre Clients"
          value={String(stats.clientCount)}
          icon={ContactRound}
          color={BI.orange}
        />
        <BiKpi
          label="Nombre Produits"
          value={String(stats.productCount)}
          icon={Boxes}
          color={BI.teal}
        />
        <div className="col-span-2 lg:col-span-1">
          <BiKpi
            label="Reste à encaisser"
            value={fmtAxis(stats.unpaidTotal)}
            fullTitle={formatMoney(stats.unpaidTotal)}
            hint={`Facturé : ${fmtAxis(stats.revenueTotal)}`}
            icon={Wallet}
            color={biNavy}
          />
        </div>
      </div>

      {/* ═══ Bande « Aujourd'hui » (ventes, encaissements, taux) ════════════ */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 rounded-lg bg-white p-3 dark:bg-[#1E2634] dark:divide-stone-700/70 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-stone-200" style={{ boxShadow: "0 2px 6px rgba(16,24,40,0.10)" }}>
        <MiniStat
          label="Ventes du jour"
          value={formatMoney(stats.today.sales)}
          sub={`${stats.today.invoiceCount} facture(s)`}
          color={BI.crimson}
        />
        <MiniStat
          label="Encaissé du jour"
          value={formatMoney(stats.today.received)}
          sub={`${stats.today.paymentCount} versement(s)`}
          color={BI.orange}
        />
        <MiniStat
          label="Proformas du jour"
          value={String(stats.today.proformaCount)}
          sub="devis établis aujourd'hui"
          color={BI.teal}
        />
        <MiniStat
          label="Taux de paiement"
          value={`${paidPct}%`}
          sub={`${paidInvoicesTotal} payée(s) sur ${allInvoicesTotal}`}
          color={BI.teal}
          progress={paidPct}
        />
      </div>

      {/* ═══ Calendrier des ventes PLEINE LARGEUR + tranches ═══════════════ */}
      <div className="grid gap-3.5 sm:gap-4">
        {/* ─── Période calendaire (pleine largeur, comme la maquette) ─── */}
        <BiCard title="Période calendaire">
          {/* Bandeau des mois (navy) */}
          <div className="flex items-stretch overflow-hidden rounded" role="tablist" aria-label="Mois de l'année">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Mois précédent"
              className="bg-[#1F3A66] px-1 text-white transition-colors hover:bg-[#2D5CA8] sm:px-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            {MONTH_LABELS.map((m, idx) => {
              const key = `${calYear}-${pad2(idx + 1)}`;
              const active = key === calMonth;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCalMonth(key)}
                  className={cn(
                    "min-w-0 flex-1 border-r border-white/10 py-1.5 text-[8px] font-bold tracking-tighter text-white transition-colors last:border-r-0 sm:text-[10px] sm:tracking-tight",
                    active ? "bg-[#2D5CA8]" : "bg-[#1F3A66] hover:bg-[#274A82]",
                  )}
                >
                  {m}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Mois suivant"
              className="bg-[#1F3A66] px-1 text-white transition-colors hover:bg-[#2D5CA8] sm:px-1.5"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {/* Jours de la semaine + tuiles dorées */}
          <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
            {WEEKDAYS.map((d, i) => (
              <p key={`${d}-${i}`} className="text-center text-[9px] font-bold uppercase text-stone-400 dark:text-stone-500" aria-hidden>
                {d}
              </p>
            ))}
            {Array.from({ length: calendarCells.blanks }).map((_, i) => (
              <div key={`blank-${i}`} aria-hidden />
            ))}
            {calendarCells.days.map((d) => {
              const hasSales = d.count > 0;
              const isToday = isCurrentDisplayedMonth && d.day === todayDay;
              return (
                <div
                  key={d.day}
                  title={hasSales ? `${d.count} vente(s) — ${formatMoney(d.total)}` : `${d.day} — aucune vente`}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center rounded-[5px] transition-transform hover:scale-[1.05] sm:h-14 xl:h-16",
                    hasSales ? "text-stone-900" : "text-stone-500 dark:text-stone-300",
                  )}
                  style={{ background: hasSales ? BI.gold : BI.goldSoft, ...(isToday ? { outline: `2px solid ${BI.crimson}`, outlineOffset: "1px" } : {}) }}
                >
                  <span className="text-[11px] font-bold leading-none sm:text-[13px]">{d.day}</span>
                  {hasSales && (
                    <span className="mt-0.5 text-[8.5px] font-semibold leading-none text-stone-700 sm:text-[10.5px]">
                      {fmtAxis(d.total)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BI.gold }} aria-hidden /> Jour avec ventes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BI.goldSoft }} aria-hidden /> Sans vente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] outline outline-2" style={{ background: BI.goldSoft, outlineColor: BI.crimson }} aria-hidden /> Aujourd'hui
            </span>
            <span className="ml-auto font-semibold">
              {MONTH_LABELS[calMonthIdx]} {calYear}
            </span>
          </div>
        </BiCard>

        {/* ─── Nombre par tranche de facturation (barres horizontales crimson) ─── */}
        <BiCard title="Nombre par tranche de facturation">
          <div className="flex h-full flex-col justify-center gap-3 py-1 sm:gap-3.5">
            {stats.tranches.map((t) => {
              const pct = (t.count / maxTranche) * 100;
              const barPct = Math.max(t.count > 0 ? 2.5 : 0.8, pct);
              const wide = pct >= 16;
              return (
                <div key={t.label} className="flex items-center gap-2.5" title={`${t.count} facture(s) — ${formatMoney(t.total)}`}>
                  <span className="w-[4.6rem] shrink-0 text-right text-[10px] font-bold text-stone-500 sm:w-20 sm:text-[11px] dark:text-stone-400">
                    {t.label}
                  </span>
                  <div className="relative h-6 flex-1 sm:h-7">
                    <div
                      className="absolute inset-y-0 left-0 flex items-center justify-end rounded-[3px] pr-2 transition-all"
                      style={{ width: `${barPct}%`, background: BI.crimson }}
                    >
                      {wide && <span className="text-[11px] font-bold text-white">{t.count}</span>}
                    </div>
                    {!wide && (
                      <span
                        className="absolute inset-y-0 flex items-center text-[11px] font-bold text-stone-700 dark:text-stone-200"
                        style={{ left: `calc(${barPct}% + 6px)` }}
                      >
                        {t.count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-center text-[10px] text-stone-400">
              Nombre de factures de vente par montant TTC — {stats.year}
            </p>
          </div>
        </BiCard>
      </div>

      {/* ═══ Top 5 clients + Total Revenue par mois (pleine largeur) ════════ */}
      <div className="grid gap-3.5 sm:gap-4">
        {/* ─── Top 5 - Revenue par client (barres verticales orange) ─── */}
        <BiCard
          title="Top 5 - Revenue par client"
          right={<DetailsPill color={BI.orange} onClick={() => setClientsOpen(true)} />}
        >
          <VBars items={top5Clients} color={BI.orange} emptyLabel="Aucune vente enregistrée." />
        </BiCard>

        {/* ─── Total Revenue par mois (barres verticales teal) ─── */}
        <BiCard
          title={
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" style={{ color: BI.teal }} aria-hidden />
              Total Revenue par mois
            </span>
          }
          right={<DetailsPill color={BI.teal} onClick={() => setMonthsOpen(true)} />}
        >
          <VBars items={monthlyBars} color={BI.teal} emptyLabel="Aucune vente enregistrée." />
        </BiCard>
      </div>

      {/* ═══ Widgets CRM existants (prochaine action, objectif du mois) ═════ */}
      <NextActionWidget onNavigate={onNavigate} />
      <MonthlyGoalCard isAdmin={isAdmin} />

      {/* ═══ Dernières factures + statut des factures (pleine largeur) ══════ */}
      <div className="grid gap-3.5 sm:gap-4">
        <BiCard
          title="Dernières factures"
          right={
            <button
              type="button"
              onClick={() => onNavigate("factures")}
              className="rounded-full border-2 px-4 py-0.5 text-xs font-bold transition-transform hover:scale-[1.04]"
              style={{ borderColor: biNavy, color: biNavy }}
            >
              Voir tout
            </button>
          }
        >
          <div className="overflow-x-auto">
            {stats.recentInvoices.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-400">Aucune facture.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#333F50] hover:bg-[#333F50]">
                    <TableHead className="h-9 rounded-tl-lg text-white">N°</TableHead>
                    <TableHead className="h-9 text-white">Client</TableHead>
                    <TableHead className="h-9 text-white">Paiement</TableHead>
                    <TableHead className="h-9 text-right text-white">Montant</TableHead>
                    <TableHead className="h-9 rounded-tr-lg text-right text-white">PDF</TableHead>
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
                          className="inline-flex text-stone-400 transition-colors hover:text-[#D6455F]"
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
          </div>
        </BiCard>

        {/* Statut des factures (donut) */}
        <BiCard title="Statut des factures">
          {donutData.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-400">Aucune facture enregistrée.</p>
          ) : (
            <>
              <div className="relative mx-auto h-44 max-w-[220px] sm:h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="95%" paddingAngle={3} strokeWidth={0}>
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
                  <span className="text-3xl font-extrabold tabular-nums text-stone-800 dark:text-stone-100">{paidPct}%</span>
                  <span className="text-[11px] text-stone-400">payées</span>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
                      {d.name}
                    </span>
                    <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-100">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </BiCard>
      </div>

      {/* ═══ Revenu par catégorie + alertes de stock (pleine largeur) ═══════ */}
      <div className="grid gap-3.5 sm:gap-4">
        <BiCard
          title="Revenu par catégorie"
          right={
            <button
              type="button"
              onClick={() => onNavigate("produits")}
              className="rounded-full border-2 px-4 py-0.5 text-xs font-bold transition-transform hover:scale-[1.04]"
              style={{ borderColor: BI.orange, color: BI.orange }}
            >
              Détails
            </button>
          }
        >
          {stats.topCategories.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Aucune vente enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {stats.topCategories.slice(0, 5).map((c) => (
                <div key={c.category} className="flex items-center gap-2.5" title={`${c.label} : ${formatMoney(c.total)}`}>
                  <span className="w-24 shrink-0 truncate text-right text-[10px] font-bold text-stone-500 sm:w-28 sm:text-[11px]" title={c.label}>
                    {c.label}
                  </span>
                  <div className="relative h-5 flex-1">
                    <div
                      className="absolute inset-y-0 left-0 flex items-center justify-end rounded-[3px] pr-2 transition-all"
                      style={{ width: `${Math.max(2, (c.total / maxCategory) * 100)}%`, background: BI.orange }}
                    >
                      <span className="text-[10px] font-bold text-white">{fmtAxis(c.total)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BiCard>

        <BiCard
          title={
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" style={{ color: BI.orange }} aria-hidden />
              Alertes de stock
            </span>
          }
          right={
            <button
              type="button"
              onClick={() => onNavigate("produits")}
              className="rounded-full border-2 px-4 py-0.5 text-xs font-bold transition-transform hover:scale-[1.04]"
              style={{ borderColor: biNavy, color: biNavy }}
            >
              Produits
            </button>
          }
        >
          {stats.lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Tous les stocks sont au niveau. 👍</p>
          ) : (
            <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600">
              {stats.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-xs text-stone-400">
                      Seuil : {p.minStock} {p.unit}
                    </p>
                  </div>
                  <span
                    className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold text-white"
                    style={{ background: BI.crimson }}
                  >
                    {p.stock} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BiCard>
      </div>

      {/* ═══ Accès rapides ══════════════════════════════════════════════════ */}
      <div className="grid gap-3.5 sm:grid-cols-3 sm:gap-4">
        <BiQuickLink
          label="Total clients"
          value={String(stats.clientCount)}
          icon={ContactRound}
          color={BI.orange}
          onClick={() => onNavigate("clients")}
        />
        <BiQuickLink
          label="Produits au catalogue"
          value={String(stats.productCount)}
          icon={Boxes}
          color={BI.teal}
          onClick={() => onNavigate("produits")}
        />
        <BiQuickLink
          label="Commandes en attente"
          value={String(stats.pendingOrders)}
          icon={AlertTriangle}
          color={BI.crimson}
          onClick={() => onNavigate("commandes")}
        />
      </div>

      {/* ═══ Dialog « Détails » : top clients (jusqu'à 10) ══════════════════ */}
      <Dialog open={clientsOpen} onOpenChange={setClientsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-left">Top clients — {stats.year}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600">
            {stats.topClients.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">Aucune vente enregistrée.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F09A3E] hover:bg-[#F09A3E]">
                    <TableHead className="h-9 text-white">#</TableHead>
                    <TableHead className="h-9 text-white">Client</TableHead>
                    <TableHead className="h-9 text-right text-white">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topClients.map((c, i) => (
                    <TableRow key={c.name}>
                      <TableCell className="text-xs font-bold tabular-nums text-stone-400">{i + 1}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs font-semibold" title={c.name}>
                        {c.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-bold tabular-nums">
                        {formatMoney(c.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-2"
            style={{ borderColor: BI.orange, color: BI.orange }}
            onClick={() => {
              setClientsOpen(false);
              onNavigate("clients");
            }}
          >
            Gérer les clients
          </Button>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog « Détails » : revenue par mois (12 mois) ════════════════ */}
      <Dialog open={monthsOpen} onOpenChange={setMonthsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-left">Total Revenue par mois — {stats.year}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#17AFA5] hover:bg-[#17AFA5]">
                  <TableHead className="h-9 text-white">Mois</TableHead>
                  <TableHead className="h-9 text-right text-white">Facturé</TableHead>
                  <TableHead className="h-9 text-right text-white">Encaissé</TableHead>
                  <TableHead className="h-9 text-right text-white">Reste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.monthlyRevenue.map((m) => (
                  <TableRow key={m.monthKey}>
                    <TableCell className="text-xs font-semibold">{m.month}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{formatMoney(m.total)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{formatMoney(m.paid)}</TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right text-xs font-semibold tabular-nums",
                        m.total - m.paid > 0 ? "text-[#D6455F]" : "text-stone-400",
                      )}
                    >
                      {formatMoney(m.total - m.paid)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-stone-50 font-bold dark:bg-stone-800/60">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{formatMoney(monthsTotal)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{formatMoney(monthsPaidTotal)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-[#D6455F]">
                    {formatMoney(monthsTotal - monthsPaidTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-2"
            style={{ borderColor: BI.teal, color: BI.teal }}
            onClick={() => {
              setMonthsOpen(false);
              onNavigate("factures");
            }}
          >
            Voir les factures
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
