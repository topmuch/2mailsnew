"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  Contact,
  FileSignature,
  FileText,
  FolderKanban,
  Globe2,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Luggage,
  Mail,
  Menu,
  NotebookPen,
  Package,
  ScanLine,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  UserPlus,
  Users2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoriesProvider } from "@/components/categories-provider";
import { DashboardView } from "@/components/dashboard-view";
import { InvoicesView } from "@/components/invoices-view";
import { ClientsView } from "@/components/clients-view";
import { ProductsView } from "@/components/products-view";
import { PurchasesView } from "@/components/purchases-view";
import { OrdersView } from "@/components/orders-view";
import { ReportsView } from "@/components/reports-view";
import { SuppliersView } from "@/components/suppliers-view";
import { StockMovementsView } from "@/components/stock-movements-view";
import { AuditView } from "@/components/audit-view";
import { UsersView } from "@/components/users-view";
import { SettingsView } from "@/components/settings-view";
import { LoginView } from "@/components/login-view";
import MailView from "@/components/mail-view";
import CalendarView from "@/components/calendar-view";
import { QuickAddButton } from "@/components/quick-add-button";
import BlogNotesView from "@/components/blog-notes-view";
import FavoritesView from "@/components/favorites-view";
import CrmDashboardView from "@/components/crm/crm-dashboard-view";
import CrmItemsView from "@/components/crm/crm-items-view";
import CrmClientsView from "@/components/crm/crm-clients-view";
import CrmAutomationsView from "@/components/crm/crm-automations-view";
import CrmTasksView from "@/components/crm/crm-tasks-view";
import CrmCoachView from "@/components/crm/crm-coach-view";
import CrmLeadsView from "@/components/crm/crm-leads-view";
import CrmProjectsView from "@/components/crm/crm-projects-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalSearch, GlobalSearchTrigger } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { useSettingsStore } from "@/lib/settings-store";
import { authFetch, clearSession, getCachedUser, verifySession } from "@/lib/auth-client";
import type { AuthUser } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

type ViewId =
  | "dashboard"
  | "factures"
  | "proforma"
  | "commandes"
  | "clients"
  | "rapports"
  | "calendrier"
  | "mails"
  | "blog-notes"
  | "favoris"
  | "crm"
  | "crm-qrbags"
  | "crm-qrtags"
  | "crm-clients"
  | "crm-leads"
  | "crm-tasks"
  | "crm-projects"
  | "crm-automations"
  | "crm-coach"
  | "achats"
  | "fournisseurs"
  | "produits"
  | "mouvements"
  | "utilisateurs"
  | "audit"
  | "parametres";

const NAV: {
  id: ViewId;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  adminOnly?: boolean;
}[] = [
  // ─── Pilotage ───
  { id: "dashboard", label: "Tableau de bord", short: "Dashboard", icon: LayoutDashboard, section: "Pilotage" },
  { id: "rapports", label: "Rapports de vente", short: "Rapports", icon: BarChart3, section: "Pilotage" },
  { id: "calendrier", label: "Calendrier", short: "Calendrier", icon: CalendarDays, section: "Pilotage" },
  // ─── CRM Unifié (qrtags.pro + qrbags.com + pipeline commercial) ───
  { id: "crm", label: "CRM — Vue d'ensemble", short: "CRM Unifié", icon: Globe2, section: "CRM Unifié" },
  { id: "crm-leads", label: "Leads (pipeline commercial)", short: "Leads", icon: UserPlus, section: "CRM Unifié" },
  { id: "crm-clients", label: "Clients CRM", short: "Clients CRM", icon: Contact, section: "CRM Unifié" },
  { id: "crm-tasks", label: "Tâches CRM", short: "Tâches", icon: ListChecks, section: "CRM Unifié" },
  { id: "crm-projects", label: "Projets (dossiers clients)", short: "Projets", icon: FolderKanban, section: "CRM Unifié" },
  { id: "crm-qrbags", label: "Suivi QR Bags (qrbags.com)", short: "QR Bags", icon: Luggage, section: "CRM Unifié" },
  { id: "crm-qrtags", label: "Suivi QR Tags (qrtags.pro)", short: "QR Tags", icon: ScanLine, section: "CRM Unifié" },
  { id: "crm-automations", label: "Automatisations (rapports & rappels)", short: "Automatisations", icon: CalendarClock, section: "CRM Unifié" },
  { id: "crm-coach", label: "Coach Virtuel", short: "Coach Virtuel", icon: Bot, section: "CRM Unifié" },
  { id: "mails", label: "Boîte mail", short: "Boîte mail", icon: Mail, section: "Communication" },
  // ─── Notes & Favoris ───
  { id: "blog-notes", label: "Blog note (notes partagées)", short: "Blog note", icon: NotebookPen, section: "Notes & Favoris" },
  { id: "favoris", label: "Favoris (liens internet)", short: "Favoris", icon: Star, section: "Notes & Favoris" },
  // ─── Ventes ───
  { id: "factures", label: "Factures", short: "Factures", icon: FileText, section: "Ventes" },
  { id: "proforma", label: "Factures proforma", short: "Proforma", icon: FileSignature, section: "Ventes" },
  { id: "commandes", label: "Commandes prévisionnelles", short: "Commandes", icon: ClipboardList, section: "Ventes" },
  { id: "clients", label: "Clients", short: "Clients", icon: Users2, section: "Ventes" },
  // ─── Achats & stock ───
  { id: "achats", label: "Factures d'achat", short: "Achats", icon: ShoppingBag, section: "Achats & stock" },
  { id: "fournisseurs", label: "Fournisseurs", short: "Fournisseurs", icon: Truck, section: "Achats & stock" },
  { id: "produits", label: "Produits & stock", short: "Produits", icon: Package, section: "Achats & stock" },
  { id: "mouvements", label: "Mouvements de stock", short: "Mouvements", icon: ArrowLeftRight, section: "Achats & stock" },
  // ─── Administration (admin uniquement) ───
  { id: "utilisateurs", label: "Utilisateurs & rôles", short: "Utilisateurs", icon: ShieldCheck, section: "Administration", adminOnly: true },
  { id: "audit", label: "Journal d'audit", short: "Audit", icon: History, section: "Administration", adminOnly: true },
  { id: "parametres", label: "Paramètres société", short: "Paramètres", icon: SettingsIcon, section: "Administration", adminOnly: true },
];

const NAV_SECTIONS_KEY = "2mails-nav-sections";

/** Titre de la section correspondant à une vue (fallback « Pilotage »). */
const sectionOf = (id: ViewId) => NAV.find((i) => i.id === id)?.section ?? "Pilotage";

function NavItems({
  active,
  onSelect,
  isAdmin,
  openSections,
  onToggleSection,
  onToggleAll,
  className,
}: {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  isAdmin: boolean;
  openSections: Record<string, boolean>;
  onToggleSection: (title: string) => void;
  onToggleAll: () => void;
  className?: string;
}) {
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);
  // Regroupe les onglets par section, en conservant l'ordre déclaré dans NAV
  const sections: { title: string; items: typeof NAV }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.title === item.section) {
      last.items.push(item);
    } else {
      sections.push({ title: item.section, items: [item] });
    }
  }
  const allOpen = sections.length > 0 && sections.every((s) => openSections[s.title]);
  return (
    <nav className={cn("space-y-3", className)} aria-label="Navigation principale">
      <div className="flex items-center justify-end px-3">
        <button
          type="button"
          onClick={onToggleAll}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
          aria-label={allOpen ? "Replier toutes les sections" : "Déplier toutes les sections"}
        >
          {allOpen ? <ChevronsDownUp className="h-3 w-3" aria-hidden /> : <ChevronsUpDown className="h-3 w-3" aria-hidden />}
          {allOpen ? "Replier" : "Tout déplier"}
        </button>
      </div>
      {sections.map((section) => {
        const isOpen = !!openSections[section.title];
        const hasActive = section.items.some((item) => item.id === active);
        return (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => onToggleSection(section.title)}
              aria-expanded={isOpen}
              title={isOpen ? `Replier « ${section.title} »` : `Déplier « ${section.title} »`}
              className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <ChevronDown
                className={cn("h-3 w-3 shrink-0 transition-transform duration-200", !isOpen && "-rotate-90")}
                aria-hidden
              />
              <span className="truncate">{section.title}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {!isOpen && hasActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary shadow-sm" aria-label="Section en cours" />
                )}
                <span className="rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[9px] font-bold text-sidebar-foreground/70">
                  {section.items.length}
                </span>
              </span>
            </button>
            {/* Contenu repliable (animation via grid-rows, retiré du focus quand fermé) */}
            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden" inert={!isOpen}>
                <div className="space-y-1 pb-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        title={item.label}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-all text-left",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md font-bold nav-luxe-active"
                            : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function CompanyLogo({ size = 40 }: { size?: number }) {
  const settings = useSettingsStore((s) => s.settings);
  if (settings?.logo) {
     
    return <img src={settings.logo} alt="Logo 2mails" className="object-contain rounded-lg bg-white p-1" style={{ height: size * 0.9, width: size }} />;
  }
  return (
    <Image
      src="/logo-2mails.png"
      alt="Logo 2mails"
      width={size}
      height={Math.round(size * 0.854)}
      className="object-contain rounded-lg bg-white p-1"
      style={{ height: `${size * 0.9}px`, width: "auto" }}
    />
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next !== confirm) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Mot de passe modifié avec succès" });
      onOpenChange(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Changer mon mot de passe</DialogTitle>
          <DialogDescription>Choisissez un mot de passe d&apos;au moins 6 caractères.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Mot de passe actuel</Label>
            <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-next">Nouveau mot de passe</Label>
            <Input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirmer</Label>
            <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving || !current || next.length < 6}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            Modifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [pwOpen, setPwOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-full border border-sidebar-border bg-sidebar py-1 pl-1 pr-2.5 text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            aria-label="Menu du compte"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-bold text-white ring-1 ring-white/30"
              aria-hidden
            >
              {initials}
            </span>
            <span className="hidden sm:block text-left leading-tight">
              <span className="block max-w-32 truncate text-xs font-semibold">{user.name}</span>
              <span className="block text-[10px] text-white/80">
                {user.role === "ADMIN" ? "Administrateur" : "Employé"}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-muted-foreground font-normal">@{user.username}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPwOpen(true)}>
            <KeyRound className="h-4 w-4" aria-hidden /> Changer le mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}

export function AppShell() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authState, setAuthState] = useState<"loading" | "anon" | "auth">("loading");
  // Signal : ouvrir directement la page « Nouvelle facture » (bouton du tableau de bord)
  const [pendingNewInvoice, setPendingNewInvoice] = useState(false);
  const { settings, load: loadSettings } = useSettingsStore();
  // Évite la mismatch d'ID Radix (useId) entre SSR et client au premier rendu
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  // Sections de navigation ouvertes (accordéons, persistées en localStorage).
  // La section de la vue active est toujours visible pour ne jamais perdre sa position.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const stored: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(NAV_SECTIONS_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(stored, parsed);
      }
    } catch {
      /* stockage indisponible (SSR / navigation privée) : état par défaut */
    }
    stored[sectionOf("dashboard")] = true;
    return stored;
  });

  useEffect(() => {
    loadSettings();
    verifySession().then((u) => {
      if (u) {
        setUser(u);
        setAuthState("auth");
      } else {
        setAuthState("anon");
      }
    });
  }, [loadSettings]);

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setAuthState("anon");
  };

  const select = (id: ViewId) => {
    setView(id);
    // Ouvre automatiquement la section de la vue atteinte (recherche globale,
    // notifications, tableau de bord…) pour que sa position reste visible
    setOpenSections((prev) => {
      const section = sectionOf(id);
      if (prev[section]) return prev;
      const next = { ...prev, [section]: true };
      try {
        localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  };

  // Depuis le tableau de bord : bascule sur Factures puis ouvre la page de création
  const newInvoice = () => {
    setPendingNewInvoice(true);
    select("factures");
  };

  // ─── Écran de chargement de session ───────────────────────────────────────
  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl theme-toggle-luxe">
            <Loader2 className="h-7 w-7 animate-spin text-white" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">Chargement de votre session…</p>
        </div>
      </div>
    );
  }

  // ─── Écran de connexion ───────────────────────────────────────────────────
  if (authState === "anon" || !user) {
    return <LoginView settings={settings} onSuccess={(u) => { setUser(u); setAuthState("auth"); setView("dashboard"); }} />;
  }

  const isAdmin = user.role === "ADMIN";
  const companyName = settings?.nomSociete ?? "2MAILS";
  const companyTagline = settings?.tagline ?? "";

  // ─── Mode maintenance : les non-admins voient un écran de blocage ──────────
  if (settings?.maintenanceMode && !isAdmin) {
    return (
      <MaintenanceScreen
        onLogout={handleLogout}
        companyName={companyName}
        telephone={settings.telephone}
        email={settings.email}
      />
    );
  }

  // Ouvre / referme une section de la sidebar (accordéon persistant)
  const toggleNavSection = (title: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Tout déplier / replier (en gardant la section active visible)
  const toggleAllNavSections = () => {
    setOpenSections((prev) => {
      const titles: string[] = [];
      for (const item of NAV) {
        if (item.adminOnly && !isAdmin) continue;
        if (!titles.includes(item.section)) titles.push(item.section);
      }
      const allOpen = titles.every((t) => prev[t]);
      const next: Record<string, boolean> = {};
      for (const t of titles) next[t] = allOpen ? t === sectionOf(view) : true;
      try {
        localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <CategoriesProvider>
      <div
        className={cn(
          "min-h-screen flex flex-col",
          view === "mails" && "lg:h-dvh lg:overflow-hidden"
        )}
      >
      {/* Header mobile */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-2.5 min-w-0">
          <CompanyLogo size={34} />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{companyName}</p>
            <p className="text-[10px] text-sidebar-foreground/70 truncate">Facturation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearchTrigger className="h-9 w-9 justify-center px-0 md:h-9 md:w-auto md:justify-start md:px-3" />
          <NotificationBell onNavigate={select} />
          <ThemeToggle />
          {mounted && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                  aria-label="Ouvrir le menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-sidebar text-sidebar-foreground border-sidebar-border w-64 p-4 overflow-y-auto">
                <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                <div className="flex items-center gap-2.5 mb-5">
                  <CompanyLogo size={38} />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{companyName}</p>
                    <p className="text-[10px] opacity-70 truncate">{companyTagline}</p>
                  </div>
                </div>
                <NavItems
                  active={view}
                  onSelect={select}
                  isAdmin={isAdmin}
                  openSections={openSections}
                  onToggleSection={toggleNavSection}
                  onToggleAll={toggleAllNavSections}
                />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>

      <div className={cn("flex flex-1", view === "mails" && "lg:min-h-0 lg:overflow-hidden")}>
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <div className="flex items-center gap-3 px-4 py-5">
            <CompanyLogo size={46} />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{companyName}</p>
              <p className="text-[10px] text-sidebar-foreground/70 leading-tight mt-0.5 line-clamp-2">
                {companyTagline}
              </p>
            </div>
          </div>
          <div className="px-3 pb-4 flex-1 overflow-y-auto">
            <NavItems
              active={view}
              onSelect={select}
              isAdmin={isAdmin}
              openSections={openSections}
              onToggleSection={toggleNavSection}
              onToggleAll={toggleAllNavSections}
            />
          </div>
          <div className="px-4 py-4 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
            {settings?.telephone && <p>{settings.telephone}</p>}
            {settings?.email && <p className="truncate">{settings.email}</p>}
          </div>
        </aside>

        {/* Contenu */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Barre supérieure desktop : toggle thème + compte */}
          <div className="hidden lg:flex items-center justify-end gap-3 border-b border-border/70 bg-background/80 backdrop-blur px-6 py-2.5">
            <Badge variant="outline" className="border-primary/40 text-primary font-medium">
              {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </Badge>
            <div className="flex-1" />
            <GlobalSearchTrigger />
            <NotificationBell onNavigate={select} />
            <ThemeToggle />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>

          <main className="flex min-h-0 flex-1 min-w-0 flex-col bg-background">
            {view === "mails" ? (
              /* Boîte mail : occupe toute la page (design premium 3 volets) */
              <MailView />
            ) : (
            <div className="w-full min-w-0 mx-auto max-w-6xl px-3 sm:px-6 py-5 sm:py-7 pb-10">
              {view === "dashboard" && (
                <DashboardView onNavigate={(v) => select(v as ViewId)} onNewInvoice={newInvoice} isAdmin={isAdmin} />
              )}
              {view === "factures" && (
                <InvoicesView
                  type="VENTE"
                  autoOpenNew={pendingNewInvoice}
                  onAutoOpenNewConsumed={() => setPendingNewInvoice(false)}
                />
              )}
              {view === "proforma" && <InvoicesView type="PROFORMA" />}
              {view === "commandes" && <OrdersView />}
              {view === "achats" && <PurchasesView />}
              {view === "fournisseurs" && <SuppliersView />}
              {view === "clients" && <ClientsView />}
              {view === "blog-notes" && <BlogNotesView />}
              {view === "favoris" && <FavoritesView />}
              {view === "rapports" && <ReportsView />}
              {view === "calendrier" && <CalendarView />}
              {view === "crm" && <CrmDashboardView isAdmin={isAdmin} />}
              {view === "crm-qrbags" && <CrmItemsView platform="QRBAGS" />}
              {view === "crm-qrtags" && <CrmItemsView platform="QRTAGS" />}
              {view === "crm-clients" && <CrmClientsView />}
              {view === "crm-tasks" && <CrmTasksView isAdmin={isAdmin} />}
              {view === "crm-automations" && <CrmAutomationsView isAdmin={isAdmin} />}
              {view === "crm-coach" && <CrmCoachView isAdmin={isAdmin} />}
              {view === "crm-leads" && <CrmLeadsView isAdmin={isAdmin} />}
              {view === "crm-projects" && <CrmProjectsView isAdmin={isAdmin} />}
              {view === "produits" && <ProductsView />}
              {view === "mouvements" && <StockMovementsView />}
              {view === "utilisateurs" && (isAdmin ? <UsersView currentUser={user} /> : <RestrictedCard />)}
              {view === "audit" && (isAdmin ? <AuditView /> : <RestrictedCard />)}
              {view === "parametres" && (isAdmin ? <SettingsView /> : <RestrictedCard />)}
            </div>
            )}
          </main>
        </div>
      </div>

      {/* Bouton flottant « Ajout rapide » (client / tâche / RDV / note) */}
      <QuickAddButton />

      {/* Recherche globale (palette Ctrl+K) */}
      <GlobalSearch onNavigate={select} />

      {/* Footer collant */}
      <footer className="mt-auto border-t border-sidebar-border bg-sidebar text-sidebar-foreground/75">
        <div className="mx-auto max-w-6xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
          <p className="font-semibold text-sidebar-foreground">
            © {new Date().getFullYear()} {companyName}
            {companyTagline ? ` — ${companyTagline}` : ""}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
            {settings?.adresse && <span>{settings.adresse}</span>}
            {settings?.telephone && (
              <>
                <span aria-hidden>•</span>
                <span>{settings.telephone}</span>
              </>
            )}
            {settings?.rc && (
              <>
                <span aria-hidden>•</span>
                <span>RC : {settings.rc}</span>
              </>
            )}
            {settings?.ninea && (
              <>
                <span aria-hidden>•</span>
                <span>NINEA : {settings.ninea}</span>
              </>
            )}
          </p>
        </div>
      </footer>
      </div>
    </CategoriesProvider>
  );
}

function RestrictedCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center">
      <ShieldCheck className="h-10 w-10 text-destructive/60" aria-hidden />
      <p className="font-semibold">Accès réservé à l&apos;administrateur</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Votre rôle d&apos;employé ne permet pas d&apos;accéder à cette section. Contactez l&apos;administrateur de la société.
      </p>
    </div>
  );
}

// ─── Écran de mode maintenance (non-admins) ──────────────────────────────────

function MaintenanceScreen({
  onLogout,
  companyName,
  telephone,
  email,
}: {
  onLogout: () => void;
  companyName: string;
  telephone?: string;
  email?: string;
}) {
  // Re-vérifie automatiquement toutes les 30 s — l'accès revient dès que
  // l'administrateur désactive le mode maintenance (bouton « Réessayer » = immédiat).
  const load = useSettingsStore((s) => s.load);
  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/60">
          <Wrench className="h-8 w-8 animate-pulse text-amber-600 dark:text-amber-400" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-bold">Application en maintenance</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {companyName} effectue une mise à jour. L&apos;application sera de nouveau
          disponible dans quelques instants — merci de votre patience.
        </p>
        {(telephone || email) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Besoin urgent de nous joindre ?{" "}
            {telephone && <span className="font-medium text-foreground">{telephone}</span>}
            {telephone && email ? " · " : ""}
            {email && <span className="font-medium text-foreground">{email}</span>}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => load()} className="min-h-11 gap-2">
            <Loader2 className="h-4 w-4" aria-hidden /> Réessayer
          </Button>
          <Button variant="ghost" onClick={onLogout} className="min-h-11 gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
          </Button>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground/70">
        Cette page se met à jour automatiquement toutes les 30 secondes.
      </p>
    </div>
  );
}
