"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-client";

// ─── Chat en direct avec le Coach Virtuel (IA + données réelles du CRM) ──────

interface ChatMsg {
  id: string;
  role: string; // "user" | "coach"
  content: string;
  createdAt: string;
}

const QUICK_PROMPTS = [
  "Quelles sont mes priorités maintenant ?",
  "Prépare-moi un plan d'action pour la journée",
  "Aide-moi à rédiger une relance client",
  "Analyse mes résultats du jour",
];

export default function CrmCoachChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [greeting, setGreeting] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/crm/coach/chat");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages ?? []);
      setGreeting(data.greeting ?? "");
    } catch {
      /* salutation indisponible : le chat reste utilisable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Défilement automatique vers le bas à chaque nouveau message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending, loading]);

  const send = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content || sending) return;
    setInput(""); // vide le champ dans tous les cas (saisie manuelle ou suggestion)
    setSending(true);
    const optimistic: ChatMsg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await authFetch("/api/crm/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Réessayez dans un instant");
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        optimistic,
        { id: data.id, role: "coach", content: data.reply, createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      toast({
        title: "Coach indisponible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    if (!confirm("Effacer toute la conversation avec le coach ?")) return;
    try {
      const res = await authFetch("/api/crm/coach/chat", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setMessages([]);
      load();
      toast({ title: "Conversation réinitialisée" });
    } catch {
      toast({ title: "Erreur", description: "Réinitialisation impossible", variant: "destructive" });
    }
  };

  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const CoachBubble = ({ children, meta }: { children: React.ReactNode; meta: string }) => (
    <div className="max-w-[85%]">
      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-gold/30 bg-background px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
        {children}
      </div>
      <p className="mt-1 pl-1 text-[10px] text-muted-foreground">Coach • {meta}</p>
    </div>
  );

  return (
    <Card className="overflow-hidden border-gold/30">
      <CardContent className="p-0">
        {/* En-tête : le coach est « en ligne » */}
        <div className="flex items-center gap-3 border-b border-gold/20 bg-gold/5 px-4 py-3">
          <div className="relative shrink-0">
            <span className="theme-toggle-luxe flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-background bg-green-500" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Coach Virtuel — en direct</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Il connaît vos tâches, factures, RDV et résultats du jour
            </p>
          </div>
          <Badge
            variant="outline"
            className="hidden border-green-500/30 bg-green-500/10 text-[10px] text-green-600 sm:inline-flex"
          >
            En ligne
          </Badge>
          {!loading && messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={reset}
              aria-label="Réinitialiser la conversation"
              title="Réinitialiser la conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Fil de discussion */}
        <div
          ref={scrollRef}
          className="h-[340px] space-y-3 overflow-y-auto px-4 py-4 sm:h-[380px]"
          role="log"
          aria-live="polite"
          aria-label="Conversation avec le coach"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Le coach arrive…
            </div>
          ) : (
            <>
              {greeting && <CoachBubble meta="à l'instant">{greeting}</CoachBubble>}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="ml-auto max-w-[85%]">
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                      {m.content}
                    </div>
                    <p className="mt-1 pr-1 text-right text-[10px] text-muted-foreground">{hhmm(m.createdAt)}</p>
                  </div>
                ) : (
                  <CoachBubble key={m.id} meta={hhmm(m.createdAt)}>
                    {m.content}
                  </CoachBubble>
                ),
              )}
              {sending && (
                <div className="max-w-[85%]">
                  <div className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-sm border border-gold/30 bg-background px-4 py-3 shadow-sm">
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:300ms]" />
                    </span>
                    <span className="text-xs text-muted-foreground">Le coach réfléchit…</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Suggestions rapides */}
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-2.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              disabled={sending || loading}
              className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/5 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-gold/15 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3 text-gold" aria-hidden /> {p}
            </button>
          ))}
        </div>

        {/* Zone de saisie */}
        <div className="flex items-end gap-2 border-t border-border/60 px-4 py-3">
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Écrivez à votre coach… (Entrée pour envoyer)"
            className="min-h-[42px] resize-none"
            aria-label="Message pour le coach"
            disabled={sending}
          />
          <Button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="h-[42px] shrink-0 px-4"
            aria-label="Envoyer le message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            <span className="sr-only">Envoyer</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
