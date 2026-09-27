"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  History,
  Link2,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  X,
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
import { type Settings } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ─── Hosting — Domaines & renouvellements (Task 46-d, étendu Task 49) ────────
// Liste des noms de domaine achetés pour les clients, avec suivi des
// renouvellements (badges d'urgence J-30/J-15/J-2/J), rappels e-mail
// automatiques (scheduler, toutes les 30 min — admin + client paramétrable),
// bouton WhatsApp wa.me prérempli, lien public de renouvellement (paiement
// Wave + « J'ai payé ») et historique des renouvellements.

interface HostingDomainDto {
  id: string;
  domain: string;
  registrar: string;
  clientName: string | null;
  clientPhone: string | null;
  renewalDate: string; // ISO
  price: number;
  notes: string | null;
  notifiedStages: string; // CSV « 30,15,2,0 » (rappels ADMIN)
  daysLeft: number; // calculé par l'API (jours calendaires Africa/Dakar)
  // ── Task 49 : rappel client + paiement en ligne ──────────────────────────
  clientEmail: string | null;
  renewalToken: string | null;
  renewalUrl?: string | null; // calculé par l'API quand un jeton est actif
  paymentUrl: string | null;
  paymentLabel: string | null;
  customReminder: string | null;
  paymentSignalAt: string | null; // ISO — « J'ai payé » (page publique)
  clientNotifiedStages: string; // CSV « 30,15,2,0 » (rappels CLIENT)
  // ── Task 56 : achat de domaine + hébergement ─────────────
  status: string; // ACTIVE (suivi) | PENDING (achat en attente de paiement)
  hasHosting: boolean;
  domainPrice: number;
  hostingPrice: number;
  purchasedAt: string | null; // ISO — fixé quand l'achat est payé (compte à rebours démarré)
}

interface HostingRenewalDto {
  id: string;
  renewedFor: string; // « 2026-2027 »
  amount: number;
  method: string; // Manuel | Wave | Autre
  createdAt: string; // ISO
}

interface DomainForm {
  domain: string;
  registrar: string;
  clientName: string;
  clientPhone: string;
  renewalDate: string; // yyyy-mm-dd (input date)
  price: string;
  notes: string;
  clientEmail: string;
  paymentUrl: string;
  paymentLabel: string;
  customReminder: string;
  // ── Task 56 : achat de domaine + hébergement (création uniquement)
  isPurchase: boolean; // « Nouvel achat » : le client paie avant l'activation
  domainPrice: string; // part domaine (FCFA)
  hostingPrice: string; // part hébergement (FCFA)
}

const EMPTY_FORM: DomainForm = {
  domain: "",
  registrar: "",
  clientName: "",
  clientPhone: "",
  renewalDate: "",
  price: "",
  notes: "",
  clientEmail: "",
  paymentUrl: "",
  paymentLabel: "",
  customReminder: "",
  isPurchase: false,
  domainPrice: "",
  hostingPrice: "",
};

/** Variables du modèle de rappel client (boutons d'insertion). */
const REMINDER_VARIABLES = [
  "{client}",
  "{domaine}",
  "{dateRenouvellement}",
  "{joursRestants}",
  "{prix}",
  "{lienPaiement}",
  "{societe}",
  "{telephone}",
] as const;

const RENEW_METHODS = ["Manuel", "Wave", "Autre"] as const;

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
const fmtDateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar",
  dateStyle: "short",
  timeStyle: "short",
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
  const name = d.clientName ? d.clientName : "";
  // Task 56 — achat en attente de paiement : message adapté (pas encore
  // d'échéance de renouvellement) + lien de paiement s'il est actif.
  if (d.status === "PENDING") {
    const total = d.price > 0 ? `${fmtPrice.format(d.price)} FCFA` : "";
    const contenu = d.hasHosting ? " (hébergement inclus)" : "";
    const lien = d.renewalUrl ? ` Payez directement ici : ${d.renewalUrl}` : "";
    return (
      `Bonjour${name ? ` ${name}` : ""}, votre achat du domaine ${d.domain}${contenu} est enregistré.` +
      `${total ? ` Montant : ${total}.` : ""}${lien} Merci de nous confirmer après paiement. — ${companyName}`
    );
  }
  const date = fmtDateLong.format(new Date(d.renewalDate));
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

// ── Rappels client (Task 49) — affichage + aperçu du modèle ──────────────────

/** Étapes de rappel CLIENT déjà envoyées ce cycle (affichage discret). */
function clientStagesSent(d: HostingDomainDto): string {
  return d.clientNotifiedStages
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `J-${s}`)
    .join(" · ");
}

function escapeHtmlClient(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bouton HTML du lien de paiement (même style que le rendu e-mail serveur). */
function previewPaymentButton(url: string, label: string): string {
  const wave = /wave/i.test(label);
  const bg = wave ? "#1DC8FF" : "#059669";
  const fg = wave ? "#000000" : "#ffffff";
  return `<a href="${escapeHtmlClient(url)}" target="_blank" rel="noopener" style="display:inline-block;margin:14px 0;padding:13px 26px;border-radius:10px;background:${bg};color:${fg};font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;">Renouveler / payer en ligne</a>`;
}

/**
 * Aperçu du mail client : remplacement des variables {…} sur le modèle
 * (ou sur le modèle par défaut du code), fidèle au rendu serveur de
 * buildHostingClientReminder — uniquement avec des valeurs d'exemple.
 */
function buildClientPreview(
  template: string,
  vars: Record<string, string>,
  sampleUrl: string,
  paymentLabel: string,
): string {
  const lienHtml = previewPaymentButton(sampleUrl, paymentLabel);
  const renderLine = (raw: string): string => {
    const line = raw.replace(/\{(\w+)\}/g, (m, key: string) => {
      if (key === "lienPaiement") return m;
      const v = vars[key];
      return v !== undefined ? escapeHtmlClient(v) : m;
    });
    if (line.trim() === "{lienPaiement}") return lienHtml;
    if (line.trim() === "") return `<div style="height:10px;line-height:10px;">&nbsp;</div>`;
    if (line.includes("{lienPaiement}")) {
      return `<p style="margin:0 0 12px;">${line.replace("{lienPaiement}", lienHtml)}</p>`;
    }
    return `<p style="margin:0 0 12px;">${line}</p>`;
  };
  const body = template.trim()
    ? template
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(renderLine)
        .join("\n")
    : [
        renderLine(`Bonjour ${vars.client},`),
        renderLine(""),
        renderLine(
          `Le domaine ${vars.domaine} arrive à échéance le ${vars.dateRenouvellement} (dans ${vars.joursRestants} jours).`,
        ),
        renderLine(`Montant du renouvellement : ${vars.prix}.`),
        renderLine(""),
        lienHtml,
        renderLine("Cordialement,"),
        renderLine(`${vars.societe}${vars.telephone ? ` — ${vars.telephone}` : ""}`),
      ].join("\n");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;">${body}</div>`;
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function HostingView() {
  const { toast } = useToast();
  const companyName = useSettingsStore((s) => s.settings?.nomSociete || "2MAILS");
  const companyPhone = useSettingsStore((s) => s.settings?.telephone || "+221 77 000 00 00");
  const [domains, setDomains] = useState<HostingDomainDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostingDomainDto | null>(null);
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<HostingDomainDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  // ── Task 49 : lien public, paiement signalé, historique, modèle client ──
  const [linkCreatingId, setLinkCreatingId] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ domain: HostingDomainDto; url: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [renewDialog, setRenewDialog] = useState<HostingDomainDto | null>(null);
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMethod, setRenewMethod] = useState<string>("Manuel");
  const [renewBusy, setRenewBusy] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<HostingDomainDto | null>(null);
  const [renewals, setRenewals] = useState<HostingRenewalDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [reminderSubject, setReminderSubject] = useState("");
  const [reminderBody, setReminderBody] = useState("");
  const [adminCopy, setAdminCopy] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      soon: domains.filter((d) => d.status !== "PENDING" && d.daysLeft >= 0 && d.daysLeft <= 30).length,
      expired: domains.filter((d) => d.status !== "PENDING" && d.daysLeft < 0).length,
      pending: domains.filter((d) => d.status === "PENDING").length, // achats à encaisser (Task 56)
    }),
    [domains],
  );

  const openCreate = (purchase = false) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, isPurchase: purchase });
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
      clientEmail: d.clientEmail ?? "",
      paymentUrl: d.paymentUrl ?? "",
      paymentLabel: d.paymentLabel ?? "",
      customReminder: d.customReminder ?? "",
      isPurchase: false, // le statut d'un achat se gère via « Paiement reçu », pas ici
      domainPrice: d.domainPrice > 0 ? String(d.domainPrice) : "",
      hostingPrice: d.hostingPrice > 0 ? String(d.hostingPrice) : "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.domain.trim()) {
      toast({ title: "Le nom de domaine est requis", variant: "destructive" });
      return;
    }
    // Achat (Task 56) : pas d'échéance à saisir, mais au moins un prix.
    if (form.isPurchase) {
      const total = (Number(form.domainPrice) || 0) + (Number(form.hostingPrice) || 0);
      if (total <= 0) {
        toast({ title: "Indiquez le prix du domaine et/ou de l'hébergement", variant: "destructive" });
        return;
      }
    } else if (!form.renewalDate) {
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
        // Achat : la date sera fixée automatiquement (+1 an) au paiement
        ...(form.isPurchase ? {} : { renewalDate: form.renewalDate }),
        // Achat : le serveur calcule le total (domaine + hébergement)
        ...(form.isPurchase ? {} : { price: form.price.trim() === "" ? 0 : Number(form.price) }),
        notes: form.notes.trim(),
        clientEmail: form.clientEmail.trim(),
        paymentUrl: form.paymentUrl.trim(),
        paymentLabel: form.paymentLabel.trim(),
        customReminder: form.customReminder.trim(),
        // ── Task 56 : achat de domaine + hébergement ──
        purchase: !editing && form.isPurchase,
        domainPrice: form.domainPrice.trim() === "" ? 0 : Number(form.domainPrice),
        hostingPrice: form.hostingPrice.trim() === "" ? 0 : Number(form.hostingPrice),
        hasHosting: (Number(form.hostingPrice) || 0) > 0,
      };
      const res = await authFetch(editing ? `/api/hosting/${editing.id}` : "/api/hosting", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({
        title: editing ? "Domaine modifié" : form.isPurchase ? "Achat créé — page de paiement prête" : "Domaine ajouté",
        description:
          editing && form.renewalDate !== toDateInputValue(editing.renewalDate)
            ? "Nouvelle date — les rappels e-mail du cycle ont été réarmés."
            : undefined,
      });
      setDialogOpen(false);
      // Task 56 : un achat vient d'être créé → générer et afficher immédiatement
      // la page de paiement publique (le compte à rebours démarrera au paiement).
      if (!editing && form.isPurchase && json.domain?.id) {
        await openOrCreateLink(json.domain as HostingDomainDto);
      }
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

  // ── Task 49 : lien public, paiement, historique, modèle client ───────────

  /** URL publique complète d'un domaine (renseignée par l'API quand un jeton existe). */
  const renewalUrlOf = (d: HostingDomainDto): string | null => {
    if (!d.renewalToken) return null;
    return d.renewalUrl || `${window.location.origin}/renouvellement/${d.renewalToken}`;
  };

  /** Ouvre le dialogue du lien (si jeton actif) ou crée le jeton d'abord. */
  const openOrCreateLink = async (d: HostingDomainDto) => {
    const existing = renewalUrlOf(d);
    if (existing) {
      setLinkDialog({ domain: d, url: existing });
      return;
    }
    setLinkCreatingId(d.id);
    try {
      const res = await authFetch(`/api/hosting/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-link" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setLinkDialog({ domain: json.domain as HostingDomainDto, url: json.url as string });
      toast({ title: "Lien de renouvellement créé", description: "Envoyez-le au client (WhatsApp, e-mail…)" });
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Création du lien impossible",
        variant: "destructive",
      });
    } finally {
      setLinkCreatingId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copié", description: "Le lien est dans le presse-papiers" });
    } catch {
      toast({ title: "Copie impossible", description: "Sélectionnez le lien et copiez-le manuellement", variant: "destructive" });
    }
  };

  /** Révoque le jeton public du domaine affiché dans le dialogue. */
  const revokeLink = async () => {
    if (!linkDialog) return;
    setLinkBusy(true);
    try {
      const res = await authFetch(`/api/hosting/${linkDialog.domain.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-link" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Lien révoqué", description: "L'ancienne page publique n'est plus accessible." });
      setLinkDialog(null);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Révocation impossible",
        variant: "destructive",
      });
    } finally {
      setLinkBusy(false);
    }
  };

  /** Ouvre le dialogue « Marquer renouvelé » (montant prérempli = prix du domaine). */
  const openRenewDialog = (d: HostingDomainDto) => {
    setRenewAmount(d.price > 0 ? String(d.price) : "");
    setRenewMethod("Manuel");
    setRenewDialog(d);
  };

  /** Confirme le renouvellement OU l'achat (Task 56) : échéance +1 an, rappels réarmés, historique. */
  const confirmRenew = async () => {
    if (!renewDialog) return;
    const isPurchase = renewDialog.status === "PENDING";
    setRenewBusy(true);
    try {
      const res = await authFetch(`/api/hosting/${renewDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm-paid",
          method: renewMethod,
          // Montant saisi dans le dialogue (défaut serveur = prix du domaine)
          amount: renewAmount.trim() === "" ? undefined : Number(renewAmount),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({
        title: isPurchase
          ? "Achat confirmé — compte à rebours démarré"
          : "Domaine renouvelé, échéance repoussée d'un an",
        description: isPurchase
          ? `Échéance fixée au ${formatDate(json.domain?.renewalDate ?? "")} — les rappels de renouvellement sont armés.`
          : undefined,
      });
      setRenewDialog(null);
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Confirmation impossible",
        variant: "destructive",
      });
    } finally {
      setRenewBusy(false);
    }
  };

  /** Ignore le signalement « J'ai payé » sans renouveler. */
  const dismissSignal = async (d: HostingDomainDto) => {
    setDismissingId(d.id);
    try {
      const res = await authFetch(`/api/hosting/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss-paid" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Signalement ignoré" });
      load();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Action impossible",
        variant: "destructive",
      });
    } finally {
      setDismissingId(null);
    }
  };

  /** Ouvre l'historique des renouvellements du domaine. */
  const openHistory = async (d: HostingDomainDto) => {
    setHistoryFor(d);
    setRenewals([]);
    setHistoryLoading(true);
    try {
      const res = await authFetch(`/api/hosting/${d.id}/renewals`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRenewals((json.renewals ?? []) as HostingRenewalDto[]);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger l'historique", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Ouvre le modèle de rappel client (valeurs actuelles depuis /api/settings). */
  const openTemplate = async () => {
    setTemplateOpen(true);
    setTemplateLoading(true);
    try {
      const res = await authFetch("/api/settings");
      const json = (await res.json()) as Settings;
      setReminderSubject(json.hostingReminderSubject ?? "");
      setReminderBody(json.hostingReminderBody ?? "");
      setAdminCopy(json.hostingAdminCopy ?? true);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger le modèle", variant: "destructive" });
    } finally {
      setTemplateLoading(false);
    }
  };

  /** Enregistre le modèle de rappel client dans les paramètres société. */
  const saveTemplate = async () => {
    setTemplateSaving(true);
    try {
      const res = await authFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostingReminderSubject: reminderSubject.trim(),
          hostingReminderBody: reminderBody,
          hostingAdminCopy: adminCopy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Modèle enregistré", description: "Les prochains rappels clients l'utiliseront." });
      setTemplateOpen(false);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement impossible",
        variant: "destructive",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  /** Insère une variable {…} dans le corps du modèle, à la position du curseur. */
  const insertVariable = (variable: string) => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setReminderBody((prev) => `${prev}${variable}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${variable}${el.value.slice(end)}`;
    setReminderBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** Étapes déjà notifiées ce cycle (pour l'affichage discret). */
  const stagesSent = (d: HostingDomainDto): string =>
    d.notifiedStages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `J-${s}`)
      .join(" · ");

  // Achat en cours d'édition (Task 56) : la date reste masquée jusqu'au paiement.
  const editingPending = editing?.status === "PENDING";
  const purchaseTotal = (Number(form.domainPrice) || 0) + (Number(form.hostingPrice) || 0);

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
            Noms de domaine achetés pour vos clients : échéances, rappels e-mail (admin + client), lien de paiement en ligne, relance WhatsApp en un clic. Vendez aussi de nouveaux domaines avec hébergement : créez l&apos;achat, envoyez la page de paiement, le compte à rebours de renouvellement démarre dès que c&apos;est payé.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={openTemplate} className="shrink-0">
            <FileText className="h-4 w-4" aria-hidden /> Modèle de rappel client
          </Button>
          <Button
            variant="outline"
            onClick={() => openCreate(true)}
            className="shrink-0"
            title="Créer un achat de domaine (+ hébergement) et faire payer le client avant l'activation"
          >
            <CreditCard className="h-4 w-4" aria-hidden /> Nouvel achat
          </Button>
          <Button onClick={() => openCreate(false)} className="bg-emerald-600 text-white hover:bg-emerald-700 shrink-0">
            <Plus className="h-4 w-4" aria-hidden /> Ajouter un domaine
          </Button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400" aria-hidden>
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none">{loading ? "…" : stats.pending}</p>
              <p className="mt-1 text-xs text-muted-foreground">Achats à encaisser</p>
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
          <Button onClick={() => openCreate(false)} className="bg-emerald-600 text-white hover:bg-emerald-700">
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
                      const clientSent = clientStagesSent(d);
                      const isPending = d.status === "PENDING"; // achat en attente de paiement (Task 56)
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-semibold">{d.domain}</TableCell>
                          <TableCell className="text-muted-foreground">{d.registrar || "—"}</TableCell>
                          <TableCell>
                            {d.clientName ? (
                              <div>
                                <p>{d.clientName}</p>
                                {d.clientPhone && <p className="text-xs text-muted-foreground">{d.clientPhone}</p>}
                                {d.clientEmail && <p className="text-xs text-muted-foreground">{d.clientEmail}</p>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPending ? (
                              <>
                                <p className="text-muted-foreground">—</p>
                                <p className="text-[11px] text-muted-foreground">Après paiement</p>
                              </>
                            ) : (
                              <>
                                <p>{formatDate(d.renewalDate)}</p>
                                {d.purchasedAt && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Achat payé le {formatDate(d.purchasedAt)}
                                  </p>
                                )}
                              </>
                            )}
                            {sent && <p className="text-[11px] text-muted-foreground">Rappels envoyés : {sent}</p>}
                            {clientSent && <p className="text-[11px] text-muted-foreground">Rappels client : {clientSent}</p>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatPrice(d.price)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              {isPending ? (
                                <Badge variant="outline" className="border-violet-500/30 bg-violet-500/15 font-semibold text-violet-600 dark:text-violet-400">
                                  <CreditCard className="mr-1 h-3 w-3" aria-hidden /> Achat à payer
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={urgency.className}>
                                  {urgency.label}
                                </Badge>
                              )}
                              {d.paymentSignalAt && (
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-400" title={`Signalé le ${fmtDateTime.format(new Date(d.paymentSignalAt))} (Dakar)`}>
                                  <CreditCard className="mr-1 h-3 w-3" aria-hidden /> 💳 Paiement signalé
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {d.paymentSignalAt && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-8 bg-emerald-600 px-2.5 text-white hover:bg-emerald-700"
                                    onClick={() => openRenewDialog(d)}
                                    title={
                                      isPending
                                        ? "Confirmer le paiement de l'achat — le compte à rebours de renouvellement (1 an) démarre"
                                        : "Confirmer le renouvellement (échéance +1 an)"
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4" aria-hidden /> {isPending ? "Paiement reçu" : "Renouvelé"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5"
                                    onClick={() => dismissSignal(d)}
                                    disabled={dismissingId === d.id}
                                    title="Ignorer le signalement de paiement"
                                  >
                                    {dismissingId === d.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    ) : (
                                      <X className="h-4 w-4" aria-hidden />
                                    )}
                                    Ignorer
                                  </Button>
                                </>
                              )}
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
                                title="Envoyer maintenant un rappel e-mail (admin + client si e-mail renseigné)"
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
                                onClick={() => openOrCreateLink(d)}
                                disabled={linkCreatingId === d.id}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                                title={
                                  d.renewalToken
                                    ? "Voir / révoquer le lien public de renouvellement"
                                    : "Créer le lien public de renouvellement (paiement en ligne)"
                                }
                                aria-label={`Lien de renouvellement du domaine ${d.domain}`}
                              >
                                {linkCreatingId === d.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Link2 className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => openHistory(d)}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                                title="Historique des renouvellements"
                                aria-label={`Historique des renouvellements du domaine ${d.domain}`}
                              >
                                <History className="h-4 w-4" />
                              </button>
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
              const clientSent = clientStagesSent(d);
              const wa = whatsappUrl(d, companyName);
              const isPending = d.status === "PENDING"; // achat en attente (Task 56)
              return (
                <Card key={d.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold" title={d.domain}>
                        {d.domain}
                      </p>
                      {isPending ? (
                        <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/15 font-semibold text-violet-600 dark:text-violet-400">
                          <CreditCard className="mr-1 h-3 w-3" aria-hidden /> Achat à payer
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`${urgency.className} shrink-0`}>
                          {urgency.label}
                        </Badge>
                      )}
                    </div>
                    {d.paymentSignalAt && (
                      <Badge variant="outline" className="mt-2 border-amber-500/40 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-400">
                        <CreditCard className="mr-1 h-3 w-3" aria-hidden /> 💳 Paiement signalé
                      </Badge>
                    )}
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
                          {d.clientEmail ? <span className="block truncate text-xs text-muted-foreground">{d.clientEmail}</span> : null}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Renouvellement</dt>
                        <dd className="text-right">
                          {isPending ? (
                            <span className="text-muted-foreground">Après paiement</span>
                          ) : (
                            <>
                              {formatDate(d.renewalDate)}
                              {d.purchasedAt && (
                                <span className="block text-[11px] text-muted-foreground">
                                  Achat payé le {formatDate(d.purchasedAt)}
                                </span>
                              )}
                            </>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Prix annuel</dt>
                        <dd>{formatPrice(d.price)}</dd>
                      </div>
                    </dl>
                    {sent && <p className="mt-2 text-[11px] text-muted-foreground">Rappels envoyés : {sent}</p>}
                    {clientSent && <p className="text-[11px] text-muted-foreground">Rappels client : {clientSent}</p>}
                    {d.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.notes}</p>}
                    {d.paymentSignalAt && (
                      <div className="mt-3 flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-9 flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => openRenewDialog(d)}
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden />{" "}
                          {isPending ? "Paiement reçu" : "Marquer renouvelé"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => dismissSignal(d)}
                          disabled={dismissingId === d.id}
                        >
                          {dismissingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <X className="h-4 w-4" aria-hidden />
                          )}
                          Ignorer
                        </Button>
                      </div>
                    )}
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
                        onClick={() => openOrCreateLink(d)}
                        disabled={linkCreatingId === d.id}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        title={
                          d.renewalToken
                            ? "Voir / révoquer le lien public de renouvellement"
                            : "Créer le lien public de renouvellement (paiement en ligne)"
                        }
                        aria-label={`Lien de renouvellement du domaine ${d.domain}`}
                      >
                        {linkCreatingId === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openHistory(d)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                        title="Historique des renouvellements"
                        aria-label={`Historique des renouvellements du domaine ${d.domain}`}
                      >
                        <History className="h-4 w-4" />
                      </button>
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
            <DialogTitle>
              {editing
                ? editingPending
                  ? "Achat en attente de paiement"
                  : "Modifier le domaine"
                : form.isPurchase
                  ? "Nouvel achat — domaine et hébergement"
                  : "Nouveau domaine"}
            </DialogTitle>
            <DialogDescription>
              {form.isPurchase && !editing
                ? "Le client paie d'abord : la page de paiement s'affichera juste après la création, et le compte à rebours de renouvellement (1 an) démarrera à la confirmation du paiement."
                : editingPending
                ? "Cet achat attend le paiement du client. Une fois payé, cliquez sur « Paiement reçu » : l'échéance (+1 an) et les rappels seront activés automatiquement."
                : "Renseignez le domaine acheté, son échéance et le client à relancer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            {!editing && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label htmlFor="host-purchase" className="font-medium">
                    Nouvel achat à faire payer
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Activé : achat d&apos;un domaine (avec hébergement si renseigné) — le client paie via la page publique avant l&apos;activation.
                  </p>
                </div>
                <Switch
                  id="host-purchase"
                  checked={form.isPurchase}
                  onCheckedChange={(v) => setForm({ ...form, isPurchase: v })}
                />
              </div>
            )}
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
              {form.isPurchase && !editing ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="host-domain-price">Prix du domaine (FCFA)</Label>
                    <Input
                      id="host-domain-price"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={500}
                      value={form.domainPrice}
                      onChange={(e) => setForm({ ...form, domainPrice: e.target.value })}
                      placeholder="Ex. 15000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="host-hosting-price">Prix de l&apos;hébergement (FCFA)</Label>
                    <Input
                      id="host-hosting-price"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={500}
                      value={form.hostingPrice}
                      onChange={(e) => setForm({ ...form, hostingPrice: e.target.value })}
                      placeholder="0 si sans hébergement — ex. 25000"
                    />
                    <p className="text-[11px] font-medium text-foreground">
                      Total à faire payer : {purchaseTotal.toLocaleString("fr-SN")} FCFA
                    </p>
                  </div>
                </>
              ) : (
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
              )}
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
              <Label htmlFor="host-email">E-mail du client</Label>
              <Input
                id="host-email"
                type="email"
                inputMode="email"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                placeholder="Ex. reservation@terrou-bi.com"
                maxLength={160}
              />
              <p className="text-[11px] text-muted-foreground">
                Renseigné, le client reçoit les rappels de renouvellement (J-30, J-15, J-2, jour J) avec son lien de paiement.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="host-payment-url">Lien de paiement (Wave)</Label>
                <Input
                  id="host-payment-url"
                  type="url"
                  inputMode="url"
                  value={form.paymentUrl}
                  onChange={(e) => setForm({ ...form, paymentUrl: e.target.value })}
                  placeholder="https://pay.wave.com/…"
                  maxLength={500}
                />
                <p className="text-[11px] text-muted-foreground">
                  Lien vers votre Wave (ou tout autre moyen de paiement) ouvert depuis la page publique du client.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-payment-label">Libellé du bouton (défaut Wave)</Label>
                <Input
                  id="host-payment-label"
                  value={form.paymentLabel}
                  onChange={(e) => setForm({ ...form, paymentLabel: e.target.value })}
                  placeholder="Wave"
                  maxLength={40}
                />
                <p className="text-[11px] text-muted-foreground">
                  Texte du bouton de paiement affiché au client (ex. Wave, Orange Money…).
                </p>
              </div>
            </div>
            {(!form.isPurchase || !!editing) && !editingPending && (
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
            )}
            {form.isPurchase && !editing && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                Achat : pas d&apos;échéance à saisir. À la confirmation du paiement, la date de renouvellement sera fixée
                automatiquement à aujourd&apos;hui + 1 an et le compte à rebours démarrera.
              </div>
            )}
            {editingPending && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs leading-relaxed text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                Achat en attente de paiement — la date de renouvellement sera fixée automatiquement (+1 an) quand vous
                confirmerez « Paiement reçu ».
              </div>
            )}
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
            <div className="space-y-1.5">
              <Label htmlFor="host-reminder">Message de rappel personnalisé (optionnel)</Label>
              <Textarea
                id="host-reminder"
                value={form.customReminder}
                onChange={(e) => setForm({ ...form, customReminder: e.target.value })}
                placeholder={"Laisse vide pour utiliser le modèle global (bouton « Modèle de rappel client »).\nEx. Bonjour {client}, votre domaine {domaine} arrive à échéance le {dateRenouvellement}.\n{lienPaiement}"}
                rows={4}
                maxLength={5000}
              />
              <p className="text-[11px] text-muted-foreground">
                Surcharge le modèle global pour ce domaine uniquement. Variables disponibles : {"{client} {domaine} {dateRenouvellement} {joursRestants} {prix} {lienPaiement} {societe} {telephone}"} — {"{lienPaiement}"} devient le bouton de paiement (ou la phrase de contact si aucun lien public n&apos;est actif).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              onClick={save}
              disabled={
                saving ||
                !form.domain.trim() ||
                (!editing && form.isPurchase
                  ? purchaseTotal <= 0
                  : !editingPending && !form.renewalDate)
              }
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
              {editing ? "Enregistrer" : form.isPurchase ? "Créer l'achat et afficher la page de paiement" : "Ajouter le domaine"}
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

      {/* Lien public de renouvellement (Task 49) */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lien de renouvellement — {linkDialog?.domain.domain}</DialogTitle>
            <DialogDescription>
              Page publique sans compte : le client y voit l&apos;échéance, le montant, le bouton de paiement et peut signaler « J&apos;ai payé ». Envoyez-lui ce lien par WhatsApp ou e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={linkDialog?.url ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Lien public de renouvellement" />
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => copyToClipboard(linkDialog?.url ?? "")} title="Copier le lien" aria-label="Copier le lien">
                <Copy className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => window.open(linkDialog?.url, "_blank", "noopener,noreferrer")}
                title="Ouvrir la page publique"
                aria-label="Ouvrir la page publique"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {linkDialog?.domain.paymentUrl && (
              <p className="text-xs text-muted-foreground">
                Bouton de paiement affiché au client : « 💠 Payer avec {linkDialog.domain.paymentLabel || "Wave"} ».
              </p>
            )}
            {!linkDialog?.domain.paymentUrl && (
              <p className="text-xs text-muted-foreground">
                Astuce : ajoutez un lien de paiement (Wave) dans l&apos;édition du domaine pour afficher un bouton « Payer » sur la page.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={revokeLink}
              disabled={linkBusy}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Unlink className="h-4 w-4" aria-hidden />}
              Révoquer le lien
            </Button>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historique des renouvellements (Task 49) */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Historique — {historyFor?.domain}</DialogTitle>
            <DialogDescription>Renouvellements enregistrés, du plus récent au plus ancien.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : renewals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun renouvellement enregistré pour ce domaine.
              </p>
            ) : (
              renewals.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-semibold">{r.renewedFor}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.createdAt)} · {formatPrice(r.amount)}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    {r.method}
                  </Badge>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryFor(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marquer renouvelé / Confirmer le paiement d'un achat (Task 49, 56) */}
      <Dialog open={!!renewDialog} onOpenChange={(o) => !o && setRenewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {renewDialog?.status === "PENDING" ? "Confirmer le paiement de l'achat" : "Marquer renouvelé"} — {renewDialog?.domain}
            </DialogTitle>
            <DialogDescription>
              {renewDialog?.status === "PENDING"
                ? "L'achat sera activé : l'échéance est fixée à aujourd'hui + 1 an, le compte à rebours de renouvellement démarre, les rappels e-mail sont armés et la ligne « Achat » est ajoutée à l'historique."
                : "L'échéance sera repoussée d'un an (même jour/mois), les rappels e-mail admin et client seront réarmés et le signalement de paiement effacé."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="renew-amount">
                {renewDialog?.status === "PENDING" ? "Montant payé (FCFA)" : "Montant du renouvellement (FCFA)"}
              </Label>
              <Input
                id="renew-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={renewAmount}
                onChange={(e) => setRenewAmount(e.target.value)}
                placeholder="Ex. 25000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="renew-method">Méthode</Label>
              <Select value={renewMethod} onValueChange={setRenewMethod}>
                <SelectTrigger id="renew-method" className="w-full">
                  <SelectValue placeholder="Méthode" />
                </SelectTrigger>
                <SelectContent>
                  {RENEW_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialog(null)} disabled={renewBusy}>
              Annuler
            </Button>
            <Button onClick={confirmRenew} disabled={renewBusy} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {renewBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              {renewDialog?.status === "PENDING" ? "Confirmer le paiement" : "Confirmer le renouvellement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modèle de rappel client (Task 49) */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modèle de rappel client</DialogTitle>
            <DialogDescription>
              E-mail envoyé automatiquement au client (si son e-mail est renseigné) aux étapes J-30, J-15, J-2 et jour J. Laissez vide pour utiliser le modèle par défaut.
            </DialogDescription>
          </DialogHeader>
          {templateLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-subject">Sujet de l&apos;e-mail</Label>
                <Input
                  id="reminder-subject"
                  value={reminderSubject}
                  onChange={(e) => setReminderSubject(e.target.value)}
                  placeholder="Défaut : Renouvellement de votre domaine {domaine} — dans {joursRestants} jour(s)"
                  maxLength={5000}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-body">Corps de l&apos;e-mail</Label>
                <Textarea
                  id="reminder-body"
                  ref={bodyTextareaRef}
                  value={reminderBody}
                  onChange={(e) => setReminderBody(e.target.value)}
                  placeholder={"Bonjour {client},\n\nLe domaine {domaine} arrive à échéance le {dateRenouvellement} (dans {joursRestants} jours).\nMontant : {prix}.\n\n{lienPaiement}\n\nCordialement,\n{societe} — {telephone}"}
                  rows={8}
                  maxLength={8000}
                />
                <div className="flex flex-wrap gap-1.5" aria-label="Insérer une variable">
                  {REMINDER_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="rounded-md border bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={`Insérer ${v} à la position du curseur`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {"{lienPaiement}"} devient le bouton « Renouveler / payer en ligne » (fond #1DC8FF si Wave) quand un lien public actif existe, sinon la phrase de contact par téléphone.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label htmlFor="admin-copy" className="font-medium">
                    Copie à l&apos;admin
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Recevoir aussi le récapitulatif interne de chaque rappel automatique.
                  </p>
                </div>
                <Switch id="admin-copy" checked={adminCopy} onCheckedChange={setAdminCopy} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={templateLoading}>
              <Eye className="h-4 w-4" aria-hidden /> Aperçu
            </Button>
            <Button onClick={saveTemplate} disabled={templateSaving || templateLoading} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {templateSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aperçu du rappel client (valeurs d'exemple) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aperçu du rappel client</DialogTitle>
            <DialogDescription>
              Rendu avec des valeurs d&apos;exemple (Hôtel Terrou-Bi, J-25, 25 000 FCFA) — le lien de paiement s&apos;affiche uniquement si un lien public est actif pour le domaine.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-white p-5 text-[15px]" style={{ fontFamily: "Segoe UI, Arial, sans-serif" }}>
            <p className="mb-3 border-b pb-2 text-sm font-semibold text-stone-700">
              {reminderSubject.trim()
                ? reminderSubject.replace(/\{(\w+)\}/g, (m, key: string) =>
                    ({
                      client: "Hôtel Terrou-Bi",
                      domaine: "terroubi.sn",
                      dateRenouvellement: fmtDateLong.format(new Date(Date.now() + 25 * 86_400_000)),
                      joursRestants: "25",
                      prix: "25 000 FCFA",
                      societe: companyName,
                      telephone: companyPhone,
                    } as Record<string, string>)[key] ?? m,
                  )
                : "Renouvellement de votre domaine terroubi.sn — dans 25 jour(s)"}
            </p>
            <div dangerouslySetInnerHTML={{ __html: buildClientPreview(reminderBody, {
              client: "Hôtel Terrou-Bi",
              domaine: "terroubi.sn",
              dateRenouvellement: fmtDateLong.format(new Date(Date.now() + 25 * 86_400_000)),
              joursRestants: "25",
              prix: "25 000 FCFA",
              societe: companyName,
              telephone: companyPhone,
            }, "https://exemple.com/renouvellement/exemple", "Wave") }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
