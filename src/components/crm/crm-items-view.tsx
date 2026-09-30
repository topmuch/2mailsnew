"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Globe, Loader2, Luggage, QrCode, RefreshCw, Search, ShieldCheck, TriangleAlert, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { ItemStatusBadge, formatRelativeFr } from "@/components/crm/crm-shared";
import type { CrmItem } from "@/lib/types";

// ─── Suivi des items d'une plateforme (QRBAGS, QRTAGS ou VERIFSCAN) ────────────────────

const PLATFORM_META = {
  QRBAGS: {
    title: "Suivi QR Bags",
    subtitle: "Bagages enregistrés sur qrbags.com — activés, perdus, retrouvés.",
    icon: Luggage,
  },
  QRTAGS: {
    title: "Suivi QR Tags",
    subtitle: "Étiquettes enregistrées sur qrtags.pro — activées, perdues, retrouvées.",
    icon: QrCode,
  },
  VERIFSCAN: {
    title: "Suivi VerifScan",
    subtitle: "Vérifications enregistrées sur verifscan.com — activées, scans, statuts.",
    icon: ShieldCheck,
  },
} as const;

export default function CrmItemsView({ platform }: { platform: "QRBAGS" | "QRTAGS" | "VERIFSCAN" }) {
  const { toast } = useToast();
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;

  const [items, setItems] = useState<CrmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("TOUS");
  const [typeFilter, setTypeFilter] = useState("TOUS");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await authFetch(`/api/crm/items?platform=${platform}`);
        if (!res.ok) throw new Error("Chargement impossible");
        setItems(await res.json());
      } catch {
        if (!silent) toast({ title: "Erreur", description: "Impossible de charger les items", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [platform, toast]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const syncPlatform = async () => {
    setSyncing(true);
    try {
      const res = await authFetch(`/api/crm/sync?platform=${platform}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const r = json.results?.[0];
      toast({
        title: r ? `Synchronisation ${platform} terminée` : "Synchronisation",
        description: r ? `${r.total} item(s) — ${r.created} créé(s), ${r.updated} mis à jour` : undefined,
      });
      load();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "TOUS" && i.status !== statusFilter) return false;
      if (typeFilter !== "TOUS" && i.type !== typeFilter) return false;
      if (!q) return true;
      return [i.code, i.externalId, i.ownerName, i.ownerPhone, i.lastScanPlace]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, query, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((i) => i.status === "ACTIVE").length,
      lost: items.filter((i) => i.status === "LOST").length,
      found: items.filter((i) => i.status === "FOUND").length,
    };
  }, [items]);

  // Infos publiques du site (item type SITE créé par la synchronisation sans clé API,
  // ex. verifscan.com) : titre, description, image Open Graph, URL.
  const siteInfo = useMemo<null | {
    code: string;
    title: string;
    description: string;
    image: string;
    url: string;
    updatedAt: string;
  }>(() => {
    const site = items.find((i) => i.type === "SITE");
    if (!site) return null;
    let raw: { title?: string; description?: string; image?: string; url?: string } = {};
    try {
      raw = site.raw ? (JSON.parse(site.raw) as typeof raw) : {};
    } catch {
      raw = {};
    }
    return {
      code: site.code,
      title: site.ownerName || raw.title || site.code,
      description: raw.description ?? "",
      image: raw.image ?? "",
      url: raw.url || `https://${site.code}`,
      updatedAt: site.updatedAt,
    };
  }, [items]);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Icon className="h-6 w-6 text-gold" aria-hidden />
            {meta.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{meta.subtitle}</p>
        </div>
        <Button onClick={syncPlatform} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Synchroniser {platform}
        </Button>
      </div>

      {/* Infos du site (synchronisées depuis le domaine public, ex. verifscan.com) */}
      {siteInfo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card className="border-gold/40 bg-gradient-to-br from-gold/5 to-transparent p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {siteInfo.image ? (
                <img
                  src={siteInfo.image}
                  alt={`Aperçu de ${siteInfo.code}`}
                  className="h-20 w-20 rounded-lg border bg-background object-cover shrink-0"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-background shrink-0">
                  <Globe className="h-8 w-8 text-gold" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold truncate">{siteInfo.title}</h2>
                  <Badge variant="outline" className="text-[10px] border-gold/50 text-gold">Infos du site</Badge>
                </div>
                {siteInfo.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{siteInfo.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <a
                    href={siteInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    {siteInfo.code}
                  </a>
                  <span className="text-[11px] text-muted-foreground">
                    Synchronisé {formatRelativeFr(siteInfo.updatedAt).toLowerCase()}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Compteurs rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.total, cls: "" },
          { label: "Actifs", value: counts.active, cls: "text-emerald-600 dark:text-emerald-400" },
          { label: "Perdus", value: counts.lost, cls: "text-destructive" },
          { label: "Retrouvés", value: counts.found, cls: "text-amber-600 dark:text-amber-400" },
        ].map((c) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Card className="p-3 text-center">
              <p className={`text-xl font-bold tabular-nums ${c.cls}`}>{c.value}</p>
              <p className="text-[11px] text-muted-foreground">{c.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Rechercher (code, propriétaire, téléphone, lieu…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un item"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Tous les statuts</SelectItem>
            <SelectItem value="ACTIVE">Actifs</SelectItem>
            <SelectItem value="LOST">Perdus</SelectItem>
            <SelectItem value="FOUND">Retrouvés</SelectItem>
            <SelectItem value="SUSPENDED">Suspendus</SelectItem>
            <SelectItem value="INACTIVE">Inactifs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrer par type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Tous les types</SelectItem>
            <SelectItem value="TAG">Tags</SelectItem>
            <SelectItem value="BAGAGE">Bagages</SelectItem>
            <SelectItem value="SITE">Sites</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tableau des items */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center px-4">
              <Icon className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="font-semibold">Aucun item {items.length === 0 ? "enregistré" : "ne correspond aux filtres"}</p>
              <p className="text-sm text-muted-foreground max-w-md">
                {items.length === 0
                  ? "Les items apparaissent ici dès réception d'un webhook de la plateforme ou après une synchronisation manuelle (URL API + clé API à configurer dans l'onglet CRM)."
                  : "Modifiez la recherche ou les filtres pour élargir la liste."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code / Réf.</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden md:table-cell">Propriétaire</TableHead>
                    <TableHead className="hidden lg:table-cell">Dernier scan</TableHead>
                    <TableHead className="text-right">Scans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-mono font-semibold text-sm">{item.code || item.externalId}</p>
                        {item.code && <p className="text-[10px] text-muted-foreground font-mono">{item.externalId}</p>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-[10px]">
                          {item.type === "BAGAGE" ? "Bagage" : item.type === "SITE" ? "Site" : "Tag"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ItemStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm truncate max-w-40">{item.ownerName || "—"}</p>
                        {item.ownerPhone && <p className="text-[11px] text-muted-foreground">{item.ownerPhone}</p>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <p className="text-sm">{formatRelativeFr(item.lastScanAt)}</p>
                        {item.lastScanPlace && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {item.lastScanPlace}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{item.scanCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {counts.lost > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <p>
            <strong>{counts.lost}</strong> QR code(s) déclaré(s) perdu(s) sur cette plateforme. Ce compteur se met à jour automatiquement à chaque webhook « item_lost ».
          </p>
        </div>
      )}
    </div>
  );
}
