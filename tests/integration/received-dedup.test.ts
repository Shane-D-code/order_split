import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/db/database";
import {
  hasReceivedOrder,
  listReceivedOrders,
  orderDedupKey,
  tryInsertReceivedOrder,
  getReceivedOrder,
} from "../../src/db/repositories/received";
import { buildOrder, createOrderItem } from "../../src/domain/order";
import type { ReceivedOrder } from "../../src/domain/types";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function received(over: Partial<ReceivedOrder> = {}): ReceivedOrder {
  const base = buildOrder({
    id: "order-1",
    platform: "blinkit",
    orderedAt: "2026-08-12T14:14:00",
    items: [createOrderItem({ name: "Milk", quantity: 2, unitPrice: 3000 })],
    subtotal: 6000,
    deliveryFee: 0,
    handlingFee: 0,
    packagingFee: 0,
    tax: 0,
    discount: 0,
    sourceType: "screenshot",
  });
  return {
    ...base,
    receivedAt: new Date().toISOString(),
    fromDeviceId: "child-1",
    dedupKey: orderDedupKey(base.id, "msg-1"),
    syncMessageId: "msg-1",
    ...over,
  };
}

describe("received order dedup", () => {
  it("stores an order once and rejects duplicates", async () => {
    const first = received();
    expect(await tryInsertReceivedOrder(first)).not.toBeNull();
    expect(await hasReceivedOrder(first.id)).toBe(true);
    expect(await listReceivedOrders()).toHaveLength(1);
    expect(await getReceivedOrder(first.id)).not.toBeNull();

    const redelivery = received({ dedupKey: orderDedupKey(first.id, "msg-1") });
    expect(await tryInsertReceivedOrder(redelivery)).toBeNull();
    expect(await listReceivedOrders()).toHaveLength(1);
  });

  it("rejects a different message for the same order id", async () => {
    const first = received();
    await tryInsertReceivedOrder(first);
    const again = received({ syncMessageId: "msg-2", dedupKey: orderDedupKey(first.id, "msg-2") });
    expect(await tryInsertReceivedOrder(again)).toBeNull();
    expect(await listReceivedOrders()).toHaveLength(1);
  });

  it("keeps the dedup set after deletion survivors never create dupes", async () => {
    const first = received();
    await tryInsertReceivedOrder(first);
    await db.receivedOrders.delete(first.id);
    const again = received({ syncMessageId: "msg-9", dedupKey: orderDedupKey(first.id, "msg-9") });
    expect(await tryInsertReceivedOrder(again)).toBeNull();
  });
});