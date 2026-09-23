"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";

// ─── WhatsApp Rapide : modèles pré-écrits + message libre → wa.me ────────────

interface WhatsAppTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  RELANCE: "Relance",
  PROPOSITION: "Offre",
  SUPPORT: "Support",
  AUTRE: "Divers",
};

/** Normalise un numéro sénégalais (ou international) pour wa.me (chiffres uniquement). */
export function normalizeWaPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("221")) return digits;
  if (digits.length === 9) return `221${digits}`; // numéro local sénégalais
  return digits;
}

/** Remplit les variables {{...}} du modèle. */
function fillTemplate(
  content: string,
  vars: Record<string, string | number>,
): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) =>
    key in vars ? String(vars[key]) : "",
  );
}

export function WhatsAppQuickSend({
  clientName,
  clientPhone,
  clientContextId,
  invoiceContext,
}: {
  clientName: string;
  clientPhone: string;
  /** id du client : permet de pré-remplir la relance avec sa facture impayée */
  clientContextId?: string;
  invoiceContext?: { number: string; amount: string; dueDate: string } | null;
}) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [autoInvoice, setAutoInvoice] = useState<{
    number: string;
    amount: string;
    dueDate: string;
  } | null>(invoiceContext ?? null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/whatsapp-templates");
        const json = await res.json();
        if (res.ok) setTemplates(json.templates ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Pré-remplissage relance : la facture impayée la plus ancienne du client
  useEffect(() => {
    if (!clientContextId || autoInvoice) return;
    (async () => {
      try {
        const res = await authFetch(
          `/api/invoices?type=VENTE&clientId=${encodeURIComponent(clientContextId)}`,
        );
        if (!res.ok) return;
        const invoices = (await res.json()) as Array<{
          number: string;
          dueDate: string | null;
          paymentStatus: string;
          totalTTC: number;
          amountPaid: number;
        }>;
        const unpaid = invoices
          .filter((i) => i.paymentStatus !== "PAYE")
          .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0];
        if (unpaid) {
          setAutoInvoice({
            number: unpaid.number,
            amount: Math.round(unpaid.totalTTC - unpaid.amountPaid).toLocaleString("fr-FR"),
            dueDate: unpaid.dueDate
              ? new Date(unpaid.dueDate).toLocaleDateString("fr-FR")
              : "—",
          });
        }
      } catch {
        /* silencieux : les variables resteront vides */
      }
    })();
  }, [clientContextId, autoInvoice]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const message = selected
    ? fillTemplate(selected.content, {
        clientName,
        invoiceNumber: autoInvoice?.number ?? "",
        amount: autoInvoice?.amount ?? "",
        dueDate: autoInvoice?.dueDate ?? "",
      })
    : customMessage;

  const handleSend = () => {
    const phone = normalizeWaPhone(clientPhone);
    if (!phone) {
      toast({ title: "Numéro manquant", description: "Ajoutez un téléphone à ce client.", variant: "destructive" });
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-bold">
        <MessageCircle className="h-5 w-5 text-emerald-600" aria-hidden />
        WhatsApp rapide — {clientName}
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun modèle disponible.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setSelectedId(selectedId === template.id ? null : template.id);
                }}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  selectedId === template.id
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-border hover:border-muted-foreground/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{template.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                  {template.content.substring(0, 80)}…
                </div>
              </button>
            ))}
        </div>
      )}

      <Textarea
        value={customMessage}
        onChange={(e) => {
          setCustomMessage(e.target.value);
          setSelectedId(null);
        }}
        placeholder="Ou écrivez votre message personnalisé…"
        rows={3}
        aria-label="Message personnalisé"
      />

      {selected && (
        <div className="whitespace-pre-line rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="mb-1 block font-bold text-foreground">Aperçu :</span>
          {message}
        </div>
      )}

      <Button
        onClick={handleSend}
        disabled={!selected && !customMessage.trim()}
        className="w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700"
      >
        <Send className="h-4 w-4" aria-hidden />
        Envoyer via WhatsApp
      </Button>
    </div>
  );
}
