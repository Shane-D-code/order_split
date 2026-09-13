import { db, type OrderRow, type OrderItemRow, type DraftRow } from "../database";
import type { Order, OrderItem } from "../../domain/types";
import { newId } from "../../domain/id";
import type { DraftInput } from "./draft-types";

function toOrderRow(order: Order): OrderRow {
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
  };
}

function toItemRow(orderId: string, item: OrderItem): OrderItemRow {
  return {
    id: item.id,
    orderId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

export async function createOrder(order: Order): Promise<void> {
  await db.transaction("rw", [db.orders, db.orderItems], async () => {
    await db.orders.add(toOrderRow(order));
    if (order.items.length > 0) {
      await db.orderItems.bulkAdd(order.items.map((i) => toItemRow(order.id, i)));
    }
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  const row = await db.orders.get(id);
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

export async function listOwnOrders(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Order[]> {
  let rows: OrderRow[];
  if (opts?.from !== undefined || opts?.to !== undefined) {
    rows = await db.orders.orderBy("orderedAt").reverse().toArray();
    if (opts?.from !== undefined) {
      rows = rows.filter((r) => r.orderedAt >= opts.from!);
    }
    if (opts?.to !== undefined) {
      rows = rows.filter((r) => r.orderedAt < opts.to!);
    }
  } else {
    rows = await db.orders.orderBy("orderedAt").reverse().toArray();
  }
  if (opts?.limit !== undefined) {
    rows = rows.slice(0, opts.limit);
  }
  return hydrateMany(rows);
}

async function hydrateMany(rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const itemRows = await db.orderItems.where("orderId").anyOf(ids).toArray();
  const byOrder = new Map<string, OrderItemRow[]>();
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

export function listAllOwnOrders(): Promise<Order[]> {
  return listOwnOrders();
}

/** All orders whose orderedAt falls within the given local day (YYYY-MM-DD). */
export async function listOrdersForDay(day: string): Promise<Order[]> {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return listOwnOrders({
    from: start.toISOString(),
    to: end.toISOString(),
  });
}

export async function deleteOrder(id: string): Promise<void> {
  await db.transaction("rw", [db.orders, db.orderItems], async () => {
    await db.orders.delete(id);
    await db.orderItems.where("orderId").equals(id).delete();
  });
}

/**
 * Retention cleanup. Deletes orders (and their items) ordered strictly
 * before `before` (ISO string). Explicit and deterministic; no data
 * beyond the retention window is touched.
 */
export async function cleanupOrders(beforeIso: string): Promise<number> {
  const old = await db.orders.where("orderedAt").below(beforeIso).primaryKeys();
  if (old.length === 0) return 0;
  await db.transaction("rw", [db.orders, db.orderItems], async () => {
    await db.orders.bulkDelete(old);
    await db.orderItems.where("orderId").anyOf(old).delete();
  });
  return old.length;
}

export async function countOrders(): Promise<number> {
  return db.orders.count();
}

/* ------------------------- Draft (in-flight import) ------------------------ */

export async function createDraft(input: DraftInput & { id?: string }): Promise<DraftRow> {
  const now = new Date().toISOString();
  const draft: DraftRow = {
    id: input.id ?? newId(),
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    rawText: input.rawText,
    image: input.image,
    platform: input.platform,
    orderedAt: input.orderedAt,
    items: input.items,
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    handlingFee: input.handlingFee,
    packagingFee: input.packagingFee,
    tax: input.tax,
    discount: input.discount,
    total: input.total,
    currency: "INR",
    warnings: input.warnings,
    status: "editing",
    sourceDraftId: input.sourceDraftId,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await db.drafts.add(draft);
  return draft;
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  return (await db.drafts.get(id)) ?? null;
}

export async function updateDraft(
  id: string,
  patch: Partial<Pick<DraftRow, "items" | "subtotal" | "deliveryFee" | "handlingFee" | "packagingFee" | "tax" | "discount" | "total" | "platform" | "orderedAt" | "warnings" | "image" | "rawText">>,
): Promise<void> {
  await db.drafts.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function listDrafts(): Promise<DraftRow[]> {
  return db.drafts.orderBy("updatedAt").reverse().toArray();
}

/** Delete a draft once it is confirmed (or abandoned by the user). */
export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
}

export async function deleteAllDrafts(): Promise<void> {
  await db.drafts.clear();
}