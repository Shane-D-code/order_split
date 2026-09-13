import { describe, it, expect } from "vitest";
import {
  buildOrder,
  computeOrderTotals,
  createOrderItem,
  itemsSubtotal,
  orderFromDraft,
} from "../../src/domain/order";
import { formatRupee } from "../../src/money/format";

describe("order domain", () => {
  it("sanity checks createOrderItem", () => {
    const item = createOrderItem({ name: "Milk", quantity: 2, unitPrice: 3000 });
    expect(item.lineTotal).toBe(6000);
    expect(item.quantity).toBe(2);
    expect(createOrderItem({ name: "Bread", quantity: 0, unitPrice: 4500 }).quantity).toBe(1);
  });

  it("computes deterministic totals", () => {
    const t = computeOrderTotals({
      items: [
        { quantity: 2, unitPrice: 3000 },
        { quantity: 1, unitPrice: 4500 },
      ],
      subtotal: 10500,
      deliveryFee: 0,
      handlingFee: 500,
      packagingFee: 0,
      tax: 0,
      discount: 2000,
    });
    expect(t.itemsTotal).toBe(10500);
    expect(t.total).toBe(9000);
  });

  it("builds an order with recomputed totals", () => {
    const item = createOrderItem({ name: "Eggs", quantity: 12, unitPrice: 600 });
    const order = buildOrder({
      platform: "blinkit",
      orderedAt: "2026-08-12T14:14:00",
      items: [item],
      subtotal: 7200,
      deliveryFee: 0,
      handlingFee: 500,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    expect(order.total).toBe(7700);
    expect(order.currency).toBe("INR");
    expect(formatRupee(order.total)).toBe("₹77.00");
    expect(itemsSubtotal([item])).toBe(7200);
  });

  it("ensures non-negative inputs", () => {
    const t = computeOrderTotals({
      items: [],
      subtotal: 0,
      deliveryFee: -5,
      handlingFee: -2,
      packagingFee: -1,
      tax: -3,
      discount: -10,
    });
    expect(t.deliveryFee).toBe(0);
    expect(t.handlingFee).toBe(0);
    expect(t.packagingFee).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.discount).toBe(0);
    expect(t.total).toBe(0);
  });

  describe("orderFromDraft", () => {
    it("preserves every total exactly as confirmed — never recomputes", () => {
      const order = orderFromDraft({
        platform: "blinkit",
        orderedAt: "2026-08-12T14:14:00",
        items: [
          { id: "i1", name: "Milk", quantity: 2, unitPrice: 3000, lineTotal: 6050 },
          { id: "i2", name: "Bread", quantity: 1, unitPrice: 4500, lineTotal: 4500 },
        ],
        subtotal: 10550,
        deliveryFee: 0,
        handlingFee: 500,
        packagingFee: 250,
        tax: 1200,
        discount: 2000,
        total: 10500,
        sourceType: "manual",
      });
      expect(order.subtotal).toBe(10550);
      expect(order.deliveryFee).toBe(0);
      expect(order.handlingFee).toBe(500);
      expect(order.packagingFee).toBe(250);
      expect(order.tax).toBe(1200);
      expect(order.discount).toBe(2000);
      // The confirmed total is authoritative even if items disagree.
      expect(order.total).toBe(10500);
    });

    it("derives a missing unit price from the line total (rounded)", () => {
      const order = orderFromDraft({
        platform: "other",
        orderedAt: "2026-08-12T14:14:00",
        items: [{ id: "i1", name: "Onion", quantity: 3, unitPrice: null, lineTotal: 5450 }],
        subtotal: 5450,
        deliveryFee: 0,
        handlingFee: 0,
        packagingFee: 0,
        tax: 0,
        discount: 0,
        total: 5450,
        sourceType: "manual",
      });
      expect(order.items[0].unitPrice).toBe(1817); // round(54.50 / 3)
      expect(order.items[0].lineTotal).toBe(5451); // derived 1817 × 3
      expect(order.total).toBe(5450); // total untouched
    });

    it("forces minimum quantity of one and non-negative money", () => {
      const order = orderFromDraft({
        platform: "zepto",
        orderedAt: "2026-08-12T14:14:00",
        items: [{ id: "i1", name: "Water", quantity: 0, unitPrice: -5, lineTotal: 5 }],
        subtotal: 0,
        deliveryFee: -10,
        handlingFee: 0,
        packagingFee: 0,
        tax: 0,
        discount: -50,
        total: 0,
        sourceType: "manual",
      });
      expect(order.items[0].quantity).toBe(1);
      expect(order.items[0].unitPrice).toBe(0);
      expect(order.deliveryFee).toBe(0);
      expect(order.discount).toBe(0);
    });
  });
});