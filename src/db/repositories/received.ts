import { db, type ReceivedOrderRow } from "../database";
import type { ReceivedOrder } from "../../domain/types";

function toRow(order: ReceivedOrder): ReceivedOrderRow {
  return {
    id: order.id,
    platform: order.platform,
    orderedAt: order.orderedAt,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    handlingFee: order.handlingFee,
    packagingFee: order.packagingFee,
    tax: order.tax,
    discount: order.discount,
    total: order.total,
    currency: order.currency,
    sourceType: order.sourceType,
    sourceName: order.sourceName,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    receivedAt: order.receivedAt,
    fromDeviceId: order.fromDeviceId,
    dedupKey: order.dedupKey,
    syncMessageId: order.syncMessageId,
  };
}

export function orderDedupKey(orderId: string, messageId: string): string {
  return `${orderId}:${messageId}`;
}

/** True when this orderId already exists (duplicate delivery). */
export async function hasReceivedOrder(orderId: string): Promise<boolean> {
  return (await db.receivedOrders.get(orderId)) !== undefined;
}

const ORDER_DEDUP_PREFIX = "order:";

export function orderDedupKeyById(orderId: string): string {
  return `${ORDER_DEDUP_PREFIX}${orderId}`;
}

/**
 * Insert a received order only if it is not a duplicate. Returns the
 * created order, or null when the same order already arrived.
 */
export async function tryInsertReceivedOrder(
  order: ReceivedOrder,
): Promise<ReceivedOrder | null> {
  const existing = await db.receivedOrders.get(order.id);
  if (existing) {
    await recordDedupKey(order.dedupKey);
    return null;
  }
  const orderMarker = await db.dedup.get(orderDedupKeyById(order.id));
  if (orderMarker) return null;
  const dedup = await db.dedup.get(order.dedupKey);
  if (dedup) {
    return null;
  }
  await db.transaction("rw", [db.receivedOrders, db.dedup, db.orderItems], async () => {
    await db.receivedOrders.add(toRow(order));
    await db.dedup.add({ key: order.dedupKey, createdAt: new Date().toISOString() });
    await db.dedup.add({ key: orderDedupKeyById(order.id), createdAt: new Date().toISOString() });
    if (order.items.length > 0) {
      await db.orderItems.bulkAdd(
        order.items.map((i) => ({
          id: i.id,
          orderId: order.id,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      );
    }
  });
  return order;
}

async function recordDedupKey(dedupKey: string): Promise<void> {
  const has = await db.dedup.get(dedupKey);
  if (!has) {
    await db.dedup.add({ key: dedupKey, createdAt: new Date().toISOString() });
  }
}

export async function listReceivedOrders(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ReceivedOrder[]> {
  let rows = await db.receivedOrders.orderBy("orderedAt").reverse().toArray();
  if (opts?.from !== undefined) rows = rows.filter((r) => r.orderedAt >= opts.from!);
  if (opts?.to !== undefined) rows = rows.filter((r) => r.orderedAt < opts.to!);
  if (opts?.limit !== undefined) rows = rows.slice(0, opts.limit);
  return hydrateMany(rows);
}

async function hydrateMany(rows: ReceivedOrderRow[]): Promise<ReceivedOrder[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const itemRows = await db.orderItems.where("orderId").anyOf(ids).toArray();
  const byOrder = new Map<string, typeof itemRows>();
  for (const ir of itemRows) {
    const list = byOrder.get(ir.orderId) ?? [];
    list.push(ir);
    byOrder.set(ir.orderId, list);
  }
  return rows.map((row) => {
    const items = byOrder.get(row.id) ?? [];
    return {
      ...row,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
    };
  });
}

/** Received orders always store their items; hydrate when reading detail. */
export async function getReceivedOrder(id: string): Promise<ReceivedOrder | null> {
  const row = await db.receivedOrders.get(id);
  if (!row) return null;
  const items = await db.orderItems.where("orderId").equals(id).toArray();
  return {
    ...row,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
  };
}

export async function deleteReceivedOrder(id: string): Promise<void> {
  await db.transaction("rw", [db.receivedOrders, db.orderItems], async () => {
    await db.receivedOrders.delete(id);
    await db.orderItems.where("orderId").equals(id).delete();
  });
}

/** Retention cleanup for received orders (same window as own orders). */
export async function cleanupReceivedOrders(beforeIso: string): Promise<number> {
  const old = await db.receivedOrders.where("orderedAt").below(beforeIso).primaryKeys();
  if (old.length === 0) return 0;
  await db.transaction("rw", [db.receivedOrders, db.orderItems], async () => {
    await db.receivedOrders.bulkDelete(old);
    await db.orderItems.where("orderId").anyOf(old).delete();
  });
  return old.length;
}

export async function countReceivedOrders(): Promise<number> {
  return db.receivedOrders.count();
}