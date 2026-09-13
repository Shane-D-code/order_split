import { db, type SyncMessageRow } from "../database";
import type { EncryptedPayload, SyncMessage, SyncStatus } from "../../domain/types";

function toRow(m: SyncMessage): SyncMessageRow {
  return {
    id: m.id,
    direction: m.direction,
    type: m.type,
    status: m.status,
    recipientDeviceId: m.recipientDeviceId,
    senderDeviceId: m.senderDeviceId,
    payload: m.payload,
    orderId: m.orderId,
    dedupKey: m.dedupKey,
    attempts: m.attempts,
    nextRetryAt: m.nextRetryAt,
    lastError: m.lastError,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function fromRow(r: SyncMessageRow): SyncMessage {
  return {
    id: r.id,
    direction: r.direction,
    type: r.type,
    status: r.status,
    recipientDeviceId: r.recipientDeviceId,
    senderDeviceId: r.senderDeviceId,
    payload: r.payload as EncryptedPayload,
    orderId: r.orderId,
    dedupKey: r.dedupKey,
    attempts: r.attempts,
    nextRetryAt: r.nextRetryAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/* ------------------------- Outbox ------------------------- */

/** True when `orderId` already has an outbox message. */
export async function outboxHasOrder(orderId: string): Promise<boolean> {
  const count = await db.syncQueue.where("orderId").equals(orderId).count();
  return count > 0;
}

export async function enqueueOutbox(
  message: SyncMessage,
): Promise<boolean> {
  const existing = await db.syncQueue.get(message.id);
  if (existing) return false; // idempotent enqueue
  await db.syncQueue.add(toRow(message));
  return true;
}

/** Pending + in-flight messages that are due now. */
export async function getDueOutbox(now = new Date()): Promise<SyncMessage[]> {
  const rows = await db.syncQueue
    .where("direction")
    .equals("outbox")
    .toArray();
  const due = rows.filter((r) => {
    if (r.status === "acknowledged" || r.status === "synced") return false;
    if (r.status === "failed") return false;
    if (r.nextRetryAt && r.nextRetryAt > now.toISOString()) return false;
    return true;
  });
  return due.map(fromRow);
}

export async function markOutbox(
  id: string,
  patch: Partial<
    Pick<SyncMessageRow, "status" | "attempts" | "nextRetryAt" | "lastError" | "dedupKey">
  >,
): Promise<void> {
  await db.syncQueue.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function markAcknowledged(id: string): Promise<void> {
  await markOutbox(id, { status: "acknowledged" });
}

export async function countUnsyncedOrders(): Promise<number> {
  const rows = await db.syncQueue
    .where("direction")
    .equals("outbox")
    .toArray();
  return rows.filter((r) => r.status !== "acknowledged").length;
}

export async function listOutbox(): Promise<SyncMessage[]> {
  const rows = await db.syncQueue
    .where("direction")
    .equals("outbox")
    .reverse() // newest first
    .toArray();
  return rows.map(fromRow);
}

/* ------------------------- Inbox ------------------------- */

export async function storeInbox(message: SyncMessage): Promise<boolean> {
  const existing = await db.syncQueue.get(message.id);
  if (existing) return false;
  await db.syncQueue.add(toRow(message));
  return true;
}

export async function listInbox(): Promise<SyncMessage[]> {
  const rows = await db.syncQueue
    .where("direction")
    .equals("inbox")
    .toArray();
  return rows.map(fromRow);
}

export async function getInboxMessage(id: string): Promise<SyncMessage | null> {
  const row = await db.syncQueue.get(id);
  if (!row) return null;
  return fromRow(row);
}

export async function deleteInboxMessage(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

export async function setStatus(id: string, status: SyncStatus): Promise<void> {
  await db.syncQueue.update(id, { status, updatedAt: new Date().toISOString() });
}

export async function clearAllSynced(): Promise<void> {
  await db.syncQueue.where("status").equals("acknowledged").delete();
}