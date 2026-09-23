"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  LogIn,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { saveSession } from "@/lib/auth-client";
import type { AuthUser, Settings } from "@/lib/types";

/* ─── Animations d'entrée en cascade ─────────────────────────────────────── */

const panelV: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};

const itemV: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const FEATURES = [
  { icon: FileText, label: "Factures & proformas PDF" },
  { icon: Package, label: "Produits, stock & réappro" },
  { icon: ShieldCheck, label: "Accès sécurisé par rôles" },
];

export function LoginView({
  settings,
  onSuccess,
}: {
  settings: Settings | null;
  onSuccess: (u: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = useMemo(() => new Date().getFullYear(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connexion impossible");
      saveSession(json.token, json.user);
      onSuccess(json.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const defaultName = settings?.nomSociete ?? "2MAILS";

  return (
    /* ─── Écran 16:9 plein cadre : panneau marque + formulaire ─── */
    <div className="flex h-dvh min-h-[540px] w-full overflow-hidden bg-background">
      {/* ═══ Panneau gauche : marque, plein hauteur (~58 %) ═══ */}
      <aside className="luxe-banner relative hidden w-[58%] shrink-0 flex-col justify-between overflow-hidden lg:flex xl:w-[60%]">
        {/* Aurores décoratives + grille */}
        <div aria-hidden className="absolute inset-0">
          <div className="luxe-float-a absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-gold/25 blur-3xl" />
          <div className="luxe-float-b absolute -right-40 bottom-1/4 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
          <div className="luxe-float-c absolute bottom-40 left-1/3 h-[24rem] w-[24rem] rounded-full bg-gold/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]" />
        </div>

        {/* Bandeau haut */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 flex items-center justify-between px-10 pt-7 text-white/85 xl:px-14"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden /> Espace sécurisé
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/70">
            <MapPin className="h-3.5 w-3.5 text-gold" aria-hidden /> Dakar, Sénégal
          </span>
        </motion.div>

        {/* Corps : logo, nom, features */}
        <motion.div
          variants={panelV}
          initial="hidden"
          animate="visible"
          className="relative z-10 flex flex-1 flex-col items-start justify-center gap-7 px-10 text-white xl:px-14"
        >
          <motion.div variants={itemV} className="relative">
            <span aria-hidden className="luxe-glow absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/25 blur-3xl" />
            <div className="relative rounded-3xl border border-white/25 bg-white/95 p-4 shadow-2xl">
              {settings?.logo ? (
                <img
                  src={settings.logo}
                  alt={`Logo ${defaultName}`}
                  className="h-28 w-28 object-contain xl:h-32 xl:w-32"
                />
              ) : (
                <Image
                  src="/logo-2mails.png"
                  alt="Logo 2mails"
                  width={128}
                  height={128}
                  className="h-28 w-28 object-contain xl:h-32 xl:w-32"
                />
              )}
            </div>
          </motion.div>

          <motion.div variants={itemV} className="max-w-2xl">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight drop-shadow xl:text-6xl">
              {defaultName}
            </h1>
            <p className="mt-4 flex items-center gap-2 text-base text-white/85 xl:text-lg">
              <Sparkles className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              {settings?.tagline ?? "Facturation • Stock • Gestion"}
            </p>
          </motion.div>

          <motion.ul variants={panelV} className="grid w-full max-w-2xl grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <motion.li
                key={f.label}
                variants={itemV}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white/90 backdrop-blur transition-colors hover:bg-white/10 xl:text-[15px]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold ring-1 ring-gold/30">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                {f.label}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        {/* Bandeau bas */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative z-10 flex items-center justify-between gap-4 px-10 pb-7 text-[10px] font-medium uppercase tracking-[0.3em] text-white/60 xl:px-14"
        >
          <span>Facturation</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          <span>Gestion</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
        </motion.div>
      </aside>

      {/* ═══ Panneau droit : formulaire (~42 %) ═══ */}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Bascule thème */}
        <div className="absolute right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        {/* Fond décoratif discret (visible surtout en mobile) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="luxe-float-a absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="luxe-float-b absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />
        </div>

        {/* En-tête compact (mobile uniquement) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="relative z-10 mt-14 flex items-center gap-3 px-6 lg:hidden"
        >
          <div className="rounded-xl border border-border bg-background p-1.5 shadow-sm">
            {settings?.logo ? (
              <img src={settings.logo} alt="" className="h-11 w-11 object-contain" />
            ) : (
              <Image src="/logo-2mails.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight text-luxe-gradient">{defaultName}</p>
            <p className="truncate text-xs text-muted-foreground">{settings?.tagline ?? "Facturation & Gestion"}</p>
          </div>
        </motion.div>

        {/* Formulaire centré verticalement */}
        <div className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-10">
          <motion.div
            variants={panelV}
            initial="hidden"
            animate="visible"
            className="w-full max-w-md space-y-6"
          >
            <motion.div variants={itemV}>
              <h2 className="text-3xl font-extrabold tracking-tight xl:text-4xl">
                Bon retour <span className="text-luxe-gradient">parmi nous</span>
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Connectez-vous pour accéder à votre espace de facturation.
              </p>
            </motion.div>

            <form onSubmit={submit} className="space-y-4" aria-label="Formulaire de connexion">
              <motion.div variants={itemV} className="space-y-1.5">
                <Label htmlFor="username">Identifiant</Label>
                <div className="group relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden />
                  <Input
                    id="username"
                    autoComplete="username"
                    className="h-11 rounded-xl pl-9"
                    placeholder="ex : admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </motion.div>

              <motion.div variants={itemV} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  {capsLock && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400" role="status">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> Verr. Maj activé
                    </span>
                  )}
                </div>
                <div className="group relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-11 rounded-xl pl-9 pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </motion.div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.p
                    key="error"
                    role="alert"
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <span className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {error}
                    </span>
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.div variants={itemV}>
                <Button
                  type="submit"
                  disabled={loading}
                  className="btn-shine theme-toggle-luxe group h-12 w-full rounded-xl border-0 text-base font-bold text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Connexion…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" aria-hidden /> Se connecter
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          </motion.div>
        </div>

        {/* Pied de page collé en bas du panneau droit */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="relative z-10 pb-5 pt-2 text-center text-xs text-muted-foreground [padding-bottom:env(safe-area-inset-bottom)]"
        >
          © {year} {defaultName} — Système de facturation sécurisé
        </motion.p>
      </section>
    </div>
  );
}
