"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Inbox,
  Info,
  Loader2,
  MailOpen,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  Star,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue, useFetch } from "@/hooks/use-fetch";
import { authFetch } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { Mail, MailConfig, MailCounts } from "@/lib/types";

type MailFolder = Mail["folder"];

// ─── Helpers d'affichage ────────────────────────────────────────────────────

function relativeTimeFr(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function fullDateFr(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

function excerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

// ─── Bouton de dossier (colonne gauche) ─────────────────────────────────────

function FolderButton({
  active,
  label,
  icon: Icon,
  badge,
  badgeGold,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeGold?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "text-foreground/80 hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold",
            badgeGold
              ? "border border-gold/50 bg-gold-soft text-amber-800 dark:text-amber-200"
              : active
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted-foreground/15 text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Élément de la liste des mails ──────────────────────────────────────────

function MailListItem({
  mail,
  active,
  onSelect,
  onToggleStar,
}: {
  mail: Mail;
  active: boolean;
  onSelect: (mail: Mail) => void;
  onToggleStar: (mail: Mail) => void;
}) {
  const isOut = mail.direction === "OUT";
  const party = isOut ? mail.to : mail.fromName || mail.from;
  const initial = (party || "?").charAt(0).toUpperCase();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={mail.subject || "Message sans objet"}
      onClick={() => onSelect(mail)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(mail);
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 border-b px-3 py-3 text-left transition-colors outline-none last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 sm:px-4",
        active && "bg-muted",
        !mail.read && "bg-primary/[0.04] hover:bg-primary/[0.07]"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold-soft/70 text-xs font-bold text-amber-800 dark:text-amber-200">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!mail.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          )}
          <span className={cn("truncate text-sm", mail.read ? "font-medium" : "font-semibold")}>
            {party || "(inconnu)"}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {relativeTimeFr(mail.sentAt)}
          </span>
          <button
            type="button"
            aria-label={mail.starred ? "Retirer des favoris" : "Marquer comme favori"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(mail);
            }}
            className="shrink-0 rounded-full p-1 transition-colors hover:bg-gold-soft/70"
          >
            <Star
              className={cn(
                "h-4 w-4",
                mail.starred ? "fill-gold text-gold" : "text-muted-foreground/60"
              )}
            />
          </button>
        </div>
        <p className={cn("truncate text-sm", mail.read ? "text-foreground/80" : "font-semibold")}>
          {mail.subject || "(sans objet)"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{excerpt(mail.body) || "—"}</p>
      </div>
    </div>
  );
}

// ─── Panneau de lecture (desktop + overlay mobile) ──────────────────────────

function ReadPane({
  mail,
  onReply,
  onDelete,
  onRestore,
}: {
  mail: Mail;
  onReply: (mail: Mail) => void;
  onDelete: (mail: Mail) => void;
  onRestore: (mail: Mail) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="space-y-1.5 border-b p-4">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-base font-bold leading-snug sm:text-lg">
            {mail.subject || "(sans objet)"}
          </h3>
          {mail.starred && <Star className="mt-1 h-4 w-4 shrink-0 fill-gold text-gold" />}
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="truncate">
            <span className="font-medium text-foreground">De : </span>
            {mail.fromName ? `${mail.fromName} ` : ""}
            {`<${mail.from || "inconnu"}>`}
          </p>
          <p className="truncate">
            <span className="font-medium text-foreground">À : </span>
            {mail.to || "—"}
          </p>
          <p>{fullDateFr(mail.sentAt)}</p>
        </div>
      </div>
      <div className="max-h-[42vh] flex-1 overflow-y-auto p-4 lg:max-h-none">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {mail.body || "(message vide)"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t p-3">
        <Button size="sm" onClick={() => onReply(mail)} className="gap-1.5">
          <Reply className="h-4 w-4" /> Répondre
        </Button>
        {mail.folder === "TRASH" && (
          <Button size="sm" variant="outline" onClick={() => onRestore(mail)} className="gap-1.5">
            <Undo2 className="h-4 w-4" /> Restaurer
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDelete(mail)}
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Supprimer
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Dialog de configuration SMTP / IMAP ────────────────────────────────────

interface ConfigForm {
  mailFromName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPass: string;
}

function MailConfigDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MailConfig | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ConfigForm>({
    mailFromName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false,
    imapHost: "",
    imapPort: "993",
    imapUser: "",
    imapPass: "",
  });
  const [saving, setSaving] = useState(false);

  // Pré-remplissage à l'ouverture (mots de passe jamais renvoyés → vides)
  useEffect(() => {
    if (open && config) {
      setForm({
        mailFromName: config.mailFromName ?? "",
        smtpHost: config.smtpHost ?? "",
        smtpPort: String(config.smtpPort ?? 587),
        smtpUser: config.smtpUser ?? "",
        smtpPass: "",
        smtpSecure: Boolean(config.smtpSecure),
        imapHost: config.imapHost ?? "",
        imapPort: String(config.imapPort ?? 993),
        imapUser: config.imapUser ?? "",
        imapPass: "",
      });
    }
  }, [open, config]);

  const set = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        mailFromName: form.mailFromName.trim(),
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort) || 587,
        smtpUser: form.smtpUser.trim(),
        smtpSecure: form.smtpSecure,
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort) || 993,
        imapUser: form.imapUser.trim(),
      };
      // Les mots de passe ne sont envoyés que s'ils sont saisis (sinon conservés)
      if (form.smtpPass.trim()) payload.smtpPass = form.smtpPass;
      if (form.imapPass.trim()) payload.imapPass = form.imapPass;

      const res = await authFetch("/api/mail-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Enregistrement impossible");
      }
      toast({
        title: "Configuration enregistrée",
        description: "Les paramètres de la boîte mail ont été mis à jour.",
      });
      onSaved();
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuration de la boîte mail</DialogTitle>
          <DialogDescription>
            Serveurs d&apos;envoi (SMTP) et de réception (IMAP). Les mots de passe ne sont jamais
            affichés — laissez vides pour conserver les valeurs actuelles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="mailFromName">Nom d&apos;expéditeur</Label>
            <Input
              id="mailFromName"
              value={form.mailFromName}
              onChange={(e) => set("mailFromName", e.target.value)}
              placeholder="2MAILS"
            />
          </div>

          <Separator />

          {/* ─── SMTP ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Serveur d&apos;envoi (SMTP)</p>
              <Badge
                className={cn(
                  "border",
                  config?.smtpConfigured
                    ? "border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                    : "border-transparent bg-muted text-muted-foreground"
                )}
              >
                {config?.smtpConfigured ? "SMTP configuré" : "Non configuré"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div className="space-y-1.5">
                <Label htmlFor="smtpHost">Hôte</Label>
                <Input
                  id="smtpHost"
                  value={form.smtpHost}
                  onChange={(e) => set("smtpHost", e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtpPort">Port</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => set("smtpPort", e.target.value)}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpUser">Utilisateur</Label>
              <Input
                id="smtpUser"
                type="email"
                value={form.smtpUser}
                onChange={(e) => set("smtpUser", e.target.value)}
                placeholder="contact@2mails.sn"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpPass">Mot de passe</Label>
              <Input
                id="smtpPass"
                type="password"
                value={form.smtpPass}
                onChange={(e) => set("smtpPass", e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="smtpSecure"
                checked={form.smtpSecure}
                onCheckedChange={(v) => set("smtpSecure", v === true)}
              />
              <Label htmlFor="smtpSecure" className="text-sm font-normal">
                TLS direct (SSL/TLS — port 465)
              </Label>
            </div>
          </div>

          <Separator />

          {/* ─── IMAP ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Serveur de réception (IMAP)</p>
              <Badge
                className={cn(
                  "border",
                  config?.imapConfigured
                    ? "border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                    : "border-transparent bg-muted text-muted-foreground"
                )}
              >
                {config?.imapConfigured ? "IMAP configuré" : "Non configuré"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div className="space-y-1.5">
                <Label htmlFor="imapHost">Hôte</Label>
                <Input
                  id="imapHost"
                  value={form.imapHost}
                  onChange={(e) => set("imapHost", e.target.value)}
                  placeholder="imap.gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imapPort">Port</Label>
                <Input
                  id="imapPort"
                  type="number"
                  value={form.imapPort}
                  onChange={(e) => set("imapPort", e.target.value)}
                  placeholder="993"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imapUser">Utilisateur</Label>
              <Input
                id="imapUser"
                type="email"
                value={form.imapUser}
                onChange={(e) => set("imapUser", e.target.value)}
                placeholder="contact@2mails.sn"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imapPass">Mot de passe</Label>
              <Input
                id="imapPass"
                type="password"
                value={form.imapPass}
                onChange={(e) => set("imapPass", e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vue principale ─────────────────────────────────────────────────────────

export default function MailView() {
  const { toast } = useToast();

  // Liste + compteurs (chargement manuel pour rafraîchissements ciblés)
  const [folder, setFolder] = useState<MailFolder>("INBOX");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [mails, setMails] = useState<Mail[]>([]);
  const [counts, setCounts] = useState<MailCounts>({ inbox: 0, unread: 0, sent: 0, trash: 0 });
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams({ folder });
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    return params.toString();
  }, [folder, debouncedQ]);

  const loadMails = useCallback(async () => {
    try {
      const res = await fetch(`/api/mails?${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Chargement impossible");
      setMails(Array.isArray(json.mails) ? (json.mails as Mail[]) : []);
      setCounts(
        json.counts ?? { inbox: 0, unread: 0, sent: 0, trash: 0 }
      );
    } catch (e) {
      console.error("Chargement des mails", e);
      toast({
        title: "Erreur",
        description: "Chargement des messages impossible",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    loadMails();
  }, [loadMails]);

  // Configuration (bandeau SMTP + dialog)
  const { data: configData, refetch: refetchConfig } = useFetch<{ config: MailConfig }>(
    "/api/mail-settings"
  );
  const config = configData?.config ?? null;

  // Sélection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => mails.find((m) => m.id === selectedId) ?? null, [mails, selectedId]);

  useEffect(() => {
    // Changement de dossier ou de recherche → on ferme la lecture
    setSelectedId(null);
  }, [folder, debouncedQ]);

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // Configuration dialog
  const [configOpen, setConfigOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const openCompose = (prefill?: { to?: string; subject?: string }) => {
    setComposeTo(prefill?.to ?? "");
    setComposeSubject(prefill?.subject ?? "");
    setComposeBody("");
    setComposeOpen(true);
  };

  const sendMail = async () => {
    if (!composeTo.trim().includes("@")) {
      toast({
        title: "Adresse invalide",
        description: "Saisissez une adresse du destinataire valide.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const res = await authFetch("/api/mails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo.trim(),
          subject: composeSubject.trim(),
          body: composeBody,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Envoi impossible");
      toast({
        title: json.delivered
          ? "Message envoyé"
          : "Message enregistré localement (SMTP non configuré)",
        description: json.delivered
          ? `Envoyé à ${composeTo.trim()}.`
          : "Configurez votre boîte pour envoyer de vrais emails.",
      });
      setComposeOpen(false);
      await loadMails();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Envoi impossible",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/mails/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Synchronisation impossible");
      toast({
        title: `${Number(json.imported ?? 0)} nouveau(x) mail(s)`,
        description: "Boîte de réception synchronisée.",
      });
      refetchConfig();
      await loadMails();
    } catch (e) {
      toast({
        title: "Synchronisation impossible",
        description: e instanceof Error ? e.message : "Erreur lors de la synchronisation",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const openMail = (mail: Mail) => {
    setSelectedId(mail.id);
    if (!mail.read) {
      // Marquer comme lu localement + côté serveur
      setMails((prev) => prev.map((m) => (m.id === mail.id ? { ...m, read: true } : m)));
      setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1) }));
      authFetch(`/api/mails/${mail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
  };

  const toggleStar = async (mail: Mail) => {
    setMails((prev) =>
      prev.map((m) => (m.id === mail.id ? { ...m, starred: !m.starred } : m))
    );
    try {
      const res = await authFetch(`/api/mails/${mail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !mail.starred }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMails((prev) =>
        prev.map((m) => (m.id === mail.id ? { ...m, starred: mail.starred } : m))
      );
      toast({
        title: "Erreur",
        description: "Impossible de modifier le favori",
        variant: "destructive",
      });
    }
  };

  const deleteMail = async (mail: Mail) => {
    try {
      const res = await authFetch(`/api/mails/${mail.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suppression impossible");
      toast({
        title:
          mail.folder === "TRASH"
            ? "Message supprimé définitivement"
            : "Message déplacé dans la corbeille",
      });
      if (selectedId === mail.id) setSelectedId(null);
      await loadMails();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Suppression impossible",
        variant: "destructive",
      });
    }
  };

  const restoreMail = async (mail: Mail) => {
    try {
      const res = await authFetch(`/api/mails/${mail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "INBOX" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Restauration impossible");
      toast({ title: "Message restauré dans la boîte de réception" });
      if (selectedId === mail.id) setSelectedId(null);
      await loadMails();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Restauration impossible",
        variant: "destructive",
      });
    }
  };

  const folders: Array<{
    key: MailFolder;
    label: string;
    icon: LucideIcon;
    badge?: number;
    badgeGold?: boolean;
  }> = [
    { key: "INBOX", label: "Boîte de réception", icon: Inbox, badge: counts.unread, badgeGold: true },
    { key: "SENT", label: "Envoyés", icon: Send, badge: counts.sent },
    { key: "TRASH", label: "Corbeille", icon: Trash2, badge: counts.trash },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-6 sm:px-6">
      {/* Entête de vue */}
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Boîte mail</h1>
        <p className="text-sm text-muted-foreground">Recevez et envoyez vos emails</p>
      </div>

      {/* Bandeau SMTP non configuré */}
      {config && !config.smtpConfigured && (
        <Alert className="border-gold/50 bg-gold-soft/40">
          <Info className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          <AlertTitle className="text-amber-900 dark:text-amber-200">
            SMTP non configuré
          </AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
            Les messages sont enregistrés localement. Configurez votre boîte pour envoyer de vrais
            emails.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ─── Colonne gauche : actions + dossiers ─── */}
        <aside className="flex flex-col gap-2">
          <Button onClick={() => openCompose()} className="justify-start gap-2">
            <Plus className="h-4 w-4" /> Nouveau message
          </Button>
          <Button
            variant="outline"
            onClick={sync}
            disabled={syncing}
            className="justify-start gap-2"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Synchroniser
          </Button>

          <nav
            aria-label="Dossiers"
            className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {folders.map((f) => (
              <FolderButton
                key={f.key}
                active={folder === f.key}
                label={f.label}
                icon={f.icon}
                badge={f.badge}
                badgeGold={f.badgeGold}
                onClick={() => setFolder(f.key)}
              />
            ))}
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Settings2 className="h-4 w-4 shrink-0" />
              Configuration
            </button>
          </nav>
        </aside>

        {/* ─── Colonne centre : liste des mails ─── */}
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un message…"
                aria-label="Rechercher un message"
                className="pl-9"
              />
            </div>
          </div>

          <div className="max-h-[65vh] min-h-[360px] flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mails.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aucun message</p>
              </div>
            ) : (
              mails.map((mail) => (
                <MailListItem
                  key={mail.id}
                  mail={mail}
                  active={mail.id === selectedId}
                  onSelect={openMail}
                  onToggleStar={toggleStar}
                />
              ))
            )}
          </div>
        </Card>

        {/* ─── Colonne droite : panneau de lecture (desktop) ─── */}
        <Card className="hidden min-h-[360px] flex-col overflow-hidden lg:flex">
          {selected ? (
            <ReadPane
              key={selected.id}
              mail={selected}
              onReply={(m) =>
                openCompose({
                  to: m.direction === "IN" ? m.from : m.to,
                  subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
                })
              }
              onDelete={deleteMail}
              onRestore={restoreMail}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <MailOpen className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Sélectionnez un message pour le lire
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ─── Overlay de lecture (mobile) ─── */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lecture du message"
          className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden"
        >
          <div className="flex items-center gap-2 border-b p-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedId(null)}
              aria-label="Retour à la liste"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <p className="flex-1 truncate text-sm font-semibold">
              {selected.subject || "(sans objet)"}
            </p>
          </div>
          <ReadPane
            key={selected.id}
            mail={selected}
            onReply={(m) => {
              setSelectedId(null);
              openCompose({
                to: m.direction === "IN" ? m.from : m.to,
                subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
              });
            }}
            onDelete={deleteMail}
            onRestore={restoreMail}
          />
        </div>
      )}

      {/* ─── Dialog de rédaction ─── */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau message</DialogTitle>
            <DialogDescription>
              Rédigez votre email — il sera enregistré dans « Envoyés ».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="composeTo">À</Label>
              <Input
                id="composeTo"
                type="email"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="destinataire@exemple.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="composeSubject">Objet</Label>
              <Input
                id="composeSubject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Objet du message"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="composeBody">Message</Label>
              <Textarea
                id="composeBody"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Écrivez votre message…"
                rows={7}
                className="resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={sending}>
              Annuler
            </Button>
            <Button onClick={sendMail} disabled={sending} className="gap-1.5">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog de configuration ─── */}
      <MailConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={refetchConfig}
      />
    </div>
  );
}
