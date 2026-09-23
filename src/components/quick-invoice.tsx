"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import { saveOrOpenInvoicePDF } from "@/lib/pdf";
import type { Invoice } from "@/lib/types";

// ─── Facture rapide en 2 clics : pack prédéfini → facture + PDF ─────────────

interface ProductPack {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  type: string;
}

const TYPE_LABELS: Record<string, string> = {
  QRTAGS: "QRTags",
  QRBAGS: "QRBags",
  SUBSCRIPTION: "Abonnement",
  AUTRE: "Divers",
};

export function QuickInvoice({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { toast } = useToast();
  const [packs, setPacks] = useState<ProductPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/product-packs");
        const json = await res.json();
        if (res.ok) setPacks(json.packs ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleGenerate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const res = await authFetch("/api/quick-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, packId: selectedId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const invoice = json.invoice as Invoice;
      toast({
        title: `Facture ${invoice.number} créée`,
        description: `${clientName} — ${invoice.totalTTC.toLocaleString("fr-FR")} FCFA TTC`,
      });
      // 2ᵉ clic implicite : le PDF s'ouvre immédiatement
      await saveOrOpenInvoicePDF(invoice, "open");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Génération impossible",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-bold">
        <Zap className="h-5 w-5 text-[#1f3fbf]" aria-hidden />
        Facture rapide — {clientName}
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : packs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun pack configuré.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedId(selectedId === pack.id ? null : pack.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  selectedId === pack.id
                    ? "border-[#1f3fbf] bg-[#1f3fbf]/5"
                    : "border-border hover:border-muted-foreground/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate text-sm font-semibold">{pack.name}</span>
                  </span>
                  <span className="shrink-0 font-bold text-[#1f3fbf]">
                    {pack.price.toLocaleString("fr-FR")} F
                  </span>
                </div>
                <div className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                  {TYPE_LABELS[pack.type] ?? pack.type} · {pack.quantity} unité(s) · HT
                </div>
              </button>
          ))}
        </div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={!selectedId || generating}
        className="w-full bg-[#1f3fbf] font-bold text-white hover:bg-[#3a5ce8]"
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
        {generating ? "Génération…" : "Générer la facture"}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        La facture est créée puis le PDF s&apos;ouvre automatiquement (TVA 18 % appliquée).
      </p>
    </div>
  );
}
