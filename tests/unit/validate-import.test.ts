import { describe, it, expect, beforeEach } from "vitest";
import {
  validateParsedOrder,
  hasBlockingErrors,
  validateDraft,
  detectPlatform,
  resetWarningIds,
} from "../../src/parse/validate-import";
import type { ParsedOrder } from "../../src/parse/types";
import type { DraftRow } from "../../src/db/database";

function parsed(over: Partial<ParsedOrder> = {}): ParsedOrder {
  return {
    platform: "blinkit",
    orderedAt: "2026-08-12T14:14:00",
    items: [
      { name: "Milk", quantity: 2, unitPrice: 3000, lineTotal: 6000 },
      { name: "Bread", quantity: 1, unitPrice: 4500, lineTotal: 4500 },
    ],
    subtotal: 10500,
    deliveryFee: 0,
    handlingFee: 500,
    packagingFee: 0,
    tax: 0,
    discount: 2000,
    total: 9000,
    ...over,
  };
}

beforeEach(() => resetWarningIds());

describe("validateParsedOrder", () => {
  it("accepts a clean bill", () => {
    expect(validateParsedOrder(parsed())).toEqual([]);
  });

  it("flags a line-total mismatch", () => {
    const warnings = validateParsedOrder(
      parsed({ items: [{ name: "Milk", quantity: 2, unitPrice: 3000, lineTotal: 6200 }] }),
    );
    expect(warnings.some((w) => w.code === "ITEM_LINE_TOTAL_MISMATCH")).toBe(true);
  });

  it("flags items-total vs subtotal mismatch", () => {
    const warnings = validateParsedOrder(parsed({ subtotal: 13000 }));
    expect(warnings.some((w) => w.code === "ITEMS_VS_SUBTOTAL")).toBe(true);
  });

  it("flags bill total mismatch", () => {
    const warnings = validateParsedOrder(parsed({ total: 9999 }));
    expect(warnings.some((w) => w.code === "TOTAL_MISMATCH")).toBe(true);
  });

  it("treats missing total as a blocking error", () => {
    const warnings = validateParsedOrder(parsed({ total: null }));
    expect(warnings.some((w) => w.code === "TOTAL_MISSING")).toBe(true);
    expect(hasBlockingErrors(warnings)).toBe(true);
  });

  it("treats missing platform as non-blocking", () => {
    const warnings = validateParsedOrder(parsed({ platform: null }));
    expect(warnings.some((w) => w.code === "PLATFORM_MISSING")).toBe(true);
    expect(hasBlockingErrors(warnings)).toBe(false);
  });

  it("treats empty items as a blocking error", () => {
    const warnings = validateParsedOrder(parsed({ items: [] }));
    expect(hasBlockingErrors(warnings)).toBe(true);
  });

  it("does not auto-correct anything", () => {
    const p = parsed({ total: 9999 });
    const warnings = validateParsedOrder(p);
    expect(warnings.length).toBeGreaterThan(0);
    expect(p.total).toBe(9999); // untouched
  });

  it("allows user override to dismiss a warning", () => {
    const warnings = validateParsedOrder(parsed({ total: 9999 }));
    const [warning] = warnings.filter((w) => w.code === "TOTAL_MISMATCH");
    expect(hasBlockingErrors(warnings)).toBe(false);
    expect(warning?.allowOverride).toBe(true);
  });

  it("accepts a total where the discount is embedded in the item prices", () => {
    // Blinkit shows an item total that already includes the product discount.
    const warnings = validateParsedOrder(
      parsed({
        items: [{ name: "A", quantity: 1, unitPrice: 36300, lineTotal: 36300 }],
        subtotal: 36300,
        discount: 400,
        handlingFee: 1100,
        deliveryFee: 0,
        total: 37400,
      }),
    );
    expect(warnings.some((w) => w.code === "TOTAL_MISMATCH")).toBe(false);
  });

  it("blocking when no trustworthy items were identified", () => {
    const warnings = validateParsedOrder(parsed({ items: [], itemsUnreliable: true }));
    expect(warnings.some((w) => w.code === "ITEMS_UNRELIABLE")).toBe(true);
    expect(warnings.some((w) => w.code === "ITEMS_NOT_FOUND")).toBe(false);
    expect(hasBlockingErrors(warnings)).toBe(true);
  });
});

describe("validateDraft", () => {
  function draft(over: Partial<DraftRow> = {}): DraftRow {
    return {
      id: "d1",
      sourceType: "screenshot",
      platform: "blinkit",
      orderedAt: "2026-08-12T14:14:00",
      items: [
        { id: "i1", name: "Milk", quantity: 2, unitPrice: 3000, lineTotal: 6000 },
      ],
      subtotal: 6000,
      deliveryFee: 0,
      handlingFee: 500,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      total: 6500,
      currency: "INR",
      warnings: [],
      status: "editing",
      createdAt: "x",
      updatedAt: "x",
      ...over,
    };
  }

  it("re-validates after a user edit", () => {
    const warnings = validateDraft(draft({ total: 8000 }));
    expect(warnings.some((w) => w.code === "TOTAL_MISMATCH")).toBe(true);
  });
});

describe("detectPlatform", () => {
  it("detects platforms from raw text", () => {
    expect(detectPlatform("blinkit quick commerce")).toBe("blinkit");
    expect(detectPlatform("Swiggy Instamart order")).toBe("instamart");
    expect(detectPlatform("zepto delivery")).toBe("zepto");
    expect(detectPlatform("bigbasket.com")).toBe("bigbasket");
    expect(detectPlatform("amazon.in")).toBe("amazon");
    expect(detectPlatform("some local store")).toBeNull();
  });
});