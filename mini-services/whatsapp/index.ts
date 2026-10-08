// ─── Mini-service WhatsApp (port 3003) ───────────────────────────────────────
// Connecte le CRM à WhatsApp via whatsapp-web.js (scan QR code).
// - Socket.io sur path "/" (Caddy forward via XTransformPort=3003)
// - Événements : qr, ready, authenticated, auth_failure, disconnected, message_received,
//   message_sent, send_status
// - API REST interne : /status, /qr, /send, /conversations, /messages/:jid
// - Persistance : session WhatsApp dans ./session, messages dans la DB Prisma
//   (table WhatsAppMessage) via @prisma/client

import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const { Client, LocalAuth, MessageMedia } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const PORT = 3003;
const app = express();
app.use(express.json({ limit: "50mb" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/socket",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── État global ──────────────────────────────────────────────────────────────
// serviceStarted = le service Express écoute (ne prouve pas que Chromium est prêt)
// chromiumReady = Chromium a démarré (le client WhatsApp peut générer un QR)
// clientReady = WhatsApp authentifié (session valide)
let qrCodeData: string | null = null;
let clientReady = false;
let chromiumReady = false;
let clientInfo: { phone?: string; name?: string } | null = null;
const serviceStartTime = Date.now();

// ─── Client WhatsApp ──────────────────────────────────────────────────────────
// En production (Docker), on utilise le Chromium système (PUPPETEER_EXECUTABLE_PATH).
// En dev, whatsapp-web.js télécharge son propre Chromium.
const puppeteerConfig: any = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
  ],
};
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, "session") }),
  puppeteer: puppeteerConfig,
});

client.on("qr", async (qr: string) => {
  console.log("[whatsapp] QR code généré");
  qrCodeData = qr;
  clientReady = false;
  chromiumReady = true; // Le QR ne peut être généré que si Chromium est prêt
  // Génère aussi une data URL pour affichage direct en <img>
  const dataUrl = await qrcode.toDataURL(qr, { width: 300 });
  io.emit("qr", { qr, dataUrl });
});

client.on("ready", () => {
  console.log("[whatsapp] Client prêt !");
  clientReady = true;
  qrCodeData = null;
  const info = client.info || {};
  clientInfo = {
    phone: info.wid?._serialized?.split("@")[0] ?? "",
    name: info.pushname ?? "",
  };
  io.emit("ready", clientInfo);
});

client.on("authenticated", () => {
  console.log("[whatsapp] Authentifié");
  chromiumReady = true;
  io.emit("authenticated");
});

// Événement 'loading_screen' : Chromium démarre
client.on("loading_screen", (percent: string) => {
  console.log("[whatsapp] Chromium démarre:", percent);
  chromiumReady = false;
});

client.on("auth_failure", (msg: string) => {
  console.error("[whatsapp] Échec auth:", msg);
  clientReady = false;
  io.emit("auth_failure", { message: msg });
});

client.on("disconnected", (reason: string) => {
  console.log("[whatsapp] Déconnecté:", reason);
  clientReady = false;
  qrCodeData = null;
  clientInfo = null;
  io.emit("disconnected", { reason });
  // Tente de réinitialiser
  client.initialize().catch((e: unknown) => console.error("re-init error:", e));
});

// ─── Message entrant ──────────────────────────────────────────────────────────
client.on("message", async (msg: any) => {
  try {
    if (msg.type !== "chat" && !msg.hasMedia) return; // ignore non-texte/media
    const from = msg.from; // numéro de l'expéditeur (jid)
    const to = msg.to; // nous
    const body = msg.body ?? "";
    const hasMedia = msg.hasMedia;
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaMime: string | null = null;
    let mediaBase64: string | null = null;

    if (hasMedia) {
      const media = await msg.downloadMedia();
      if (media) {
        mediaMime = media.mimetype;
        mediaType = media.mimetype?.split("/")[0] ?? "file";
        mediaBase64 = media.data;
        // On stocke juste les métadonnées en base (base64 trop gros)
        // Pour les images, on garde le base64 si < 1Mo
      }
    }

    // Persistance en base
    const saved = await prisma.whatsAppMessage.create({
      data: {
        jid: from,
        direction: "IN",
        body,
        hasMedia,
        mediaType,
        mediaMime,
        mediaBase64: mediaBase64 && mediaBase64.length < 1_000_000 ? mediaBase64 : null,
        messageId: msg.id?._serialized ?? null,
        fromName: msg._data?.notifyName ?? null,
        timestamp: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
      },
    });

    // Update/create conversation
    await prisma.whatsAppConversation.upsert({
      where: { jid: from },
      create: {
        jid: from,
        name: msg._data?.notifyName ?? from.split("@")[0],
        lastMessage: body || (hasMedia ? `[${mediaType}]` : ""),
        lastAt: saved.timestamp,
        unread: { increment: 1 },
      },
      update: {
        name: msg._data?.notifyName ?? undefined,
        lastMessage: body || (hasMedia ? `[${mediaType}]` : ""),
        lastAt: saved.timestamp,
        unread: { increment: 1 },
      },
    });

    // Notifie le frontend en temps réel
    io.emit("message_received", {
      id: saved.id,
      jid: from,
      from: from,
      fromName: msg._data?.notifyName ?? from.split("@")[0],
      body,
      hasMedia,
      mediaType,
      timestamp: saved.timestamp.toISOString(),
    });
  } catch (e) {
    console.error("[whatsapp] Erreur message entrant:", e);
  }
});

// Accusé de réception (passé à "lu")
client.on("message_ack", async (msg: any, ack: number) => {
  // ack: 1=sent, 2=received, 3=read
  if (ack >= 2 && msg.id?._serialized) {
    try {
      await prisma.whatsAppMessage.updateMany({
        where: { messageId: msg.id._serialized },
        data: { status: ack === 3 ? "READ" : "DELIVERED" },
      });
    } catch {}
  }
});

// Initialize le client
client.initialize().catch((e: unknown) => console.error("init error:", e));

// ─── API REST (appelée depuis le frontend via XTransformPort=3003) ────────────

app.get("/status", (_req, res) => {
  res.json({
    ready: clientReady,
    qr: !!qrCodeData,
    chromiumReady,
    info: clientInfo,
    uptime: Math.floor((Date.now() - serviceStartTime) / 1000),
  });
});

app.get("/qr", async (_req, res) => {
  if (!qrCodeData) return res.json({ ready: clientReady, qr: null, dataUrl: null });
  const dataUrl = await qrcode.toDataURL(qrCodeData, { width: 300 });
  res.json({ ready: false, qr: qrCodeData, dataUrl });
});

app.get("/conversations", async (_req, res) => {
  try {
    const convs = await prisma.whatsAppConversation.findMany({
      orderBy: { lastAt: "desc" },
      take: 100,
    });
    res.json({ conversations: convs });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/messages/:jid", async (req, res) => {
  try {
    const jid = decodeURIComponent(req.params.jid);
    const messages = await prisma.whatsAppMessage.findMany({
      where: { jid },
      orderBy: { timestamp: "asc" },
      take: 200,
    });
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// Marquer une conversation comme lue
app.post("/conversations/:jid/read", async (req, res) => {
  try {
    const jid = decodeURIComponent(req.params.jid);
    await prisma.whatsAppConversation.update({
      where: { jid },
      data: { unread: 0 },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// Envoyer un message
app.post("/send", async (req, res) => {
  try {
    if (!clientReady) return res.status(503).json({ error: "WhatsApp non connecté" });
    const { jid, body, mediaBase64, mediaMime, filename } = req.body || {};
    if (!jid || (!body && !mediaBase64)) return res.status(400).json({ error: "jid + body requis" });

    let sent;
    if (mediaBase64 && mediaMime) {
      const media = new MessageMedia(mediaMime, mediaBase64, filename || "file");
      sent = await client.sendMessage(jid, media, { caption: body || undefined });
    } else {
      sent = await client.sendMessage(jid, body);
    }

    // Persistance
    const saved = await prisma.whatsAppMessage.create({
      data: {
        jid,
        direction: "OUT",
        body: body ?? "",
        hasMedia: !!mediaBase64,
        mediaType: mediaMime?.split("/")[0] ?? null,
        mediaMime: mediaMime ?? null,
        mediaBase64: mediaBase64 && mediaBase64.length < 1_000_000 ? mediaBase64 : null,
        messageId: sent?.id?._serialized ?? null,
        status: "SENT",
        timestamp: new Date(),
      },
    });

    await prisma.whatsAppConversation.upsert({
      where: { jid },
      create: {
        jid,
        name: jid.split("@")[0],
        lastMessage: body || (mediaBase64 ? "[media]" : ""),
        lastAt: saved.timestamp,
        unread: 0,
      },
      update: {
        lastMessage: body || (mediaBase64 ? "[media]" : ""),
        lastAt: saved.timestamp,
      },
    });

    io.emit("message_sent", {
      id: saved.id,
      jid,
      body: body ?? "",
      hasMedia: !!mediaBase64,
      timestamp: saved.timestamp.toISOString(),
    });

    res.json({ ok: true, id: saved.id });
  } catch (e) {
    console.error("[whatsapp] send error:", e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// Déconnexion (force re-QR)
app.post("/logout", async (_req, res) => {
  try {
    await client.logout();
    qrCodeData = null;
    clientReady = false;
    clientInfo = null;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("[socket] client connecté:", socket.id);
  // Envoie l'état initial au nouveau client
  socket.emit("status", { ready: clientReady, qr: !!qrCodeData, info: clientInfo });
  if (qrCodeData) {
    qrcode.toDataURL(qrCodeData, { width: 300 }).then((dataUrl) => {
      socket.emit("qr", { qr: qrCodeData, dataUrl });
    });
  }
  socket.on("disconnect", () => console.log("[socket] client déconnecté:", socket.id));
});

httpServer.listen(PORT, () => {
  console.log(`[whatsapp] service démarré sur le port ${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("[whatsapp] arrêt en cours...");
  client.destroy().catch(() => {});
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
