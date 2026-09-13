import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/db/database";
import {
  cleanupOrders,
  countOrders,
  createDraft,
  createOrder,
  deleteOrder,
  getDraft,
  getOrder,
  listDrafts,
  listOwnOrders,
  updateDraft,
} from "../../src/db/repositories/orders";
import { buildOrder, createOrderItem } from "../../src/domain/order";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("order persistence", () => {
  it("creates and reads an order with items", async () => {
    const order = buildOrder({
      platform: "zepto",
      orderedAt: "2026-08-12T11:42:00",
      items: [createOrderItem({ name: "Milk", quantity: 1, unitPrice: 8200 })],
      subtotal: 8200,
      deliveryFee: 1900,
      handlingFee: 300,
      packagingFee: 0,
      tax: 500,
      discount: 0,
      sourceType: "manual",
    });
    await createOrder(order);
    const loaded = await getOrder(order.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.items).toHaveLength(1);
    expect(loaded!.total).toBe(10900);
    expect(loaded!.items[0].name).toBe("Milk");
  });

  it("lists orders newest first", async () => {
    for (const [date, platform] of [
      ["2026-08-10T09:00:00", "blinkit"],
      ["2026-08-12T11:42:00", "zepto"],
    ] as const) {
      await createOrder(
        buildOrder({
          platform,
          orderedAt: date,
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          handlingFee: 0,
          packagingFee: 0,
          tax: 0,
          discount: 0,
          sourceType: "manual",
        }),
      );
    }
    const all = await listOwnOrders();
    expect(all.map((o) => o.platform)).toEqual(["zepto", "blinkit"]);
  });

  it("deletes an order and its items", async () => {
    const order = buildOrder({
      platform: "blinkit",
      orderedAt: "2026-08-12T14:14:00",
      items: [createOrderItem({ name: "Milk", quantity: 2, unitPrice: 3000 })],
      subtotal: 6000,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    await createOrder(order);
    await deleteOrder(order.id);
    expect(await getOrder(order.id)).toBeNull();
    const items = await db.orderItems.where("orderId").equals(order.id).count();
    expect(items).toBe(0);
  });
});

describe("retention cleanup", () => {
  it("removes only orders older than the window", async () => {
    const old = buildOrder({
      platform: "blinkit",
      orderedAt: "2026-06-01T10:00:00",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    const recent = buildOrder({
      platform: "blinkit",
      orderedAt: "2026-09-01T10:00:00",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    await createOrder(old);
    await createOrder(recent);
    const removed = await cleanupOrders("2026-08-12T00:00:00");
    expect(removed).toBe(1);
    expect(await countOrders()).toBe(1);
    expect(await getOrder(recent.id)).not.toBeNull();
  });
});

describe("draft persistence", () => {
  it("persists, updates and deletes an in-flight import", async () => {
    const draft = await createDraft({
      sourceType: "screenshot",
      rawText: "some text",
      platform: "blinkit",
      orderedAt: "2026-08-12T14:14:00",
      items: [createOrderItem({ name: "Milk", quantity: 1, unitPrice: 3000 })],
      subtotal: 3000,
      deliveryFee: 0,
      handlingFee: 500,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      total: 3500,
      warnings: [],
    });
    expect((await getDraft(draft.id))?.total).toBe(3500);
    await updateDraft(draft.id, { total: 4000, warnings: [] });
    expect((await getDraft(draft.id))?.total).toBe(4000);
    expect(await listDrafts()).toHaveLength(1);
    await db.drafts.delete(draft.id);
    expect(await listDrafts()).toHaveLength(0);
  });
});