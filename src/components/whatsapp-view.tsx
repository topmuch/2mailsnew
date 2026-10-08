"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  LogOut,
  Phone,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── WhatsApp : chat intégré au CRM (Task 79) ────────────────────────────────
// Connexion au mini-service whatsapp (port 3003) via socket.io.
// Étapes :
//   1. Si non connecté → affiche le QR code à scanner avec WhatsApp.
//   2. Une fois connecté → liste des conversations + vue chat.
//   3. Réception temps réel via socket (message_received, message_sent).
//   4. Envoi via POST /send (XTransformPort=3003).

interface Conversation {
  id: string;
  jid: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
  pinned: boolean;
}

interface Message {
  id: string;
  jid: string;
  direction: "IN" | "OUT";
  body: string;
  hasMedia: boolean;
  mediaType?: string | null;
  mediaBase64?: string | null;
  mediaMime?: string | null;
  status?: string;
  fromName?: string | null;
  timestamp: string;
}

interface ClientInfo {
  phone?: string;
  name?: string;
}

const WHATSAPP_PORT = 3003;

function fmtTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function WhatsAppView() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ─── Connexion socket.io au mini-service ──────────────────────────────────
  useEffect(() => {
    const socket = io("/?XTransformPort=" + WHATSAPP_PORT, {
      path: "/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("status", (s: { ready: boolean; qr: boolean; info: ClientInfo | null }) => {
      setReady(s.ready);
      setInfo(s.info);
      setLoading(false);
      if (!s.ready && !s.qr) setError("En attente du QR code…");
      else setError(null);
    });

    socket.on("qr", (data: { qr: string; dataUrl: string }) => {
      setQrDataUrl(data.dataUrl);
      setReady(false);
      setLoading(false);
      setError(null);
    });

    socket.on("ready", (i: ClientInfo) => {
      setReady(true);
      setQrDataUrl(null);
      setInfo(i);
      setError(null);
      // Charge les conversations
      loadConversations();
    });

    socket.on("authenticated", () => setReady(true));
    socket.on("auth_failure", (d: { message: string }) => {
      setError("Échec d'authentification : " + d.message);
    });
    socket.on("disconnected", (d: { reason: string }) => {
      setReady(false);
      setInfo(null);
      setError("Déconnecté : " + d.reason + ". Redémarrage du QR…");
    });

    socket.on("message_received", (m: Message) => {
      setConversations((prev) => {
        const exists = prev.find((c) => c.jid === m.jid);
        if (exists) {
          return prev
            .map((c) =>
              c.jid === m.jid
                ? {
                    ...c,
                    lastMessage: m.body || (m.hasMedia ? `[${m.mediaType || "media"}]` : ""),
                    lastAt: m.timestamp,
                    unread: c.unread + (c.jid === selectedJid ? 0 : 1),
                  }
                : c
            )
            .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
        }
        return [
          {
            id: m.jid,
            jid: m.jid,
            name: m.fromName || m.jid.split("@")[0],
            lastMessage: m.body || (m.hasMedia ? `[${m.mediaType || "media"}]` : ""),
            lastAt: m.timestamp,
            unread: 1,
            pinned: false,
          },
          ...prev,
        ];
      });
      if (m.jid === selectedJid) {
        setMessages((prev) => [...prev, m]);
      }
    });

    socket.on("message_sent", (m: Message) => {
      if (m.jid === selectedJid) {
        setMessages((prev) => [...prev, m]);
      }
      setConversations((prev) =>
        prev
          .map((c) =>
            c.jid === m.jid
              ? {
                  ...c,
                  lastMessage: m.body || (m.hasMedia ? "[media]" : ""),
                  lastAt: m.timestamp,
                  unread: 0,
                }
              : c
          )
          .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedJid]);

  // ─── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    // Récupère l'état initial via /status
    fetch(`/api/whatsapp/status?XTransformPort=${WHATSAPP_PORT}`)
      .then((r) => r.json())
      .then((s: { ready: boolean; qr: boolean; info: ClientInfo | null }) => {
        setReady(s.ready);
        setInfo(s.info);
        setLoading(false);
        if (s.ready) loadConversations();
        else if (s.qr) loadQr();
      })
      .catch(() => {
        setLoading(false);
        setError("Service WhatsApp injoignable. Le mini-service est-il démarré ?");
      });
  }, []);

  // ─── Auto-scroll des messages ──────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/conversations?XTransformPort=${WHATSAPP_PORT}`);
      const json = await res.json();
      if (json.conversations) setConversations(json.conversations);
    } catch (e) {
      console.error("loadConversations", e);
    }
  }, []);

  const loadQr = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/qr?XTransformPort=${WHATSAPP_PORT}`);
      const json = await res.json();
      if (json.dataUrl) setQrDataUrl(json.dataUrl);
    } catch (e) {
      console.error("loadQr", e);
    }
  }, []);

  const selectConversation = useCallback(async (jid: string) => {
    setSelectedJid(jid);
    setMessages([]);
    try {
      const res = await fetch(`/api/whatsapp/messages/${encodeURIComponent(jid)}?XTransformPort=${WHATSAPP_PORT}`);
      const json = await res.json();
      if (json.messages) setMessages(json.messages);
      // Marque comme lu
      fetch(`/api/whatsapp/conversations/${encodeURIComponent(jid)}/read?XTransformPort=${WHATSAPP_PORT}`, {
        method: "POST",
      });
      setConversations((prev) => prev.map((c) => (c.jid === jid ? { ...c, unread: 0 } : c)));
    } catch (e) {
      console.error("selectConversation", e);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!selectedJid || !draft.trim() || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    try {
      const res = await fetch(`/api/whatsapp/send?XTransformPort=${WHATSAPP_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: selectedJid, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur envoi");
      // Le message reviendra via socket.message_sent
    } catch (e) {
      setError("Échec envoi : " + (e as Error).message);
      setDraft(body); // restore
    } finally {
      setSending(false);
    }
  }, [selectedJid, draft, sending]);

  const logout = useCallback(async () => {
    if (!confirm("Se déconnecter de WhatsApp ? Tu devras scanner le QR code à nouveau.")) return;
    try {
      await fetch(`/api/whatsapp/logout?XTransformPort=${WHATSAPP_PORT}`, { method: "POST" });
      setReady(false);
      setInfo(null);
      setConversations([]);
      setSelectedJid(null);
      setMessages([]);
    } catch (e) {
      setError("Échec déconnexion");
    }
  }, []);

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  const filteredConversations = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.jid.includes(q) || c.lastMessage.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <RefreshCw className="h-6 w-6 animate-spin text-gold" />
        <span className="ml-3 text-sm text-muted-foreground">Connexion au service WhatsApp…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── En-tête ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageCircle className="h-6 w-6 text-green-600" aria-hidden /> WhatsApp
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ready && info
              ? `Connecté${info.name ? ` en tant que ${info.name}` : ""}${info.phone ? ` (${info.phone})` : ""}`
              : "Connectez votre WhatsApp pour recevoir et répondre aux messages."}
          </p>
        </div>
        {ready && (
          <Button variant="outline" size="sm" onClick={logout} className="gap-2">
            <LogOut className="h-4 w-4" aria-hidden /> Déconnecter
          </Button>
        )}
      </div>

      {error && (
        <Card className="flex items-center gap-3 border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
        </Card>
      )}

      {/* ─── Pas connecté : QR code ─── */}
      {!ready ? (
        <Card className="mx-auto max-w-md p-6 text-center shadow-sm">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Smartphone className="h-6 w-6 text-green-600" aria-hidden />
            <h2 className="text-lg font-semibold">Connecter WhatsApp</h2>
          </div>
          {qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="QR code WhatsApp" className="mx-auto mb-4 rounded-lg border bg-white p-2" width={260} height={260} />
              <ol className="space-y-1 text-left text-sm text-muted-foreground">
                <li>1. Ouvrez <strong>WhatsApp</strong> sur votre téléphone.</li>
                <li>2. Allez dans <strong>Paramètres → WhatsApp Web</strong>.</li>
                <li>3. <strong>Scannez ce QR code</strong> avec votre téléphone.</li>
                <li>4. La page se met à jour automatiquement.</li>
              </ol>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-green-600" />
              <p className="text-sm text-muted-foreground">Génération du QR code…</p>
            </div>
          )}
        </Card>
      ) : (
        // ─── Connecté : layout chat ───
        <div className="grid h-[calc(100vh-220px)] grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
          {/* Liste des conversations */}
          <Card className="flex flex-col overflow-hidden p-0 shadow-sm">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une conversation…"
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune conversation pour le moment.</p>
                  <p className="text-xs text-muted-foreground/70">Les messages reçus apparaîtront ici.</p>
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <button
                    key={c.jid}
                    onClick={() => selectConversation(c.jid)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b p-3 text-left transition-colors hover:bg-muted/50",
                      selectedJid === c.jid && "bg-muted"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
                      {(c.name || c.jid).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.name || c.jid.split("@")[0]}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{c.lastMessage || "(vide)"}</span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Vue chat */}
          <Card className="flex flex-col overflow-hidden p-0 shadow-sm">
            {!selectedJid ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Sélectionnez une conversation pour afficher les messages.</p>
              </div>
            ) : (
              <>
                {/* Header conversation */}
                <div className="flex items-center gap-3 border-b p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
                    {(conversations.find((c) => c.jid === selectedJid)?.name || selectedJid).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {conversations.find((c) => c.jid === selectedJid)?.name || selectedJid.split("@")[0]}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {selectedJid.split("@")[0]}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
                  {messages.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">Aucun message. Envoyez le premier !</p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.direction === "OUT";
                      return (
                        <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                              mine
                                ? "rounded-br-sm bg-green-600 text-white"
                                : "rounded-bl-sm bg-background"
                            )}
                          >
                            {m.hasMedia && m.mediaBase64 && m.mediaMime?.startsWith("image/") && (
                              <img
                                src={`data:${m.mediaMime};base64,${m.mediaBase64}`}
                                alt=""
                                className="mb-1 max-h-60 max-w-full rounded-lg"
                              />
                            )}
                            {m.hasMedia && m.mediaType && m.mediaType !== "image" && (
                              <p className="mb-1 text-xs italic opacity-75">[{m.mediaType}]</p>
                            )}
                            {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                            <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-green-100" : "text-muted-foreground")}>
                              {fmtTime(m.timestamp)}
                              {mine && m.status === "READ" && " · lu"}
                              {mine && m.status === "DELIVERED" && " · distribué"}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Champ d'envoi */}
                <div className="flex items-center gap-2 border-t p-3">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Tapez votre message…"
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={!draft.trim() || sending} size="icon" className="bg-green-600 hover:bg-green-700">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
