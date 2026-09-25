"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Globe,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { useSettingsStore } from "@/lib/settings-store";

// ─── Hosting — Domaines & renouvellements (Task 46-d) ────────────────────────
// Liste des noms de domaine achetés pour les clients, avec suivi des
// renouvellements (badges d'urgence J-30/J-15/J-2/J), rappels e-mail
// automatiques (scheduler, toutes les 30 min) et bouton WhatsApp wa.me
// prérempli pour relancer le client d'un clic.

interface HostingDomainDto {
  id: string;
  domain: string;
  registrar: string;
  clientName: string | null;
  clientPhone: string | null;
  renewalDate: string; // ISO
  price: number;
  notes: string | null;
  notifiedStages: string; // CSV « 30,15,2,0 »
  daysLeft: number; // calculé par l'API (jours calendaires Africa/Dakar)
}

interface DomainForm {
  domain: string;
  registrar: string;
  clientName: string;
  clientPhone: string;
  renewalDate: string; // yyyy-mm-dd (input date)
  price: string;
  notes: string;
}

const EMPTY_FORM: DomainForm = {
  domain: "",
  registrar: "",
  clientName: "",
  clientPhone: "",
  renewalDate: "",
  price: "",
  notes: "",
};

// ── Formatage (fr-FR / fr-SN, fuseau Dakar) ──────────────────────────────────

const fmtDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const fmtDateLong = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtPrice = new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 });

function formatDate(iso: string): string {
  try {
    return fmtDate.format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPrice(price: number): string {
  if (!price || price <= 0) return "—";
  return `${fmtPrice.format(price)} FCFA`;
}

/** ISO → yyyy-mm-dd (parties UTC ; Dakar = UTC+0, date saisie via input date). */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// ── Urgence & badges ─────────────────────────────────────────────────────────

interface Urgency {
  label: string;
  className: string;
}

function urgencyOf(daysLeft: number): Urgency {
  if (daysLeft < 0)
    return { label: "Expiré", className: "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400" };
  if (daysLeft === 0)
    return { label: "Aujourd'hui", className: "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400" };
  if (daysLeft <= 2)
    return { label: `J-${daysLeft}`, className: "border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-400" };
  if (daysLeft <= 15)
    return { label: `J-${daysLeft}`, className: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (daysLeft <= 30)
    return { label: `J-${daysLeft}`, className: "border-yellow-500/30 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" };
  return { label: "À jour", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
}

// ── WhatsApp (wa.me) ─────────────────────────────────────────────────────────

/** Numéro nettoyé pour wa.me : chiffres uniquement (le préfixe pays saisi est conservé). */
function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function whatsappMessage(d: HostingDomainDto, companyName: string): string {
  const date = fmtDateLong.format(new Date(d.renewalDate));
  const name = d.clientName ? d.clientName : "";
  let when: string;
  if (d.daysLeft > 0) {
    when = `dans ${d.daysLeft} jour${d.daysLeft > 1 ? "s" : ""}`;
  } else if (d.daysLeft === 0) {
    when = "aujourd'hui (jour J)";
  } else {
    when = `depuis ${Math.abs(d.daysLeft)} jour${Math.abs(d.daysLeft) > 1 ? "s" : ""}`;
  }
  const prefix = d.daysLeft >= 0 ? "arrive à échéance le" : "a expiré le";
  return (
    `Bonjour${name ? ` ${name}` : ""}, rappel : le domaine ${d.domain} ${prefix} ${date} ` +
    `(${when}). Merci de nous confirmer le renouvellement. — ${companyName}`
  );
}

function whatsappUrl(d: HostingDomainDto, companyName: string): string | null {
  if (!d.clientPhone) return null;
  const cleaned = cleanPhone(d.clientPhone);
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(whatsappMessage(d, companyName))}`;
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function HostingView() {
  const { toast } = useToast();
  const companyName = useSettingsStore((s) => s.settings?.nomSociete || "2MAILS");
  const [domains, setDomains] = useState<HostingDomainDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostingDomainDto | null>(null);
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<HostingDomainDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/hosting");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { domains: HostingDomainDto[] };
      setDomains(json.domains);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les domaines", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Stats rapides
  const stats = useMemo(
    () => ({
      total: domains.length,
      soon: domains.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 30).length,
      expired: domains.filter((d) => d.daysLeft < 0).length,
    }),
    [domains],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: HostingDomainDto) => {
    setEditing(d);
    setForm({
      domain: d.domain,
      registrar: d.registrar ?? "",
      clientName: d.clientName ?? "",
      clientPhone: d.clientPhone ?? "",
      renewalDate: toDateInputValue(d.renewalDate),
      price: d.price > 0 ? String(d.price) : "",
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.domain.trim()) {
      toast({ title: "Le nom de domaine est requis", variant: "destructive" });
      return;
    }
    if (!form.renewalDate) {
      toast({ title: "La date de renouvellement est requise", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        domain: form.domain.trim(),
        registrar: form.registrar.trim(),
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        renewalDate: form.renewalDate,
        price: form.price.trim() === "" ? 0 : Number(form.price),
        notes: form.notes.trim(),
      };
      const res = await authFetch(editing ? `/api/hosting/${editing.id}` : "/api/hosting", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({
        title: editing ? "Domaine modifié" : "Domaine ajouté",
        description:
          editing && form.renewalDate !== toDateInputValue(editing.renewalDate)
            ? "Nouvelle date — les rappels e-mail du cycle ont été réarmés."
            : undefined,
      });
      setDialogOpen(false);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement impossible",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /** Rappel e-mail immédiat (bypass des étapes automatiques). */
  const sendManualReminder = async (d: HostingDomainDto) => {
    setNotifyingId(d.id);
    try {
      const res = await authFetch(`/api/hosting/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      if (json.sent) {
        toast({
          title: "Rappel envoyé",
          description: `E-mail de renouvellement envoyé à ${json.recipient}`,
        });
      } else {
        toast({ title: "Rappel non envoyé", description: json.error ?? "SMTP non configuré", variant: "destructive" });
      }
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Rappel impossible",
        variant: "destructive",
      });
    } finally {
      setNotifyingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await authFetch(`/api/hosting/${deleting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Domaine supprimé" });
      setDeleting(null);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Suppression impossible",
        variant: "destructive",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const openWhatsApp = (d: HostingDomainDto) => {
    const url = whatsappUrl(d, companyName);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /** Étapes déjà notifiées ce cycle (pour l'affichage discret). */
  const stagesSent = (d: HostingDomainDto): string =>
    d.notifiedStages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `J-${s}`)
      .join(" · ");

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md" aria-hidden>
              <Globe className="h-5 w-5" />
            </span>
            Hosting — Domaines &amp; renouvellements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Noms de domaine achetés pour vos clients : échéances, rappels e-mail automatiques (J-30, J-15, J-2, jour J) et relance WhatsApp en un clic.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 text-white hover:bg-emerald-700 shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Ajouter un domaine
        </Button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" aria-hidden>
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none">{loading ? "…" : stats.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">Total domaines suivis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400" aria-hidden>
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none">{loading ? "…" : stats.soon}</p>
              <p className="mt-1 text-xs text-muted-foreground">À renouveler d&apos;ici 30 jours</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400" aria-hidden>
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none">{loading ? "…" : stats.expired}</p>
              <p className="mt-1 text-xs text-muted-foreground">Domaines expirés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Globe className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="font-semibold">Aucun domaine — ajoutez votre premier nom de domaine</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Suivez ici les échéances des domaines achetés pour vos clients : rappels e-mail automatiques à J-30, J-15, J-2 et le jour J, relance WhatsApp d&apos;un clic.
          </p>
          <Button onClick={openCreate} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" aria-hidden /> Ajouter un domaine
          </Button>
        </div>
      ) : (
        <>
          {/* Tableau desktop */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Domaine</TableHead>
                      <TableHead>Registrar</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Renouvellement</TableHead>
                      <TableHead>Prix annuel</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => {
                      const urgency = urgencyOf(d.daysLeft);
                      const sent = stagesSent(d);
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-semibold">{d.domain}</TableCell>
                          <TableCell className="text-muted-foreground">{d.registrar || "—"}</TableCell>
                          <TableCell>
                            {d.clientName ? (
                              <div>
                                <p>{d.clientName}</p>
                                {d.clientPhone && <p className="text-xs text-muted-foreground">{d.clientPhone}</p>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <p>{formatDate(d.renewalDate)}</p>
                            {sent && <p className="text-[11px] text-muted-foreground">Rappels envoyés : {sent}</p>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatPrice(d.price)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={urgency.className}>
                              {urgency.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                className="h-8 bg-[#25D366] px-2.5 text-white hover:bg-[#1da851] disabled:opacity-40"
                                disabled={!d.clientPhone}
                                onClick={() => openWhatsApp(d)}
                                title={
                                  d.clientPhone
                                    ? "Relancer le client sur WhatsApp (message prérempli)"
                                    : "Ajoutez un téléphone WhatsApp au domaine pour activer ce bouton"
                                }
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5"
                                onClick={() => sendManualReminder(d)}
                                disabled={notifyingId === d.id}
                                title="Envoyer maintenant un rappel e-mail"
                              >
                                {notifyingId === d.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <BellRing className="h-4 w-4" aria-hidden />
                                )}
                                Rappel
                              </Button>
                              <button
                                type="button"
                                onClick={() => openEdit(d)}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                                title="Modifier"
                                aria-label={`Modifier le domaine ${d.domain}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(d)}
                                className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                                title="Supprimer"
                                aria-label={`Supprimer le domaine ${d.domain}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Cards mobile */}
          <div className="space-y-2.5 md:hidden">
            {domains.map((d) => {
              const urgency = urgencyOf(d.daysLeft);
              const sent = stagesSent(d);
              const wa = whatsappUrl(d, companyName);
              return (
                <Card key={d.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold" title={d.domain}>
                        {d.domain}
                      </p>
                      <Badge variant="outline" className={`${urgency.className} shrink-0`}>
                        {urgency.label}
                      </Badge>
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Registrar</dt>
                        <dd className="truncate">{d.registrar || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Client</dt>
                        <dd className="truncate text-right">
                          {d.clientName || "—"}
                          {d.clientPhone ? <span className="block text-xs text-muted-foreground">{d.clientPhone}</span> : null}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Renouvellement</dt>
                        <dd className="text-right">{formatDate(d.renewalDate)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Prix annuel</dt>
                        <dd>{formatPrice(d.price)}</dd>
                      </div>
                    </dl>
                    {sent && <p className="mt-2 text-[11px] text-muted-foreground">Rappels envoyés : {sent}</p>}
                    {d.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.notes}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        className="h-9 flex-1 bg-[#25D366] text-white hover:bg-[#1da851] disabled:opacity-40"
                        disabled={!wa}
                        onClick={() => openWhatsApp(d)}
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1"
                        onClick={() => sendManualReminder(d)}
                        disabled={notifyingId === d.id}
                      >
                        {notifyingId === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <BellRing className="h-4 w-4" aria-hidden />
                        )}
                        Rappel e-mail
                      </Button>
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                        title="Modifier"
                        aria-label={`Modifier le domaine ${d.domain}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(d)}
                        className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                        title="Supprimer"
                        aria-label={`Supprimer le domaine ${d.domain}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Éditeur de domaine (ajout / modification) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le domaine" : "Nouveau domaine"}</DialogTitle>
            <DialogDescription>
              Renseignez le domaine acheté, son échéance et le client à relancer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="host-domain">Nom de domaine *</Label>
              <Input
                id="host-domain"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="Ex. 2mails.sn"
                maxLength={253}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="host-registrar">Registrar</Label>
                <Input
                  id="host-registrar"
                  value={form.registrar}
                  onChange={(e) => setForm({ ...form, registrar: e.target.value })}
                  placeholder="Ex. OVH, Namecheap, Gandi…"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-price">Prix annuel (FCFA)</Label>
                <Input
                  id="host-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={500}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="Ex. 15000"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="host-client">Nom du client</Label>
                <Input
                  id="host-client"
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="Ex. Hôtel Terrou-Bi"
                  maxLength={160}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-phone">Téléphone WhatsApp</Label>
                <Input
                  id="host-phone"
                  inputMode="tel"
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  placeholder="Format international ex. 221771234567"
                  maxLength={40}
                />
                <p className="text-[11px] text-muted-foreground">
                  Sans espaces ni « + », avec l&apos;indicatif pays. {form.clientPhone.trim() ? "" : "Sans téléphone, le bouton WhatsApp reste désactivé."}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host-date">Date de renouvellement *</Label>
              <Input
                id="host-date"
                type="date"
                required
                value={form.renewalDate}
                onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
              />
              {editing && (
                <p className="text-[11px] text-muted-foreground">
                  Changer la date réinitialise les rappels e-mail du cycle (J-30, J-15, J-2, jour J repartent de zéro).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host-notes">Notes (facultatif)</Label>
              <Textarea
                id="host-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ex. renouvelé via le compte OVH du client, facture 2026-114…"
                rows={2}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              onClick={save}
              disabled={saving || !form.domain.trim() || !form.renewalDate}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
              {editing ? "Enregistrer" : "Ajouter le domaine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce domaine ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleting?.domain} » sera définitivement supprimé : plus aucun rappel de renouvellement ne sera envoyé pour ce nom de domaine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
