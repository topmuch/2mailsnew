"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Actus : actualités web avec photos ──────────────────────────────────────
// Onglet « Actus » (Task 68, demande utilisateur) : récupère des actualités
// via /api/news (recherche web + photo réelle de chaque article extraite du
// site source), les affiche en grille de cartes cliquables.
// 4 sujets : À la une, Économie, Tech, Sport. Cache serveur 30 min/sujet,
// bouton Actualiser, squelettes pendant le chargement, placeholder doré
// quand un article n'a pas de photo.

interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  host: string;
  date: string;
  image: string | null;
}

interface NewsPayload {
  items: NewsItem[];
  fetchedAt: number;
  label: string;
  cached?: boolean;
  stale?: boolean;
}

const TOPICS = [
  { key: "a-la-une", label: "À la une" },
  { key: "economie", label: "Économie" },
  { key: "tech", label: "Tech" },
  { key: "sport", label: "Sport" },
];

const fmtDate = (d: string) => {
  const t = new Date(d).getTime();
  if (!Number.isFinite(t) || !d) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(t);
};

const fmtAge = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
};

export default function NewsView() {
  const [topic, setTopic] = useState("a-la-une");
  const [data, setData] = useState<NewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: string, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/news?topic=${t}${refresh ? "&refresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? "Erreur"));
      setData(json as NewsPayload);
    } catch {
      setError("Impossible de charger les actualités. Vérifiez la connexion internet puis réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(topic);
  }, [topic, load]);

  return (
    <div className="space-y-5">
      {/* ─── En-tête ─── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Newspaper className="h-6 w-6 text-gold" aria-hidden /> Actus
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {data
              ? `L'actualité ${data.label.toLowerCase()} — mise à jour ${fmtAge(data.fetchedAt)}${data.stale ? " (cache)" : ""}`
              : "L'actualité du Sénégal et du monde, avec les photos."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(topic, true)} disabled={loading} className="shrink-0 gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden /> Actualiser
        </Button>
      </div>

      {/* ─── Sujets (pilules) ─── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Choisir un sujet">
        {TOPICS.map((t) => {
          const active = topic === t.key;
          return (
            <Button
              key={t.key}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setTopic(t.key)}
              aria-pressed={active}
            >
              {t.label}
            </Button>
          );
        })}
      </div>

      {/* ─── Contenu ─── */}
      {loading ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Recherche des articles et récupération des photos… (quelques secondes)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="overflow-hidden p-0 shadow-sm">
                <div className="aspect-video animate-pulse bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
          </div>
          <p className="font-semibold">Oups, les actus ne sont pas arrivées</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => load(topic, true)} className="mt-2">
            <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
          </Button>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15">
            <Newspaper className="h-6 w-6 text-gold" aria-hidden />
          </div>
          <p className="font-semibold">Aucune actualité trouvée</p>
          <p className="max-w-sm text-sm text-muted-foreground">Essayez un autre sujet ou actualisez dans un instant.</p>
        </Card>
      ) : (
        <motion.div
          key={topic}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {data.items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label={`Lire : ${item.title}`}
            >
              {/* Photo : placeholder doré sous l'image réelle (fallback auto si casse) */}
              <div className="relative aspect-video overflow-hidden bg-muted">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gold/15 via-muted to-[#0b366b]/10">
                  <Newspaper className="h-8 w-8 text-gold/50" aria-hidden />
                </div>
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-gold group-hover:underline">
                  {item.title}
                </h3>
                {item.snippet && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.snippet}</p>}
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {item.host}
                    {fmtDate(item.date) ? ` · ${fmtDate(item.date)}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-medium text-gold">
                    Lire <ExternalLink className="h-3 w-3" aria-hidden />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </motion.div>
      )}
    </div>
  );
}
