import type { Env, KVStore, MailboxEntry, PairCode } from "./env";
import {
  MAX_BODY_BYTES,
  MESSAGE_TTL,
  PAIR_TTL,
  RATE_LIMIT,
} from "./env";

const AUTH_PREFIX = "id:";
const MAIL_PREFIX = "mail:";
const PAIR_PREFIX = "pair:";
const RATE_PREFIX = "rl:";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1

export function generatePairingCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function minuteKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}`;
}

/** Resolves the authenticated deviceId from the bearer token, if any. */
async function deviceIdFromToken(kv: KVStore, token: string | null): Promise<string | null> {
  if (!token) return null;
  const value = await kv.get(`${AUTH_PREFIX}${token}`, "text");
  return value ?? null;
}

async function registerDevice(kv: KVStore, token: string, deviceId: string): Promise<void> {
  const existing = await kv.get(`${AUTH_PREFIX}${token}`, "text");
  if (!existing) await kv.put(`${AUTH_PREFIX}${token}`, deviceId);
  const existingAuth = await kv.get(`${AUTH_PREFIX}${deviceId}`, "text");
  if (!existingAuth) await kv.put(`${AUTH_PREFIX}${deviceId}`, token);
}

async function rateLimited(
  kv: KVStore,
  deviceId: string,
  limit: number,
  now: Date,
): Promise<boolean> {
  const key = `${RATE_PREFIX}${deviceId}:${minuteKey(now)}`;
  const raw = await kv.get(key, "text");
  const count = raw === null ? 0 : Number(raw) || 0;
  if (count >= limit) return true;
  await kv.put(key, String(count + 1), { expirationTtl: 90 });
  return false;
}

async function readBody(request: Request): Promise<unknown | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

interface AuthContext {
  deviceId: string | null;
  limited: boolean;
}

async function authenticate(
  request: Request,
  env: Env,
  now: Date,
  hintDeviceId?: string,
): Promise<AuthContext> {
  const token = request.headers.get("X-Device-Token");
  let deviceId = await deviceIdFromToken(env.MAILBOX, token);
  // First contact with the relay comes from an endpoint that carries the
  // deviceId in its body; self-register lazily so "dumb mailbox" works for a
  // device before it ever sends a message.
  if (!deviceId && token && hintDeviceId) {
    await registerDevice(env.MAILBOX, token, hintDeviceId);
    deviceId = hintDeviceId;
  }
  if (!deviceId) return { deviceId: null, limited: false };
  const limit = Number(env.RATE_LIMIT_PER_MINUTE) || RATE_LIMIT;
  const limited = await rateLimited(env.MAILBOX, deviceId, limit, now);
  return { deviceId, limited };
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const now = new Date();
  const url = new URL(request.url);
  const ttl = env.MESSAGE_TTL_SECONDS ?? MESSAGE_TTL;
  const pairTtl = env.PAIR_TTL_SECONDS ?? PAIR_TTL;

  const body = (await readBody(request)) as Record<string, unknown> | null;

  /* POST /pair/initiate { deviceId, displayName } */
  if (request.method === "POST" && url.pathname === "/pair/initiate") {
    const token = request.headers.get("X-Device-Token");
    if (!token) return json(401, { error: "Missing device credentials" });
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
    if (!deviceId) return json(400, { error: "deviceId required" });
    const ctx = await authenticate(request, env, now, deviceId);
    if (ctx.limited) return json(429, { error: "Too many requests" });

    const pairingCode = generatePairingCode();
    const pair: PairCode = {
      ownerDeviceId: deviceId,
      createdAt: now.toISOString(),
    };
    await env.MAILBOX.put(`${PAIR_PREFIX}${pairingCode}`, JSON.stringify(pair), {
      expirationTtl: pairTtl,
    });
    return json(201, { pairingCode });
  }

  /* POST /pair/complete { pairingCode, fromDeviceId, ack } */
  if (request.method === "POST" && url.pathname === "/pair/complete") {
    const fromDeviceId = typeof body?.fromDeviceId === "string" ? body.fromDeviceId : null;
    const ctx = await authenticate(request, env, now, fromDeviceId ?? undefined);
    if (ctx.limited) return json(429, { error: "Too many requests" });
    if (!ctx.deviceId) return json(401, { error: "Unrecognised device" });
    const code = typeof body?.pairingCode === "string" ? body.pairingCode : null;
    const ack = body?.ack as MailboxEntry["payload"] | undefined;
    if (!code || !fromDeviceId || !isPayload(ack)) return json(400, { error: "Invalid body" });

    const raw = await env.MAILBOX.get(`${PAIR_PREFIX}${code}`, "json");
    if (!raw) return json(410, { error: "Pairing code expired" });
    const pair = raw as PairCode;
    if (pair.ownerDeviceId === fromDeviceId) {
      return json(400, { error: "Cannot pair with yourself" });
    }

    const mid = `pair-${code}-${newId()}`;
    const entry: MailboxEntry = {
      id: mid,
      type: "pairing-ack",
      senderDeviceId: fromDeviceId,
      payload: ack,
    };
    await env.MAILBOX.put(
      `${MAIL_PREFIX}${pair.ownerDeviceId}:${mid}`,
      JSON.stringify(entry),
      { expirationTtl: ttl },
    );
    await env.MAILBOX.delete(`${PAIR_PREFIX}${code}`);
    return json(201, { ok: true });
  }

  /* POST /messages { messageId, recipientDeviceId, type, senderDeviceId, payload } */
  if (request.method === "POST" && url.pathname === "/messages") {
    const sender = typeof body?.senderDeviceId === "string" ? body.senderDeviceId : null;
    const ctx = await authenticate(request, env, now, sender ?? undefined);
    if (ctx.limited) return json(429, { error: "Too many requests" });
    if (!ctx.deviceId) return json(401, { error: "Unrecognised device" });
    const messageId = typeof body?.messageId === "string" ? body.messageId : null;
    const recipient = typeof body?.recipientDeviceId === "string" ? body.recipientDeviceId : null;
    const type = body?.type === "order" ? "order" : null;
    const payload = body?.payload as MailboxEntry["payload"] | undefined;
    if (!messageId || !recipient || !sender || !type || !isPayload(payload)) {
      return json(400, { error: "Invalid message" });
    }
    if (sender !== ctx.deviceId) return json(403, { error: "Sender mismatch" });

    const entry: MailboxEntry = { id: messageId, type, senderDeviceId: sender, payload };
    await env.MAILBOX.put(
      `${MAIL_PREFIX}${recipient}:${messageId}`,
      JSON.stringify(entry),
      { expirationTtl: ttl },
    );
    return json(201, { messageId });
  }

  /* GET /messages */
  if (request.method === "GET" && url.pathname === "/messages") {
    const ctx = await authenticate(request, env, now);
    if (ctx.limited) return json(429, { error: "Too many requests" });
    if (!ctx.deviceId) return json(401, { error: "Unrecognised device" });
    const list = await env.MAILBOX.list({ prefix: `${MAIL_PREFIX}${ctx.deviceId}:` });
    const messages: MailboxEntry[] = [];
    for (const { name } of list.keys) {
      const raw = (await env.MAILBOX.get(name, "json")) as MailboxEntry | null;
      if (raw) messages.push(raw);
    }
    return json(200, { messages });
  }

  /* POST /messages/:id/ack */
  const ackMatch = /^\/messages\/([^/]+)\/ack$/.exec(url.pathname);
  if (request.method === "POST" && ackMatch) {
    const ctx = await authenticate(request, env, now);
    if (ctx.limited) return json(429, { error: "Too many requests" });
    if (!ctx.deviceId) return json(401, { error: "Unrecognised device" });
    const messageId = ackMatch[1];
    await env.MAILBOX.delete(`${MAIL_PREFIX}${ctx.deviceId}:${messageId}`);
    return json(200, { ok: true });
  }

  return json(404, { error: "Not found" });
}

function isPayload(p: unknown): p is MailboxEntry["payload"] {
  if (typeof p !== "object" || p === null) return false;
  const { ciphertext, iv, salt } = p as { ciphertext?: unknown; iv?: unknown; salt?: unknown };
  return typeof ciphertext === "string" && typeof iv === "string" && typeof salt === "string";
}

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}