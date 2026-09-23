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
  ClipboardList,
  Contact,
  FileSignature,
  FileText,
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
  Package,
  QrCode,
  ScanLine,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users2,
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
import QrTagsView from "@/components/qr-view";
import CrmDashboardView from "@/components/crm/crm-dashboard-view";
import CrmItemsView from "@/components/crm/crm-items-view";
import CrmClientsView from "@/components/crm/crm-clients-view";
import CrmAutomationsView from "@/components/crm/crm-automations-view";
import CrmTasksView from "@/components/crm/crm-tasks-view";
import CrmCoachView from "@/components/crm/crm-coach-view";
import { ThemeToggle } from "@/components/theme-toggle";
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
  | "qrtags"
  | "crm"
  | "crm-qrbags"
  | "crm-qrtags"
  | "crm-clients"
  | "crm-automations"
  | "crm-tasks"
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
  // ─── CRM Unifié (qrtags.pro + qrbags.com) ───
  { id: "crm", label: "CRM — Vue d'ensemble", short: "CRM Unifié", icon: Globe2, section: "CRM Unifié" },
  { id: "crm-qrbags", label: "Suivi QR Bags (qrbags.com)", short: "QR Bags", icon: Luggage, section: "CRM Unifié" },
  { id: "crm-qrtags", label: "Suivi QR Tags (qrtags.pro)", short: "QR Tags", icon: ScanLine, section: "CRM Unifié" },
  { id: "crm-clients", label: "Clients CRM", short: "Clients CRM", icon: Contact, section: "CRM Unifié" },
  { id: "crm-tasks", label: "Tâches CRM", short: "Tâches", icon: ListChecks, section: "CRM Unifié" },
  { id: "crm-automations", label: "Automatisations (rapports & rappels)", short: "Automatisations", icon: CalendarClock, section: "CRM Unifié" },
  { id: "crm-coach", label: "Coach Virtuel", short: "Coach Virtuel", icon: Bot, section: "CRM Unifié" },
  { id: "mails", label: "Boîte mail", short: "Boîte mail", icon: Mail, section: "Communication" },
  { id: "qrtags", label: "QR & Étiquettes", short: "QR Tags", icon: QrCode, section: "Communication" },
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

function NavItems({
  active,
  onSelect,
  isAdmin,
  className,
}: {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  isAdmin: boolean;
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
  return (
    <nav className={cn("space-y-4", className)} aria-label="Navigation principale">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/45">
            {section.title}
          </p>
          <div className="space-y-1">
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
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-left",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md font-bold nav-luxe-active"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
      ))}
    </nav>
  );
}

function CompanyLogo({ size = 40 }: { size?: number }) {
  const settings = useSettingsStore((s) => s.settings);
  if (settings?.logo) {
     
    return <img src={settings.logo} alt="Logo de la société" className="object-contain rounded-lg bg-white p-1" style={{ height: size * 0.9, width: size }} />;
  }
  return (
    <Image
      src="/logo-green.png"
      alt="Logo Lampe Fall"
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
            className="flex items-center gap-2.5 rounded-full border border-sidebar-border bg-sidebar-accent/60 py-1 pl-1 pr-2.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            aria-label="Menu du compte"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-500 text-xs font-bold text-white"
              aria-hidden
            >
              {initials}
            </span>
            <span className="hidden sm:block text-left leading-tight">
              <span className="block max-w-32 truncate text-xs font-semibold">{user.name}</span>
              <span className="block text-[10px] text-gold">
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
  const companyName = settings?.nomSociete ?? "LAMPE FALL";
  const companyTagline = settings?.tagline ?? "";

  return (
    <CategoriesProvider>
      <div className="min-h-screen flex flex-col">
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
                <NavItems active={view} onSelect={select} isAdmin={isAdmin} />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>

      <div className="flex flex-1">
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
            <NavItems active={view} onSelect={select} isAdmin={isAdmin} />
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
            <Badge variant="outline" className="border-gold/50 text-gold font-medium">
              {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </Badge>
            <div className="flex-1" />
            <ThemeToggle />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>

          <main className="flex-1 min-w-0 bg-background">
            <div className="mx-auto max-w-6xl px-3 sm:px-6 py-5 sm:py-7 pb-10">
              {view === "dashboard" && (
                <DashboardView onNavigate={(v) => select(v as ViewId)} onNewInvoice={newInvoice} />
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
              {view === "rapports" && <ReportsView />}
              {view === "calendrier" && <CalendarView />}
              {view === "crm" && <CrmDashboardView isAdmin={isAdmin} />}
              {view === "crm-qrbags" && <CrmItemsView platform="QRBAGS" />}
              {view === "crm-qrtags" && <CrmItemsView platform="QRTAGS" />}
              {view === "crm-clients" && <CrmClientsView />}
              {view === "crm-tasks" && <CrmTasksView isAdmin={isAdmin} />}
              {view === "crm-automations" && <CrmAutomationsView isAdmin={isAdmin} />}
              {view === "crm-coach" && <CrmCoachView isAdmin={isAdmin} />}
              {view === "mails" && <MailView />}
              {view === "qrtags" && <QrTagsView />}
              {view === "produits" && <ProductsView />}
              {view === "mouvements" && <StockMovementsView />}
              {view === "utilisateurs" && (isAdmin ? <UsersView currentUser={user} /> : <RestrictedCard />)}
              {view === "audit" && (isAdmin ? <AuditView /> : <RestrictedCard />)}
              {view === "parametres" && (isAdmin ? <SettingsView /> : <RestrictedCard />)}
            </div>
          </main>
        </div>
      </div>

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
