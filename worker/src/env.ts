/** Storage contract used by the relay. Sufficiently small that a test
 * fake (and Cloudflare's KVNamespace) can both satisfy it. */
export type Json = Record<string, unknown>;

export interface KVPutOptions {
  expirationTtl?: number;
}

export interface KVListResult {
  keys: Array<{ name: string }>;
}

export interface KVStore {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, opts?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<KVListResult>;
}

export interface MailboxEntry {
  id: string;
  type: "order" | "pairing-ack";
  senderDeviceId: string;
  payload: { ciphertext: string; iv: string; salt: string };
}

export interface PairCode extends Json {
  ownerDeviceId: string;
  createdAt: string;
}

export interface Env {
  MAILBOX: KVStore;
  /* overridable for tests / local dev defaults below */
  MESSAGE_TTL_SECONDS?: number;
  PAIR_TTL_SECONDS?: number;
  RATE_LIMIT_PER_MINUTE?: number;
}

export const MESSAGE_TTL = 7 * 24 * 3600; // 7 days
export const PAIR_TTL = 10 * 60; // 10 minutes
export const RATE_LIMIT = 120;
export const MAX_BODY_BYTES = 64 * 1024;