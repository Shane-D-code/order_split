import type {
  FamilyMember,
  Order,
  SyncMessage,
  EncryptedPayload,
  ReceivedOrder,
  SyncRun,
} from "../domain/types";
import { deriveChannelKey, decryptJson, encryptJson } from "../crypto/crypto";
import {
  enqueueOutbox,
  getDueOutbox,
  markOutbox,
  outboxHasOrder,
  storeInbox,
  deleteInboxMessage,
  setStatus,
  countUnsyncedOrders,
} from "../db/repositories/sync";
import { listFamilyMembers, getFamilyMember, addFamilyMember } from "../db/repositories/family";
import { getOrder } from "../db/repositories/orders";
import { getDeviceIdentity } from "../db/repositories/identity";
import { getRelayUrl, setSetting, getSetting } from "../db/repositories/settings";
import { tryInsertReceivedOrder, orderDedupKey } from "../db/repositories/received";
import type { RelayClient, RelayMessage, OrderEnvelope } from "./relay-client";
import { createRelayClient, RelayError } from "./relay-client";
import { finalizePairing } from "../pairing/pairing";
import { newId } from "../domain/id";

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 5_000;

export function backoffMs(attempt: number): number {
  const cap = Math.min(6 * 60 * 1000, BASE_DELAY_MS * 2 ** Math.min(attempt - 1, 8));
  const jitter = Math.round(Math.random() * cap * 0.3);
  return cap + jitter;
}

async function client(): Promise<RelayClient | null> {
  const identity = await getDeviceIdentity();
  if (!identity) return null;
  const relayUrl = await getRelayUrl();
  if (!relayUrl) return null;
  return createRelayClient({ baseUrl: relayUrl, identity });
}

/* ---------------- Pairing seed store (child, pending invites) ---------------- */

const PAIRING_SEEDS_KEY = "pendingPairingSeeds";

async function getPairingSeeds(): Promise<string[]> {
  const raw = await getSetting(PAIRING_SEEDS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    /* ignore */
  }
  return [];
}

export async function savePairingSeed(seedB64: string): Promise<void> {
  const seeds = await getPairingSeeds();
  if (!seeds.includes(seedB64)) {
    await setSetting(PAIRING_SEEDS_KEY, JSON.stringify([...seeds, seedB64]));
  }
}

async function consumePairingSeed(seedB64: string): Promise<void> {
  const seeds = (await getPairingSeeds()).filter((s) => s !== seedB64);
  await setSetting(PAIRING_SEEDS_KEY, JSON.stringify(seeds));
}

/* ---------------- Outbox: enqueue ---------------- */

export async function enqueueOrderForSync(order: Order): Promise<boolean> {
  if (await outboxHasOrder(order.id)) return false;
  const message: SyncMessage = {
    id: newId(),
    direction: "outbox",
    type: "order",
    status: "pending",
    orderId: order.id,
    dedupKey: undefined,
    payload: { ciphertext: "", iv: "", salt: "" },
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return enqueueOutbox(message);
}

export async function hasPendingSync(orderId: string): Promise<boolean> {
  return outboxHasOrder(orderId);
}

export async function pendingSyncCount(): Promise<number> {
  return countUnsyncedOrders();
}

/* ---------------- Outbox: flush ---------------- */

async function encryptOrderFor(
  sender: import("../domain/types").DeviceIdentity,
  recipient: FamilyMember,
  order: Order,
): Promise<EncryptedPayload> {
  const key = await deriveChannelKey(sender.privateKeyJwk, recipient.publicKeyJwk);
  const envelope: OrderEnvelope = {
    v: 1,
    type: "order",
    senderDeviceId: sender.deviceId,
    senderDisplayName: sender.displayName,
    orderId: order.id,
    sentAt: new Date().toISOString(),
    order,
  };
  return encryptJson(key, envelope);
}

export async function flushOutbox(now = new Date()): Promise<SyncRun> {
  const result: SyncRun = { sent: 0, received: 0, acked: 0, failed: 0 };
  const identity = await getDeviceIdentity();
  const members = await listFamilyMembers();
  const client_ = await client();
  if (!identity || members.length === 0) return result;
  if (!client_) return result;

  const due = await getDueOutbox(now);
  for (const message of due) {
    if (message.type !== "order") continue;
    const order = await loadOrderForSync(message.orderId);
    if (!order) {
      await markOutbox(message.id, { status: "failed", lastError: "Order not found" });
      result.failed++;
      continue;
    }
    try {
      for (const member of members) {
        const encrypted = await encryptOrderFor(identity, member, order);
        const dedupKey = orderDedupKey(order.id, message.id);
        await client_.sendMessage(member.deviceId, {
          id: message.id,
          type: "order",
          senderDeviceId: identity.deviceId,
          payload: encrypted,
        });
        await markOutbox(message.id, {
          status: "synced",
          dedupKey,
        });
      }
      result.sent++;
    } catch (err) {
      result.failed++;
      const attempts = message.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await markOutbox(message.id, {
          status: "failed",
          attempts,
          lastError: msg(err),
          nextRetryAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
      } else {
        await markOutbox(message.id, {
          status: "pending",
          attempts,
          lastError: msg(err),
          nextRetryAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        });
      }
    }
  }
  return result;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadOrderForSync(orderId: string | undefined): Promise<Order | null> {
  if (!orderId) return null;
  return getOrder(orderId);
}

/* ---------------- Inbox: poll ---------------- */

export async function pollInbox(): Promise<SyncRun> {
  const result: SyncRun = { sent: 0, received: 0, acked: 0, failed: 0 };
  const client_ = await client();
  if (!client_) return result;

  let messages: RelayMessage[] = [];
  try {
    messages = await client_.fetchMessages();
  } catch (err) {
    if (err instanceof RelayError && err.kind === "expired") return result;
    result.failed++;
    return result;
  }

  for (const relayMessage of messages) {
    await setStatus(relayMessage.id, "in-flight");
    const outcome = await handleInboxMessage(relayMessage);
    if (outcome.handled) {
      try {
        await client_.acknowledgeMessage(relayMessage.id);
        result.acked++;
        await deleteInboxMessage(relayMessage.id);
      } catch {
        result.failed++;
      }
      if (outcome.receivedOrder) result.received++;
    } else if (outcome.receivedOrder === false) {
      result.failed++;
    }
  }
  return result;
}

interface InboxOutcome {
  handled: boolean;
  /** True when a new order was stored, false when dedup or failure. */
  receivedOrder?: boolean;
}

async function handleInboxMessage(relayMessage: RelayMessage): Promise<InboxOutcome> {
  const identity = await getDeviceIdentity();
  if (!identity) return { handled: false };

  if (relayMessage.type === "pairing-ack") {
    return handlePairingAck(relayMessage);
  }

  // Order message from a known family peer.
  const sender = await getFamilyMember(relayMessage.senderDeviceId);
  if (!sender) {
    await persistInbox(relayMessage, "failed", "Sender not paired");
    return { handled: false, receivedOrder: false };
  }

  try {
    const key = await deriveChannelKey(identity.privateKeyJwk, sender.publicKeyJwk);
    const envelope = await decryptJson<OrderEnvelope>(key, relayMessage.payload);
    if (envelope.v !== 1 || envelope.type !== "order") {
      await persistInbox(relayMessage, "failed", "Malformed envelope");
      return { handled: false, receivedOrder: false };
    }
    const received: ReceivedOrder = {
      ...envelope.order,
      receivedAt: new Date().toISOString(),
      fromDeviceId: envelope.senderDeviceId,
      dedupKey: orderDedupKey(envelope.orderId, relayMessage.id),
      syncMessageId: relayMessage.id,
    };
    const inserted = await tryInsertReceivedOrder(received);
    // Duplicate deliveries are still ACKed (they are safe to discard).
    return { handled: true, receivedOrder: inserted !== null };
  } catch {
    await persistInbox(relayMessage, "failed", "Cannot decrypt");
    return { handled: false, receivedOrder: false };
  }
}

async function persistInbox(
  relayMessage: RelayMessage,
  status: "failed" | "pending",
  lastError?: string,
): Promise<void> {
  await storeInbox({
    id: relayMessage.id,
    direction: "inbox",
    type: relayMessage.type,
    status,
    senderDeviceId: relayMessage.senderDeviceId,
    lastError,
    payload: relayMessage.payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function handlePairingAck(relayMessage: RelayMessage): Promise<InboxOutcome> {
  const seeds = await getPairingSeeds();
  for (const seed of seeds) {
    try {
      const member = await finalizePairing(seed, relayMessage.payload);
      await addFamilyMember(member);
      await consumePairingSeed(seed);
      return { handled: true };
    } catch {
      // wrong seed for this message; try next
    }
  }
  return { handled: false };
}

/* ---------------- Aggregated run ---------------- */

export async function pump(): Promise<SyncRun> {
  const out = await flushOutbox();
  const inbox = await pollInbox();
  return {
    sent: out.sent,
    received: out.received + inbox.received,
    acked: inbox.acked,
    failed: out.failed + inbox.failed,
  };
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let listener: ((run: SyncRun | null) => void) | null = null;

export function setSyncListener(fn: (run: SyncRun | null) => void): void {
  listener = fn;
}

async function run(): Promise<void> {
  try {
    const result = await pump();
    listener?.(result);
  } catch {
    listener?.({ sent: 0, received: 0, acked: 0, failed: 1 });
  }
}

export function startSyncLoop(): void {
  if (pollingTimer) return;
  pollingTimer = setInterval(run, 45_000);
  window.addEventListener("focus", run);
  void run();
}

export function stopSyncLoop(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  window.removeEventListener("focus", run);
}