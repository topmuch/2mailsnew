"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Pencil, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";
import { formatRelativeFr } from "@/components/crm/crm-shared";
import CrmCoachChat from "@/components/crm/crm-coach-chat";
import type { CrmCoachMessage, CrmSentMessage } from "@/lib/types";

// ─── Coach Virtuel : 5 messages/jour ─────────────────────────────────────────
// 11h Business, 14h Mindset, 17h Closing + 12h & 18h « visuels réseaux
// sociaux » (TikTok, LinkedIn, Facebook — Task 57).

type CoachSlotUi = "11h" | "12h" | "14h" | "17h" | "18h";

const SLOTS: { slot: CoachSlotUi; title: string; desc: string; emoji: string }[] = [
  { slot: "11h", title: "Focus Business", desc: "Relances, prospection, devis", emoji: "🎯" },
  { slot: "12h", title: "Visuels réseaux sociaux", desc: "Post TikTok, LinkedIn, Facebook", emoji: "📱" },
  { slot: "14h", title: "Motivation", desc: "Mindset et persévérance", emoji: "💪" },
  { slot: "17h", title: "Closing", desc: "Bilan et dernière ligne droite", emoji: "🏁" },
  { slot: "18h", title: "Visuels du soir", desc: "Post TikTok, LinkedIn, Facebook", emoji: "🌆" },
];

export default function CrmCoachView({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<CrmCoachMessage[]>([]);
  const [history, setHistory] = useState<CrmSentMessage[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ "11h": 0, "12h": 0, "14h": 0, "17h": 0, "18h": 0 });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmCoachMessage | null>(null);
  const [formSlot, setFormSlot] = useState<CoachSlotUi>("11h");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/coach");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages ?? []);
      setHistory(data.history ?? []);
      setCounts(data.counts ?? {});
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger le coach virtuel", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = (slot: CoachSlotUi) => {
    setEditing(null);
    setFormSlot(slot);
    setFormContent("");
    setDialogOpen(true);
  };

  const openEdit = (m: CrmCoachMessage) => {
    setEditing(m);
    setFormSlot(m.timeSlot);
    setFormContent(m.content);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!formContent.trim()) {
      toast({ title: "Le contenu est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/crm/coach", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, content: formContent } : { timeSlot: formSlot, content: formContent }),
      });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Message mis à jour" : "Message ajouté" });
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible (admin requis)", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: CrmCoachMessage) => {
    try {
      const res = await authFetch("/api/crm/coach", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast({ title: "Erreur", description: "Action impossible (admin requis)", variant: "destructive" });
    }
  };

  const remove = async (m: CrmCoachMessage) => {
    if (!confirm("Supprimer ce message du coach ?")) return;
    try {
      const res = await authFetch(`/api/crm/coach?id=${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Message supprimé" });
      load();
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible (admin requis)", variant: "destructive" });
    }
  };

  const sendNow = async (slot: CoachSlotUi) => {
    setSending(slot);
    try {
      const res = await authFetch("/api/crm/coach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeSlot: slot }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: `Message ${slot} envoyé`, description: data.preview?.slice(0, 90) ?? "" });
      } else {
        toast({ title: "Échec d'envoi", description: data.error ?? data.preview ?? "Erreur inconnue", variant: "destructive" });
      }
      load();
    } catch {
      toast({ title: "Erreur", description: "Envoi impossible", variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Bot className="h-6 w-6 text-gold" /> Coach Virtuel
        </h1>
        <p className="text-sm text-muted-foreground">
          Discutez en direct avec votre coach IA (il connaît vos données du jour) et recevez 5 messages par jour
          (11h, 14h, 17h + 12h &amp; 18h « visuels réseaux sociaux ») — du lundi au samedi, arrêt le samedi à 13h, repos le dimanche.
        </p>
      </div>

      {/* Chat en direct avec le coach IA */}
      <CrmCoachChat />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}><CardContent className="space-y-3 p-6">
              <Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SLOTS.map((s) => {
            const slotMessages = messages.filter((m) => m.timeSlot === s.slot);
            return (
              <Card key={s.slot} className="flex flex-col border-l-4 border-l-gold">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="flex items-center gap-1.5 font-bold">
                        <span aria-hidden>{s.emoji}</span> {s.slot} — {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                    <Badge variant="outline" className="bg-gold/10 text-gold border-gold/30 shrink-0">
                      {counts[s.slot] ?? 0} actif(s)
                    </Badge>
                  </div>

                  <div className="max-h-80 flex-1 space-y-2 overflow-y-auto pr-1">
                    {slotMessages.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">Aucun message dans ce créneau.</p>
                    ) : (
                      slotMessages.map((m) => (
                        <div key={m.id} className={`rounded-md border p-2.5 text-xs leading-relaxed ${m.isActive ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}>
                          <p>{m.content}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {isAdmin && (
                                <Switch
                                  checked={m.isActive}
                                  onCheckedChange={() => toggleActive(m)}
                                  aria-label={`Activer/désactiver le message`}
                                  className="scale-75"
                                />
                              )}
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {m.isActive ? "Actif" : "Inactif"}
                              </span>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-0.5">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(m)} aria-label="Modifier le message">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(m)} aria-label="Supprimer le message">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={sending !== null || (counts[s.slot] ?? 0) === 0}
                      onClick={() => sendNow(s.slot)}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {sending === s.slot ? "Envoi…" : `Envoyer un ${s.slot}`}
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => openCreate(s.slot)} aria-label={`Ajouter un message ${s.slot}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Historique */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-gold" /> Messages reçus
          </h2>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun message reçu pour l&apos;instant — le prochain partira au prochain créneau planifié.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {history.map((h) => (
                <div key={h.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold">{h.subject}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{h.type === "COACH" ? "Planifié" : "Test"}</Badge>
                      {h.status !== "SENT" && <span className="text-[10px] font-bold text-destructive">Échec</span>}
                      <span className="text-[10px] text-muted-foreground">{formatRelativeFr(h.sentAt)}</span>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.content}</p>
                  {h.error && <p className="mt-1 text-[10px] text-destructive">{h.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog ajout / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le message" : `Nouveau message ${formSlot}`}</DialogTitle>
            <DialogDescription>
              Utilisez « Monsieur Diop » dans le texte : il sera remplacé par le nom configuré dans les Automatisations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="coach-content">Contenu du message</Label>
            <Textarea
              id="coach-content"
              rows={4}
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Ex. : Bonjour Monsieur Diop ! N'oubliez pas de relancer…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
