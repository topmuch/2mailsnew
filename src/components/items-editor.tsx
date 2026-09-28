"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ChevronsUpDown, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

export interface DraftItem {
  productId: string | null;
  productName: string;
  category: string | null;
  unit: string;
  quantity: string;
  unitPrice: string;
}

export function emptyItem(): DraftItem {
  return {
    productId: null,
    productName: "",
    category: null,
    unit: "pièce",
    quantity: "1",
    unitPrice: "0",
  };
}

export function itemToApi(item: DraftItem) {
  return {
    productId: item.productId,
    productName: item.productName.trim() || "Article",
    category: item.category,
    unit: item.unit,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
  };
}

interface ItemsEditorProps {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  products: Product[];
  priceField?: "salePrice" | "purchasePrice";
  disabled?: boolean;
  /** Ouvre le dialogue de création rapide de produit (optionnel). */
  onCreateProduct?: (searchTerm: string) => void;
}

export function ItemsEditor({
  items,
  onChange,
  products,
  priceField = "salePrice",
  disabled = false,
  onCreateProduct,
}: ItemsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const update = (index: number, patch: Partial<DraftItem>) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const addFromCatalog = (product: Product) => {
    onChange([
      ...items,
      {
        productId: product.id,
        productName: product.name,
        category: product.category,
        unit: product.unit,
        quantity: "1",
        unitPrice: String(product[priceField]),
      },
    ]);
    setPickerOpen(false);
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.reference ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const lineTotal = (it: DraftItem) =>
    (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);

  return (
    <div className="space-y-2">
      {/* ─── Barre de recherche de produits ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              aria-label="Rechercher un produit du catalogue"
              disabled={disabled}
              className="h-10 w-full justify-start gap-2 sm:w-[360px]"
            >
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground font-normal">
                Rechercher un produit…
              </span>
              <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Nom ou référence du produit…"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-64">
                <CommandEmpty>
                  Aucun produit trouvé
                  {search.trim() ? ` pour « ${search.trim()} »` : ""}.
                </CommandEmpty>
                <CommandGroup>
                  {filtered.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => addFromCatalog(p)}
                      className="cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatMoney(p[priceField])} · stock {p.stock} {p.unit}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {onCreateProduct && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value="__create__"
                        onSelect={() => {
                          setPickerOpen(false);
                          onCreateProduct(search.trim());
                        }}
                        className="cursor-pointer text-primary"
                      >
                        <PackagePlus className="h-4 w-4" aria-hidden />
                        Créer un produit{search.trim() ? ` « ${search.trim()} »` : ""}…
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">
          ou saisissez un article libre ci-dessous
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
          Aucun article. Recherchez un produit du catalogue, appuyez sur le bouton + ci-dessous ou saisissez un article libre.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Désignation</th>
                <th className="p-2 font-medium w-20">Qté</th>
                <th className="p-2 font-medium w-24">Unité</th>
                <th className="p-2 font-medium w-28">Prix unitaire</th>
                <th className="p-2 font-medium w-28 text-right">Total</th>
                <th className="p-2 w-10" aria-label="Supprimer" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="p-1.5">
                    <Input
                      value={it.productName}
                      onChange={(e) => update(idx, { productName: e.target.value })}
                      placeholder="Nom de l'article"
                      className="h-8"
                      disabled={disabled}
                      aria-label="Désignation de l'article"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={it.quantity}
                      onChange={(e) => update(idx, { quantity: e.target.value })}
                      className="h-8"
                      disabled={disabled}
                      aria-label="Quantité"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      value={it.unit}
                      onChange={(e) => update(idx, { unit: e.target.value })}
                      className="h-8"
                      disabled={disabled}
                      aria-label="Unité"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="25"
                      value={it.unitPrice}
                      onChange={(e) => update(idx, { unitPrice: e.target.value })}
                      className="h-8 text-right"
                      disabled={disabled}
                      aria-label="Prix unitaire"
                    />
                  </td>
                  <td className="p-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                    {formatMoney(lineTotal(it))}
                  </td>
                  <td className="p-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8 text-muted-foreground hover:text-destructive")}
                      onClick={() => onChange(items.filter((_, i) => i !== idx))}
                      disabled={disabled}
                      aria-label={`Supprimer l'article ${it.productName || idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Bouton + : ajouter une ligne d'article libre (Task 61) ─── */}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...items, emptyItem()])}
        disabled={disabled}
        className="w-full justify-center gap-2 border-dashed text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        aria-label="Ajouter une ligne d'article"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Ajouter une ligne d&apos;article
      </Button>

      {/* Rappel discret : création rapide */}
      {onCreateProduct && (
        <button
          type="button"
          onClick={() => onCreateProduct("")}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Créer un produit
        </button>
      )}
    </div>
  );
}
