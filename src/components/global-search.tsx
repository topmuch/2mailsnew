"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Contact,
  FileText,
  Loader2,
  Mail,
  Package,
  Search,
  UserPlus,
  ListChecks,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { authFetch } from "@/lib/auth-client";
import { useDebouncedValue } from "@/hooks/use-fetch";
import type { GlobalSearchGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<GlobalSearchGroup["type"], React.ComponentType<{ className?: string }>> = {
  CLIENT: Contact,
  INVOICE: FileText,
  PRODUCT: Package,
  TASK: ListChecks,
  EVENT: CalendarDays,
  LEAD: UserPlus,
  MAIL: Mail,
};

/**
 * Palette de recherche globale (Ctrl+K / ⌘K) : clients, factures, produits,
 * tâches, RDV, leads, e-mails. Événement custom `2mails:open-search` pour
 * l'ouvrir depuis les boutons de la barre supérieure.
 */
export function GlobalSearch({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const reqId = useRef(0);

  // Raccourci clavier global + événement custom (boutons déclencheurs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("2mails:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("2mails:open-search", onOpen);
    };
  }, []);

  // Requête API avec annulation des réponses obsolètes (uniquement ≥ 2 caractères)
  // NB : setLoading(true) est déclenché par le handler de saisie (pas ici).
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) return;
    const id = ++reqId.current;
    authFetch(`/api/global-search?q=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((json: { groups?: GlobalSearchGroup[] }) => {
        if (id === reqId.current) setGroups(json.groups ?? []);
      })
      .catch(() => {
        if (id === reqId.current) setGroups([]);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [debounced, open]);

  const q = debounced.trim();
  // Dérivé : on n'affiche rien sous 2 caractères (sans effet de bord)
  const visibleGroups = q.length < 2 ? [] : groups;
  const searching = q.length >= 2 && loading;

  const selectItem = useCallback(
    (view: string) => {
      setOpen(false);
      setQuery("");
      onNavigate(view);
    },
    [onNavigate]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setGroups([]);
          setLoading(false);
        }
      }}
      title="Recherche globale"
      description="Rechercher dans toute l'application"
      className="sm:max-w-xl top-[8%] translate-y-0"
    >
      <div className="relative">
        <CommandInput
          placeholder="Rechercher un client, une facture, un produit…"
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            if (v.trim().length >= 2) setLoading(true);
          }}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
      <CommandList className="max-h-[60vh]">
        {q.length >= 2 && !searching && visibleGroups.length === 0 && (
          <CommandEmpty>Aucun résultat pour « {q} »</CommandEmpty>
        )}
        {q.length < 2 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Tapez au moins 2 caractères — recherche parmi les clients, factures,
            proformas, produits, tâches, rendez-vous, leads et e-mails.
          </div>
        )}
        {visibleGroups.map((group) => {
          const Icon = TYPE_ICONS[group.type] ?? Search;
          return (
            <CommandGroup key={group.type} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`${item.title} ${item.sub ?? ""} ${item.type}`}
                  onSelect={() => selectItem(item.view)}
                  className="cursor-pointer"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.sub && <p className="truncate text-xs text-muted-foreground">{item.sub}</p>}
                  </div>
                  <span
                    className={cn(
                      "ml-2 hidden shrink-0 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block"
                    )}
                  >
                    Ouvrir
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
      <div className="border-t px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          Raccourci : <kbd className="rounded border bg-muted px-1 font-sans">Ctrl</kbd>{" "}
          + <kbd className="rounded border bg-muted px-1 font-sans">K</kbd>
        </span>
        <span>Entrée pour ouvrir · Échap pour fermer</span>
      </div>
    </CommandDialog>
  );
}

/** Bouton déclencheur (barre supérieure desktop / header mobile). */
export function GlobalSearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("2mails:open-search"))}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 text-sidebar-foreground transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
        className
      )}
      aria-label="Recherche globale (Ctrl+K)"
      title="Recherche globale (Ctrl+K)"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden text-xs font-medium md:block">Rechercher…</span>
      <kbd className="hidden rounded border border-white/30 bg-white/10 px-1 font-sans text-[10px] md:block">
        Ctrl K
      </kbd>
    </button>
  );
}
