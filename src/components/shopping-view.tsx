"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Search, ShoppingCart, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Shopping : comparateur multi-plateformes ─────────────────────────────────
// Task 78 : onglet Shopping. Les sites e-commerce (Amazon, AliExpress, Shein,
// Temu, Cdiscount, eBay, Fnac, Leboncoin) bloquent tous l'iframe embedding
// (X-Frame-Options SAMEORIGIN/DENY) et n'exposent pas de flux RSS publics.
// Solution pragmatique : barre de recherche + tuiles plateforme qui ouvrent
// la recherche sur chaque site dans un nouvel onglet. L'utilisateur saisit
// un produit, choisit une ou plusieurs plateformes, et lance la recherche.

interface Platform {
  id: string;
  name: string;
  color: string; // tailwind classes for the tile gradient
  emoji: string;
  searchUrl: (q: string) => string; // construit l'URL de recherche
  homeUrl: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "amazon",
    name: "Amazon",
    color: "from-[#232F3E] to-[#FF9900]",
    emoji: "📦",
    searchUrl: (q) => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}`,
    homeUrl: "https://www.amazon.fr/",
  },
  {
    id: "aliexpress",
    name: "AliExpress",
    color: "from-[#E62E04] to-[#FF4747]",
    emoji: "🛒",
    searchUrl: (q) => `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
    homeUrl: "https://fr.aliexpress.com/",
  },
  {
    id: "shein",
    name: "Shein",
    color: "from-[#000000] to-[#E5004F]",
    emoji: "👗",
    searchUrl: (q) => `https://fr.shein.com/pdsearch/${encodeURIComponent(q)}/`,
    homeUrl: "https://fr.shein.com/",
  },
  {
    id: "temu",
    name: "Temu",
    color: "from-[#FB7701] to-[#FFB300]",
    emoji: "🔥",
    searchUrl: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`,
    homeUrl: "https://www.temu.com/",
  },
  {
    id: "cdiscount",
    name: "Cdiscount",
    color: "from-[#005C9E] to-[#FFD200]",
    emoji: "🏷️",
    searchUrl: (q) => `https://www.cdiscount.com/search/${encodeURIComponent(q)}.html`,
    homeUrl: "https://www.cdiscount.com/",
  },
  {
    id: "ebay",
    name: "eBay",
    color: "from-[#E53238] to-[#0064D2]",
    emoji: "🏛️",
    searchUrl: (q) => `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(q)}`,
    homeUrl: "https://www.ebay.fr/",
  },
  {
    id: "fnac",
    name: "Fnac",
    color: "from-[#E1A925] to-[#0E1A2B]",
    emoji: "🎵",
    searchUrl: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(q)}`,
    homeUrl: "https://www.fnac.com/",
  },
  {
    id: "leboncoin",
    name: "Leboncoin",
    color: "from-[#FF6314] to-[#FFA940]",
    emoji: "📰",
    searchUrl: (q) => `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(q)}`,
    homeUrl: "https://www.leboncoin.fr/",
  },
  {
    id: "rakuten",
    name: "Rakuten",
    color: "from-[#BF0000] to-[#FF5252]",
    emoji: "💝",
    searchUrl: (q) => `https://fr.shopping.rakuten.com/search/${encodeURIComponent(q)}/`,
    homeUrl: "https://fr.shopping.rakuten.com/",
  },
  {
    id: "laredoute",
    name: "La Redoute",
    color: "from-[#1A1A1A] to-[#C8102E]",
    emoji: "🛍️",
    searchUrl: (q) => `https://www.laredoute.fr/search/${encodeURIComponent(q)}.aspx`,
    homeUrl: "https://www.laredoute.fr/",
  },
  {
    id: "bnf-darty",
    name: "Darty",
    color: "from-[#E2001A] to-[#4A4A4A]",
    emoji: "🔌",
    searchUrl: (q) => `https://www.darty.com/nav/recherche/${encodeURIComponent(q)}.html`,
    homeUrl: "https://www.darty.com/",
  },
  {
    id: "boulanger",
    name: "Boulanger",
    color: "from-[#0066B3] to-[#FF6600]",
    emoji: "💡",
    searchUrl: (q) => `https://www.boulanger.com/resultat?tr=${encodeURIComponent(q)}`,
    homeUrl: "https://www.boulanger.com/",
  },
];

const SUGGESTIONS = [
  "iPhone 15",
  "casque bluetooth",
  "aspirateur robot",
  "montre connectée",
  "console PS5",
  "machine à café",
  "trottinette électrique",
  "smart TV 55 pouces",
  "écouteurs sans fil",
  "tablette graphique",
];

export default function ShoppingView() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["amazon", "aliexpress", "cdiscount"]));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(PLATFORMS.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const search = (platform?: Platform) => {
    const q = query.trim();
    if (!q) return;
    if (platform) {
      window.open(platform.searchUrl(q), "_blank", "noopener,noreferrer");
      return;
    }
    // Recherche multi-plateformes : ouvre chaque plateforme sélectionnée dans un onglets
    const targets = PLATFORMS.filter((p) => selected.has(p.id));
    for (const p of targets) {
      window.open(p.searchUrl(q), "_blank", "noopener,noreferrer");
    }
  };

  const openHome = (p: Platform) => {
    window.open(p.homeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      {/* ─── En-tête + barre de recherche ─── */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShoppingCart className="h-6 w-6 text-gold" aria-hidden /> Shopping
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Comparez les prix sur Amazon, AliExpress, Shein, Temu, Cdiscount et plus — recherchez un produit et lancez la comparaison sur plusieurs sites d'un seul clic.
        </p>
      </div>

      {/* Barre de recherche */}
      <Card className="p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="Rechercher un produit (ex : iPhone 15, casque bluetooth…)"
              className="pl-9"
              aria-label="Rechercher un produit"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            onClick={() => search()}
            disabled={!query.trim() || selected.size === 0}
            className="gap-2"
          >
            <Search className="h-4 w-4" aria-hidden /> Comparer sur {selected.size} site{selected.size > 1 ? "s" : ""}
          </Button>
        </div>

        {/* Suggestions rapides */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Suggestions :</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-muted/70"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {/* ─── Sélection des plateformes ─── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Plateformes ({selected.size}/{PLATFORMS.length} sélectionnées)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={selectAll} className="h-7 text-xs">Tout sélectionner</Button>
          <Button size="sm" variant="ghost" onClick={selectNone} className="h-7 text-xs">Tout désélectionner</Button>
        </div>
      </div>

      {/* Grille des plateformes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {PLATFORMS.map((p) => {
          const active = selected.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              onDoubleClick={() => openHome(p)}
              className={cn(
                "group relative overflow-hidden rounded-xl border-2 shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                active ? "border-gold" : "border-transparent hover:border-muted"
              )}
              aria-pressed={active}
              title={`${p.name}${active ? " (sélectionné)" : ""} — double-clic pour ouvrir l'accueil`}
            >
              {/* Gradient background */}
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", p.color)} />
              <div className="relative flex h-24 flex-col items-center justify-center gap-1 p-3 text-white">
                <span className="text-3xl" aria-hidden>{p.emoji}</span>
                <span className="text-sm font-bold drop-shadow">{p.name}</span>
                {active && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
                    ✓
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </motion.div>

      {/* ─── Astuce d'utilisation ─── */}
      <Card className="border-dashed p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Comment ça marche ?</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Saisissez un produit dans la barre de recherche (ou cliquez sur une suggestion).</li>
              <li>• Sélectionnez les plateformes à comparer (clic pour sélectionner/désélectionner).</li>
              <li>• Cliquez « Comparer sur N sites » — chaque site s'ouvre dans un onglet avec votre recherche.</li>
              <li>• Double-clic sur une tuile ouvre directement la page d'accueil du site.</li>
            </ul>
            <p className="pt-1 text-xs text-muted-foreground">
              💡 Les sites e-commerce (Amazon, AliExpress, Shein…) bloquent l'affichage intégré — c'est pourquoi les résultats s'ouvrent dans des onglets séparés. Votre navigateur peut bloquer les pop-ups : autorisez-les pour cette page si rien ne s'ouvre.
            </p>
          </div>
        </div>
      </Card>

      {/* ─── Liens rapides (homepage de chaque plateforme) ─── */}
      <div>
        <p className="mb-2 text-sm font-medium">Accès direct</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <a
              key={p.id}
              href={p.homeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-muted"
            >
              <span aria-hidden>{p.emoji}</span>
              {p.name}
              <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
