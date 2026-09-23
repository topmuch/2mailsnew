"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  Info,
  Loader2,
  MailOpen,
  PlugZap,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  Star,
  Trash2,
  Undo2,
  Wand2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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

/** Couleur d'avatar dérivée du nom (palette bleutée premium). */
function avatarClass(name: string): string {
  const palettes = [
    "from-sky-500 to-blue-700",
    "from-blue-500 to-indigo-700",
    "from-cyan-500 to-sky-700",
    "from-slate-500 to-slate-700",
    "from-blue-400 to-cyan-600",
    "from-indigo-400 to-blue-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

// ─── Bouton de dossier (rail gauche) ────────────────────────────────────────

function FolderButton({
  active,
  label,
  icon: Icon,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
        active
          ? "bg-gradient-to-r from-primary to-sky-600 font-semibold text-primary-foreground shadow-md shadow-primary/25"
          : "text-foreground/75 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "drop-shadow-sm")} />
      <span className="flex-1 truncate text-left">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold",
            active
              ? "bg-primary-foreground/25 text-primary-foreground"
              : "bg-primary/10 text-primary"
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
  onDelete,
}: {
  mail: Mail;
  active: boolean;
  onSelect: (mail: Mail) => void;
  onToggleStar: (mail: Mail) => void;
  onDelete: (mail: Mail) => void;
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
        "group relative flex w-full cursor-pointer items-start gap-3 border-b border-border/50 px-3 py-3 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 sm:px-4",
        // Email en lecture : surlignage bleu marqué (fond + barre latérale + textes colorés)
        active && "bg-primary/[0.14] shadow-[inset_3px_0_0_0] shadow-primary",
        !mail.read && !active && "bg-sky-500/[0.04] hover:bg-sky-500/[0.07] dark:bg-sky-400/[0.05]"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm",
          avatarClass(party || "?")
        )}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!mail.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-sm" aria-hidden="true" />
          )}
          <span className={cn("truncate text-sm", mail.read ? "font-medium" : "font-bold", active && "text-primary")}>
            {party || "(inconnu)"}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {relativeTimeFr(mail.sentAt)}
          </span>
        </div>
        <p className={cn("truncate text-sm", mail.read ? "text-foreground/85" : "font-semibold text-foreground", active && "text-primary")}>
          {mail.subject || "(sans objet)"}
        </p>
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {excerpt(mail.body) || "—"}
          </p>
          {/* Suppression rapide : toujours visible sur mobile, au survol sur desktop */}
          <button
            type="button"
            aria-label={mail.folder === "TRASH" ? "Supprimer définitivement" : "Supprimer ce message"}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(mail);
            }}
            className="shrink-0 rounded-full p-1 text-muted-foreground/40 opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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
                mail.starred ? "fill-gold text-gold" : "text-muted-foreground/40"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau de lecture (desktop + overlay mobile) ──────────────────────────

/** Second filet de sécurité côté client avant injection du HTML de l'email. */
function clientSanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<img[^>]*\ssrc\s*=\s*["']?cid:[^"'\s>]*["']?[^>]*>/gi, " ")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

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
  // Détail complet (avec bodyHtml) chargé à l'ouverture — la liste l'omet pour rester légère
  const [detail, setDetail] = useState<Mail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // NB : le parent remonte ce composant avec key={mail.id} — état initial déjà propre
    authFetch(`/api/mails/${mail.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.mail) setDetail(json.mail as Mail);
        else setDetailFailed(true);
      })
      .catch(() => {
        if (!cancelled) setDetailFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mail.id]);

  const html = detail?.bodyHtml?.trim() || "";
  const plain = detail?.body ?? mail.body;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="space-y-3 border-b bg-gradient-to-b from-muted/60 to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-lg font-bold leading-snug sm:text-xl">
            {mail.subject || "(sans objet)"}
          </h3>
          {mail.starred && <Star className="mt-1.5 h-4 w-4 shrink-0 fill-gold text-gold" />}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white",
                avatarClass(mail.fromName || mail.from || "?")
              )}
            >
              {(mail.fromName || mail.from || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-xs">
              <p className="truncate font-semibold text-foreground">
                {mail.fromName ? `${mail.fromName} ` : ""}
                <span className="font-normal text-muted-foreground">{`<${mail.from || "inconnu"}>`}</span>
              </p>
              <p className="truncate text-muted-foreground">À : {mail.to || "—"}</p>
            </div>
            <p className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {fullDateFr(mail.sentAt)}
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {html ? (
          // HTML de l'email (assaini côté serveur ET client) : images, tableaux, liens conservés
          <div
            className="text-sm leading-relaxed [&_a]:break-all [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:pl-2 [&_p]:my-2 [&_strong]:font-semibold [&_table]:border-collapse [&_table]:max-w-full [&_td]:border [&_td]:border-border/50 [&_td]:p-1.5 [&_td]:align-top [&_th]:border [&_th]:border-border/50 [&_th]:p-1.5 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-2"
            dangerouslySetInnerHTML={{ __html: clientSanitizeHtml(html) }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {plain || (detailFailed ? "(contenu indisponible)" : "(message vide)")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 p-3">
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
          className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Supprimer
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Résultat de test de connexion (IMAP / SMTP) ────────────────────────────

type TestResult = { ok: boolean; details: string; configured: boolean };

function TestRow({
  label,
  result,
}: {
  label: string;
  result: TestResult | null;
}) {
  if (!result) return null;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-sm",
        result.ok
          ? "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-destructive/40 bg-destructive/5 text-destructive"
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        {result.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0" />
        )}
        {label} — {result.ok ? "fonctionne" : "échec"}
      </div>
      <p className="mt-1 text-xs leading-relaxed opacity-90">{result.details}</p>
    </div>
  );
}

// ─── Dialog de configuration SMTP / IMAP ────────────────────────────────────

interface ConfigForm {
  mailFromName: string;
  mailDailyImportLimit: string;
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
    mailDailyImportLimit: "15",
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
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{ imap: TestResult; smtp: TestResult } | null>(null);

  // Pré-remplissage à l'ouverture (mots de passe jamais renvoyés → vides)
  useEffect(() => {
    if (open && config) {
      setForm({
        mailFromName: config.mailFromName ?? "",
        mailDailyImportLimit: String(config.mailDailyImportLimit ?? 15),
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
      setTestResults(null);
    }
  }, [open, config]);

  const set = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Pré-remplit les serveurs Gmail (IMAP + SMTP) ; recopie l'email d'un champ à l'autre. */
  const applyGmailPreset = () => {
    setForm((f) => ({
      ...f,
      smtpHost: "smtp.gmail.com",
      smtpPort: "465",
      smtpSecure: true,
      imapHost: "imap.gmail.com",
      imapPort: "993",
      imapUser: f.imapUser || f.smtpUser,
      smtpUser: f.smtpUser || f.imapUser,
    }));
    setTestResults(null);
    toast({
      title: "Réglages Gmail appliqués",
      description:
        "Renseignez votre adresse Gmail et votre mot de passe d'application (16 caractères), puis Enregistrer.",
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        mailFromName: form.mailFromName.trim(),
        mailDailyImportLimit: Number(form.mailDailyImportLimit) || 15,
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
        description: "Testez la connexion pour vérifier IMAP et SMTP.",
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

  const runTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      // Teste les valeurs saisies dans le formulaire SANS les enregistrer :
      // pratique pour corriger host/port/mot de passe jusqu'au vert, puis enregistrer.
      // Les mots de passe laissés vides utilisent ceux déjà enregistrés côté serveur.
      const payload: Record<string, unknown> = {
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort) || 587,
        smtpUser: form.smtpUser.trim(),
        smtpSecure: form.smtpSecure,
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort) || 993,
        imapUser: form.imapUser.trim(),
      };
      if (form.smtpPass.trim()) payload.smtpPass = form.smtpPass;
      if (form.imapPass.trim()) payload.imapPass = form.imapPass;

      const res = await authFetch("/api/mail-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test impossible");
      setTestResults({ imap: json.imap, smtp: json.smtp });
    } catch (e) {
      toast({
        title: "Test impossible",
        description: e instanceof Error ? e.message : "Erreur pendant le test",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Configuration de la boîte mail</DialogTitle>
          <DialogDescription>
            Serveurs d&apos;envoi (SMTP) et de réception (IMAP). Les mots de passe ne sont jamais
            affichés — laissez vides pour conserver les valeurs actuelles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ─── Raccourci Gmail ─── */}
          <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900 dark:from-sky-950/50 dark:to-blue-950/40">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Vous utilisez Gmail ?</p>
              <p className="text-xs text-muted-foreground">
                Pré-remplit automatiquement les serveurs IMAP et SMTP.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 border-sky-300 text-sky-800 hover:bg-sky-100 hover:text-sky-900 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/50"
              onClick={applyGmailPreset}
            >
              <Wand2 className="h-4 w-4" /> Gmail automatique
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailFromName">Nom d&apos;expéditeur</Label>
            <Input
              id="mailFromName"
              value={form.mailFromName}
              onChange={(e) => set("mailFromName", e.target.value)}
              placeholder="2MAILS"
            />
          </div>

          {/* ─── Limite quotidienne d'importation (anti-saturation) ─── */}
          <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="mailDailyImportLimit" className="text-sm font-medium">
                Mails reçus par jour (limite)
              </Label>
              <Input
                id="mailDailyImportLimit"
                type="number"
                min={1}
                max={500}
                value={form.mailDailyImportLimit}
                onChange={(e) => set("mailDailyImportLimit", e.target.value)}
                className="w-24 text-center"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nombre maximal de messages importés du serveur chaque jour pour ne pas saturer la
              boîte (15 par défaut). La limite se réinitialise chaque matin.
            </p>
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
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              💡 Gmail : <span className="font-medium">smtp.gmail.com</span> port{" "}
              <span className="font-medium">465</span> avec « TLS direct » coché (ou 587
              décoché). Google refuse votre mot de passe habituel : utilisez un{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2"
              >
                mot de passe d&apos;application
              </a>{" "}
              (16 caractères, après activation de la validation en deux étapes).
            </p>
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
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              💡 Gmail : <span className="font-medium">imap.gmail.com</span> port{" "}
              <span className="font-medium">993</span>. Même adresse et même{" "}
              <span className="font-medium">mot de passe d&apos;application</span> que pour le
              SMTP. Après enregistrement, cliquez sur « Tester la connexion » pour voir la cause
              exacte en cas d&apos;échec.
            </p>
          </div>

          {/* ─── Résultats du test ─── */}
          {testResults && (
            <div className="space-y-2">
              <TestRow label="IMAP (réception)" result={testResults.imap} />
              <TestRow label="SMTP (envoi)" result={testResults.smtp} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={runTest}
            disabled={testing || saving}
            className="gap-1.5 sm:mr-auto"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="h-4 w-4" />
            )}
            Tester la connexion
          </Button>
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
      setCounts(json.counts ?? { inbox: 0, unread: 0, sent: 0, trash: 0 });
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

  // Suppression en masse (confirmation puis exécution)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Synchronisation impossible");
      const imported = Number(json.imported ?? 0);
      if (json.limitReached && imported === 0) {
        // Quota du jour déjà épuisé avant cette synchronisation
        toast({
          title: `Limite quotidienne atteinte (${json.limit ?? 15} mails/jour)`,
          description:
            json.message ??
            "La synchronisation reprendra demain. Vous pouvez augmenter la limite dans la configuration.",
        });
      } else {
        toast({
          title: `${imported} nouveau(x) mail(s)`,
          description: json.limitReached
            ? `Limite quotidienne de ${json.limit ?? 15} mails atteinte — la suite arrivera demain.`
            : "Boîte de réception synchronisée.",
        });
      }
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

  /** Suppression en masse : corbeille si dossier normal, vidage définitif si corbeille. */
  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await authFetch("/api/mails/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suppression impossible");
      const n = Number(json.affected ?? 0);
      toast({
        title: json.permanent
          ? `Corbeille vidée (${n} message${n > 1 ? "s" : ""})`
          : `${n} message${n > 1 ? "s" : ""} déplacé${n > 1 ? "s" : ""} dans la corbeille`,
        description: json.permanent
          ? "Suppression définitive effectuée."
          : "Vous pouvez les restaurer depuis la corbeille.",
      });
      setSelectedId(null);
      await loadMails();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Suppression en masse impossible",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
      setConfirmBulkOpen(false);
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
  }> = [
    { key: "INBOX", label: "Boîte de réception", icon: Inbox, badge: counts.unread },
    { key: "SENT", label: "Envoyés", icon: Send, badge: counts.sent },
    { key: "TRASH", label: "Corbeille", icon: Trash2, badge: counts.trash },
  ];

  const folderTitle =
    folder === "INBOX" ? "Boîte de réception" : folder === "SENT" ? "Envoyés" : "Corbeille";

  const lastSyncLabel = config?.lastMailSync
    ? new Date(config.lastMailSync).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex h-[calc(100dvh-8.75rem)] min-h-[540px] flex-col lg:h-auto lg:min-h-0 lg:flex-1">
      {/* Bandeau configuration incomplète */}
      {config && !config.imapConfigured && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-gold/50 bg-gold-soft/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 lg:mx-4">
          <Info className="h-4 w-4 shrink-0" />
          <p className="flex-1">
            IMAP non configuré — la réception est désactivée. Ouvrez{" "}
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="font-semibold underline underline-offset-2 hover:opacity-80"
            >
              la configuration
            </button>{" "}
            pour connecter votre boîte.
          </p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[248px_minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-4 lg:p-4">
        {/* ─── Rail gauche : actions + dossiers + statut ─── */}
        <aside className="hidden min-h-0 flex-col gap-4 lg:flex">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="space-y-2.5 p-3">
              <Button onClick={() => openCompose()} className="w-full justify-start gap-2 shadow-md shadow-primary/20">
                <Plus className="h-4 w-4" /> Nouveau message
              </Button>
              <Button
                variant="outline"
                onClick={sync}
                disabled={syncing}
                className="w-full justify-start gap-2"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Synchroniser
              </Button>
            </div>
            <Separator />
            <nav aria-label="Dossiers" className="flex flex-col gap-1 p-2">
              {folders.map((f) => (
                <FolderButton
                  key={f.key}
                  active={folder === f.key}
                  label={f.label}
                  icon={f.icon}
                  badge={f.badge}
                  onClick={() => setFolder(f.key)}
                />
              ))}
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings2 className="h-4 w-4 shrink-0" />
                Configuration
              </button>
            </nav>
          </div>

          {/* Carte statut de la connexion */}
          <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Statut de la boîte
            </p>
            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                {config?.smtpConfigured ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className={config?.smtpConfigured ? "" : "text-muted-foreground"}>
                  Envoi SMTP {config?.smtpConfigured ? "actif" : "inactif"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {config?.imapConfigured ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className={config?.imapConfigured ? "" : "text-muted-foreground"}>
                  Réception IMAP {config?.imapConfigured ? "active" : "inactive"}
                </span>
              </div>
              <Separator className="my-1" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {config?.imapUser
                  ? `Compte : ${config.imapUser}`
                  : "Aucun compte connecté"}
                {lastSyncLabel && (
                  <>
                    <br />
                    Dernière sync : {lastSyncLabel}
                  </>
                )}
              </p>
            </div>
          </div>
        </aside>

        {/* ─── Colonne centrale : recherche + liste ─── */}
        <section
          aria-label="Liste des messages"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <div className="space-y-2.5 border-b bg-gradient-to-b from-muted/60 to-transparent p-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold">
                {folderTitle}
                {!loading && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {mails.length} message{mails.length > 1 ? "s" : ""}
                  </span>
                )}
              </h2>
              {/* Suppression en masse — desktop */}
              {!loading && mails.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmBulkOpen(true)}
                  disabled={bulkDeleting}
                  className="ml-auto hidden h-8 gap-1.5 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive lg:flex"
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {folder === "TRASH" ? "Vider la corbeille" : "Tout supprimer"}
                </Button>
              )}
              {/* Actions mobiles (rail caché sur petit écran) */}
              <div className={cn("flex items-center gap-1.5 lg:hidden", !loading && mails.length > 0 && "ml-auto")}>
                {!loading && mails.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmBulkOpen(true)}
                    disabled={bulkDeleting}
                    className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={folder === "TRASH" ? "Vider la corbeille" : "Tout supprimer"}
                  >
                    {bulkDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                <Button size="sm" onClick={() => openCompose()} className="h-8 gap-1 px-2.5">
                  <Plus className="h-3.5 w-3.5" /> Écrire
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sync}
                  disabled={syncing}
                  className="h-8 w-8 px-0"
                  aria-label="Synchroniser"
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfigOpen(true)}
                  className="h-8 w-8 px-0"
                  aria-label="Configuration"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {/* Dossiers mobiles en puces */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 lg:hidden">
              {folders.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFolder(f.key)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    folder === f.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <f.icon className="h-3.5 w-3.5" />
                  {f.label}
                  {typeof f.badge === "number" && f.badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-bold",
                        folder === f.key
                          ? "bg-primary-foreground/25"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {f.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un message, un expéditeur…"
                aria-label="Rechercher un message"
                className="rounded-xl bg-background pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-4 p-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mails.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-950 dark:to-blue-950">
                  <Inbox className="h-8 w-8 text-primary/60" aria-hidden="true" />
                </div>
                <p className="font-semibold">Aucun message</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {folder === "INBOX"
                    ? "Cliquez sur « Synchroniser » pour importer les messages de votre serveur IMAP."
                    : "Les messages de ce dossier apparaîtront ici."}
                </p>
              </div>
            ) : (
              mails.map((mail) => (
                <MailListItem
                  key={mail.id}
                  mail={mail}
                  active={mail.id === selectedId}
                  onSelect={openMail}
                  onToggleStar={toggleStar}
                  onDelete={deleteMail}
                />
              ))
            )}
          </div>
        </section>

        {/* ─── Colonne droite : panneau de lecture (desktop) ─── */}
        <section
          aria-label="Lecture du message"
          className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:flex"
        >
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
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-950 dark:to-blue-950">
                <MailOpen className="h-8 w-8 text-primary/60" aria-hidden="true" />
              </div>
              <p className="font-semibold">Sélectionnez un message</p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                Le contenu du message s&apos;affichera ici. Vous pourrez répondre, supprimer ou
                restaurer le message.
              </p>
            </div>
          )}
        </section>
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
        <DialogContent className="sm:max-w-xl">
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
                rows={8}
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

      {/* ─── Confirmation de la suppression en masse ─── */}
      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {folder === "TRASH" ? "Vider la corbeille ?" : "Tout supprimer ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {folder === "TRASH"
                ? `Les ${mails.length} message${mails.length > 1 ? "s" : ""} de la corbeille seront supprimés définitivement. Cette action est irréversible.`
                : `Tous les messages du dossier « ${folderTitle} » seront déplacés vers la corbeille. Vous pourrez les restaurer depuis celle-ci.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className={cn(
                folder === "TRASH" && "bg-destructive text-white hover:bg-destructive/90"
              )}
            >
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {folder === "TRASH" ? "Vider définitivement" : "Déplacer vers la corbeille"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
