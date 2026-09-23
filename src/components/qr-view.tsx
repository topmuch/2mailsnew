"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Download,
  ExternalLink,
  Info,
  Loader2,
  Luggage,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { QrBagsResult, QrLookup, QrTagResult } from "@/lib/types";

/** Résultat QRtag étendu avec la data-URL base64 renvoyée par l'API (si dispo). */
type QrTagResultWithDataUrl = QrTagResult & { dataUrl: string | null };

const REF_REGEX = /^(HAJJ|VOL)\d{2}-[A-Z0-9]{6}$/;
const DEFAULT_URL = "https://2mails.sn";

/** Date relative en français ("il y a 3 min", "il y a 2 h", "il y a 4 j", date sinon). */
function formatRelativeFr(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Encart explicatif discret réutilisable. */
function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export default function QrTagsView() {
  const { toast } = useToast();

  // ── Onglet Générer un QR ──────────────────────────────────────────────────
  const [qrUrl, setQrUrl] = useState(DEFAULT_URL);
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [size, setSize] = useState("4");
  const [transparent, setTransparent] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [tagResult, setTagResult] = useState<QrTagResultWithDataUrl | null>(null);

  // ── Onglet Suivi QRBags ───────────────────────────────────────────────────
  const [bagsRef, setBagsRef] = useState("");
  const [bagsBusy, setBagsBusy] = useState(false);
  const [bagsResult, setBagsResult] = useState<QrBagsResult | null>(null);

  // ── Historique commun ─────────────────────────────────────────────────────
  const [history, setHistory] = useState<QrLookup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch("/api/qr/history");
      const json = (await res.json()) as { history?: QrLookup[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
      setHistory(json.history ?? []);
    } catch {
      // Silencieux : l'historique ne doit pas bloquer l'utilisation de la vue
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Génération du QR (QRtag.net) ──────────────────────────────────────────
  const generateQr = async () => {
    const trimmed = qrUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({
        title: "URL invalide",
        description: "Le contenu doit commencer par http:// ou https://",
        variant: "destructive",
      });
      return;
    }
    setGenBusy(true);
    try {
      const params = new URLSearchParams({
        url: trimmed,
        format,
        size,
        transparent: String(transparent),
      });
      const res = await authFetch(`/api/qr/qrtag?${params.toString()}`);
      const json = (await res.json()) as {
        result?: QrTagResultWithDataUrl;
        error?: string;
      };
      if (!res.ok || !json.result) throw new Error(json.error ?? "Erreur serveur");
      setTagResult(json.result);
      loadHistory();
      toast({
        title: "QR généré",
        description: `Format ${format.toUpperCase()} · taille ${json.result.size}${transparent ? " · fond transparent" : ""}`,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Génération impossible",
        variant: "destructive",
      });
    } finally {
      setGenBusy(false);
    }
  };

  // ── Recherche QRBags ──────────────────────────────────────────────────────
  const searchBags = async () => {
    const value = bagsRef.trim().toUpperCase();
    if (!value) {
      toast({
        title: "Référence requise",
        description: "Entrez la référence inscrite sur l'étiquette (ex. HAJJ25-ABC123).",
        variant: "destructive",
      });
      return;
    }
    if (!REF_REGEX.test(value)) {
      toast({
        title: "Format invalide",
        description: "Attendu : HAJJ25-ABC123 ou VOL25-ABC123.",
        variant: "destructive",
      });
      return;
    }
    setBagsBusy(true);
    try {
      const res = await authFetch(`/api/qr/qrbags?ref=${encodeURIComponent(value)}`);
      const json = (await res.json()) as { result?: QrBagsResult; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "Erreur serveur");
      setBagsResult(json.result);
      loadHistory();
      if (!json.result.validFormat) {
        toast({ title: "Format invalide", description: json.result.message, variant: "destructive" });
      } else if (json.result.reachable) {
        toast({ title: "Référence vérifiée", description: "Page officielle de suivi disponible." });
      } else {
        toast({
          title: "Service injoignable",
          description: "QRBags n'a pas répondu — réessayez plus tard.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Recherche impossible",
        variant: "destructive",
      });
    } finally {
      setBagsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* En-tête de vue */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">QR &amp; Étiquettes</h2>
          <p className="text-sm text-muted-foreground">
            Génération de QR codes (QRtag.net) et suivi des étiquettes QRBags
          </p>
        </div>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="generate" className="gap-2">
            <QrCode className="h-4 w-4" aria-hidden />
            <span className="truncate">Générer un QR</span>
          </TabsTrigger>
          <TabsTrigger value="qrbags" className="gap-2">
            <Luggage className="h-4 w-4" aria-hidden />
            <span className="truncate">Suivi QRBags</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Onglet 1 : Génération QRtag.net ─────────────────────────────── */}
        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Formulaire */}
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="space-y-2">
                  <Label htmlFor="qr-url">Contenu du QR (URL)</Label>
                  <Input
                    id="qr-url"
                    value={qrUrl}
                    onChange={(e) => setQrUrl(e.target.value)}
                    placeholder="https://exemple.sn"
                    inputMode="url"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Doit commencer par http:// ou https://
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="qr-format">Format</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as "png" | "svg")}>
                      <SelectTrigger id="qr-format" aria-label="Format de l'image QR">
                        <SelectValue placeholder="PNG" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="svg">SVG (vectoriel)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qr-size">Taille</Label>
                    <Select value={size} onValueChange={setSize}>
                      <SelectTrigger id="qr-size" aria-label="Taille de l'image QR">
                        <SelectValue placeholder="4" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                            {n === 4 ? " (défaut)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="qr-transparent" className="cursor-pointer">
                      Fond transparent
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Utile pour incruster le QR sur un visuel
                    </p>
                  </div>
                  <Switch
                    id="qr-transparent"
                    checked={transparent}
                    onCheckedChange={setTransparent}
                  />
                </div>

                <Button onClick={generateQr} disabled={genBusy} className="w-full sm:w-auto">
                  {genBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <QrCode className="h-4 w-4" aria-hidden />
                  )}
                  {genBusy ? "Génération…" : "Générer le QR"}
                </Button>

                <InfoBox>
                  API QRtag.net — gratuite, sans clé, 1 000 requêtes / 10 minutes (images mises en
                  cache 3 jours).
                </InfoBox>
              </CardContent>
            </Card>

            {/* Résultat */}
            {tagResult ? (
              <motion.div
                key={tagResult.imageUrl}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase">
                        {tagResult.format}
                      </Badge>
                      <Badge variant="outline">Taille {tagResult.size}</Badge>
                      {tagResult.transparent && (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Transparent
                        </Badge>
                      )}
                    </div>

                    {/* Cadre blanc : le QR reste lisible en mode sombre */}
                    <div className="flex min-h-48 items-center justify-center rounded-xl border bg-white p-4">
                      <img
                        src={tagResult.dataUrl ?? tagResult.imageUrl}
                        alt={`QR code pointant vers ${tagResult.url}`}
                        className="h-auto max-w-full"
                      />
                    </div>

                    <p className="min-w-0 truncate text-xs text-muted-foreground" title={tagResult.url}>
                      {tagResult.url}
                    </p>

                    <div className="mt-auto flex flex-wrap gap-2">
                      {tagResult.dataUrl ? (
                        <Button size="sm" asChild>
                          <a href={tagResult.dataUrl} download={`qr-code.${tagResult.format}`}>
                            <Download className="h-4 w-4" aria-hidden /> Télécharger
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" asChild>
                          <a href={tagResult.imageUrl} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" aria-hidden /> Télécharger
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <a href={tagResult.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir l&apos;URL
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card className="h-full">
                <CardContent className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
                  <QrCode className="h-10 w-10 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm font-medium">Aucun QR généré</p>
                  <p className="text-xs text-muted-foreground">
                    Renseignez une URL puis cliquez sur « Générer le QR ».
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Onglet 2 : Suivi QRBags ─────────────────────────────────────── */}
        <TabsContent value="qrbags" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Formulaire */}
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="space-y-2">
                  <Label htmlFor="bags-ref">Référence de l&apos;étiquette</Label>
                  <Input
                    id="bags-ref"
                    value={bagsRef}
                    onChange={(e) => setBagsRef(e.target.value.toUpperCase())}
                    placeholder="HAJJ25-ABC123"
                    className="font-mono uppercase"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format attendu : HAJJ25-ABC123 ou VOL25-ABC123 (préfixe HAJJ ou VOL, 2 chiffres,
                    tiret, 6 caractères).
                  </p>
                </div>

                <Button onClick={searchBags} disabled={bagsBusy} className="w-full sm:w-auto">
                  {bagsBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden />
                  )}
                  {bagsBusy ? "Recherche…" : "Rechercher"}
                </Button>

                <InfoBox>
                  QRBags — étiquettes bagages traçables ; entrez la référence inscrite sur
                  l&apos;étiquette pour ouvrir sa page de suivi officielle.
                </InfoBox>
              </CardContent>
            </Card>

            {/* Résultat */}
            {bagsResult ? (
              <motion.div
                key={`${bagsResult.reference}-${bagsResult.reachable}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          bagsResult.validFormat
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        )}
                      >
                        {bagsResult.validFormat ? "Format valide" : "Format invalide"}
                      </Badge>
                      <Badge
                        className={cn(
                          bagsResult.reachable
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {bagsResult.reachable ? "Service joignable" : "Service injoignable"}
                      </Badge>
                      <Badge variant="outline" className="font-mono uppercase">
                        {bagsResult.reference || "—"}
                      </Badge>
                    </div>

                    {bagsResult.info && (
                      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <p>{bagsResult.info}</p>
                      </div>
                    )}

                    {!bagsResult.validFormat && (
                      <p className="text-xs text-muted-foreground">
                        Format attendu : {bagsResult.formatAttendu}
                      </p>
                    )}

                    <p className="text-sm">{bagsResult.message}</p>

                    {bagsResult.sourceUrl ? (
                      <div className="mt-auto">
                        <Button size="sm" asChild>
                          <a
                            href={bagsResult.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir la page
                            officielle de suivi
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-auto">
                        <Button size="sm" disabled>
                          <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir la page officielle
                          de suivi
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card className="h-full">
                <CardContent className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
                  <Luggage className="h-10 w-10 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm font-medium">Aucune recherche effectuée</p>
                  <p className="text-xs text-muted-foreground">
                    Entrez une référence d&apos;étiquette (ex. HAJJ25-ABC123) puis cliquez sur
                    « Rechercher ».
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Historique commun ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Recherches récentes</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={loadHistory}
              disabled={historyLoading}
              aria-label="Actualiser l'historique"
            >
              <RefreshCw className={cn("h-4 w-4", historyLoading && "animate-spin")} aria-hidden />
              Actualiser
            </Button>
          </div>

          {history.length === 0 && !historyLoading ? (
            <p className="text-xs text-muted-foreground">Aucune recherche pour le moment.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-1.5">
              {historyLoading && history.length === 0
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                  ))
                : history.map((item) => (
                    <div
                      key={item.id}
                      className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2"
                    >
                      {/* Statut : point coloré */}
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          item.status === "OK" ? "bg-emerald-500" : "bg-red-500"
                        )}
                        aria-hidden
                      />
                      <span className="sr-only">{item.status === "OK" ? "Succès" : "Erreur"}</span>
                      <Badge
                        className={cn(
                          "shrink-0",
                          item.provider === "QRTAG"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        )}
                      >
                        {item.provider}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm" title={item.query}>
                        {item.query || "—"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeFr(item.createdAt)}
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
