import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "crypto";

// ─── Mots de passe (scrypt : sel:clé) ───────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(":");
    if (!salt || !key) return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(key, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ─── Jetons de session (HMAC-SHA256) ────────────────────────────────────────

const SECRET = process.env.AUTH_SECRET || "2mails-facturation-secret-2024";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "EMPLOYE";
}

interface TokenPayload {
  uid: string;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createToken(userId: string): string {
  const payload: TokenPayload = { uid: userId, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (!payload.uid || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Vérifie le jeton et renvoie l'utilisateur actif, ou null. */
export async function getAuthUser(request: Request): Promise<SessionUser | null> {
  const uid = verifyToken(getTokenFromRequest(request));
  if (!uid) return null;
  const user = await prismaUser(uid);
  return user;
}

async function prismaUser(uid: string) {
  const { db } = await import("@/lib/db");
  const u = await db.user.findUnique({ where: { id: uid } });
  if (!u || !u.actif) return null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: (u.role === "ADMIN" ? "ADMIN" : "EMPLOYE") as "ADMIN" | "EMPLOYE",
  };
}
