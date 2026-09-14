import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBillText } from "../../src/parse/order-parser";

const BLINKIT = `
Blinkit
Order placed on 12/08/2026 at 2:14 PM
Order ID: BI2309-78412

Items
Milk 500ml 2 x ₹30 ₹60
Bread 1 x ₹45 ₹45
Eggs 12 x ₹6 ₹72

Item total ₹177
Delivery fee ₹0
Handling fee ₹5
Discount ₹20
GST ₹0
Bill total ₹162
`;

const ZEPTO = `
Zepto
Delivery in 9 min
Milk 1L 2 x ₹82 ₹164
Bananas 1 x ₹45 ₹45
Subtotal ₹209
Delivery fee ₹19
Platform fee ₹3
GST ₹5
To pay ₹236
`;

const INSTAMART = `
Swiggy Instamart
Invoice #4451 dated 22/08/2026 8:41 PM

Tomato 500g 1 x ₹42 ₹42
Onion 1kg 1 x ₹35 ₹35

Bill details
Item total ₹77
Delivery fee ₹9
Platform fee ₹3
Discount -₹5
Taxes ₹0
To pay ₹84
`;

const GENERIC_TABULAR = `
Green Grocers
Date: 18/08/2026 10:05 AM
Qty Item Price Amount
2 Milk 30.00 60.00
1 Bread 45.00 45.00
Subtotal 105.00
Delivery 9.00
Total 114.00
`;

describe("parseBillText", () => {
  it("parses a Blinkit bill", () => {
    const p = parseBillText(BLINKIT);
    expect(p.platform).toBe("blinkit");
    expect(p.orderedAt).toBe("2026-08-12T14:14:00");
    expect(p.items).toHaveLength(3);
    expect(p.items[0]).toMatchObject({ name: "Milk 500ml", quantity: 2, unitPrice: 3000, lineTotal: 6000 });
    expect(p.items[2]).toMatchObject({ name: "Eggs", quantity: 12, unitPrice: 600, lineTotal: 7200 });
    expect(p.subtotal).toBe(17700);
    expect(p.deliveryFee).toBe(0);
    expect(p.handlingFee).toBe(500);
    expect(p.discount).toBe(2000);
    expect(p.tax).toBe(0);
    expect(p.total).toBe(16200);
  });

  it("parses a Zepto bill (fees on subtotal, total separate)", () => {
    const p = parseBillText(ZEPTO);
    expect(p.platform).toBe("zepto");
    expect(p.subtotal).toBe(20900);
    expect(p.deliveryFee).toBe(1900);
    expect(p.handlingFee).toBeNull();
    expect(p.tax).toBe(500);
    expect(p.total).toBe(23600);
    expect(p.unclassifiedFees).toContainEqual({ label: "Platform fee", value: 300 });
    expect(p.items[0]).toMatchObject({ name: "Milk 1L", quantity: 2, unitPrice: 8200 });
  });

  it("parses an Instamart bill with negative discount", () => {
    const p = parseBillText(INSTAMART);
    expect(p.platform).toBe("instamart");
    expect(p.subtotal).toBe(7700);
    expect(p.discount).toBe(500);
    expect(p.total).toBe(8400);
    expect(p.items[1].name).toBe("Onion 1kg");
  });

  it("parses a generic invoice without ₹ symbols", () => {
    const p = parseBillText(GENERIC_TABULAR);
    expect(p.orderedAt).toBe("2026-08-18T10:05:00");
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toMatchObject({ name: "Milk", quantity: 2, unitPrice: 3000, lineTotal: 6000 });
    expect(p.subtotal).toBe(10500);
    expect(p.deliveryFee).toBe(900);
    expect(p.total).toBe(11400);
  });

  it("leaves unknown fields null instead of guessing", () => {
    const p = parseBillText("A random receipt with no structure\nsome items info");
    expect(p.items).toEqual([]);
    expect(p.total).toBeNull();
    expect(p.subtotal).toBeNull();
    expect(p.platform).toBeNull();
  });

  it("does not treat 'discount' inside item names as a summary", () => {
    const parsed = parseBillText(`Some Shop
Milk
1 x ₹50 ₹50
Subtotal ₹50
To pay ₹53`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Milk", quantity: 1, unitPrice: 5000, lineTotal: 5000 });
    expect(parsed.subtotal).toBe(5000);
    expect(parsed.total).toBe(5300);
  });

  it("keeps 'Coffee Shop' as a complete item name above its price", () => {
    const parsed = parseBillText(`Coffee Shop
1 x ₹99 ₹99
Subtotal ₹99
To pay ₹100`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Coffee Shop", quantity: 1, unitPrice: 9900, lineTotal: 9900 });
  });

  it("keeps 'General Store' as a complete item name above its price", () => {
    const parsed = parseBillText(`General Store
2 x ₹45 ₹90
Subtotal ₹90
To pay ₹92`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "General Store", quantity: 2, unitPrice: 4500, lineTotal: 9000 });
  });

  it("keeps 'Fresh Store' as a complete item name above its price", () => {
    const parsed = parseBillText(`Fresh Store
1 x ₹40 ₹40
Subtotal ₹40
To pay ₹43`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Fresh Store", quantity: 1, unitPrice: 4000, lineTotal: 4000 });
  });

  it("keeps a shop-suffix item name above the first fragment of the same item", () => {
    const parsed = parseBillText(`Organic Fresh Store
3 x ₹30 ₹90
Subtotal ₹90
To pay ₹93`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Organic Fresh Store", quantity: 3, unitPrice: 3000, lineTotal: 9000 });
  });

  it("still flushes merchant headers that precede a product name", () => {
    const parsed = parseBillText(`Fresh Store
Milk
1 x ₹50 ₹50
Subtotal ₹50
To pay ₹53`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Milk", quantity: 1, unitPrice: 5000, lineTotal: 5000 });
  });

  it("still accumulates wrapped multi-line item names", () => {
    const parsed = parseBillText(`Amul
Milk 500ml
2 x ₹30 ₹60
Subtotal ₹60
To pay ₹63`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ name: "Amul Milk 500ml", quantity: 2, unitPrice: 3000, lineTotal: 6000 });
  });
});

describe("real Blinkit screenshot regression", () => {
  function fixture(name: string): string {
    return readFileSync(resolve("src/parse/__fixtures__", name), "utf8");
  }

  it("parses the real Blinkit invoice transcription into exactly 5 items", () => {
    const parsed = parseBillText(fixture("blinkit-real-invoice.txt"));
    expect(parsed.platform).toBe("blinkit");
    expect(parsed.items).toHaveLength(5);
    expect(parsed.items).toEqual([
      { name: "Haldiram's Nagpur Aloo Bhujia", quantity: 1, unitPrice: 9500, lineTotal: 9500 },
      { name: "Haldiram's Nagpur Mini Samosa -Ready to Eat", quantity: 1, unitPrice: 6200, lineTotal: 6200 },
      { name: "Britannia Good Day Cashew Biscuit", quantity: 1, unitPrice: 4300, lineTotal: 4300 },
      { name: "Soan Papdi by Haldiram's Nagpur", quantity: 1, unitPrice: 13500, lineTotal: 13500 },
      { name: "Britannia Little Hearts Classic Crunch Biscuit", quantity: 1, unitPrice: 2800, lineTotal: 2800 },
    ]);
    expect(parsed.itemsUnreliable).toBeFalsy();
  });

  it("recovers every summary field from the real invoice transcription", () => {
    const parsed = parseBillText(fixture("blinkit-real-invoice.txt"));
    expect(parsed.subtotal).toBe(36300);   // ₹363
    expect(parsed.discount).toBe(400);     // ₹4
    expect(parsed.handlingFee).toBe(1100); // ₹11
    expect(parsed.deliveryFee).toBe(0);    // "FREE"
    expect(parsed.total).toBe(37400);      // ₹374
    // Delivery charges "FREE" must not linger as a fee.
    expect(parsed.items.some((i) => i.name === "Delivery charges")).toBe(false);
    expect(parsed.items.some((i) => /items? in this order/i.test(i.name))).toBe(false);
  });

  it("keeps net weights from becoming quantities from the real transcription", () => {
    for (const text of [
      "Atish 400g x 1 ₹95\nSubtotal ₹95\nBill total ₹95",
      "Atish 300g x1 ₹80\nSubtotal ₹80\nBill total ₹80",
      "Atish 200g x 1 ₹60\nSubtotal ₹60\nBill total ₹60",
      "Atish 79gx1 ₹28\nSubtotal ₹28\nBill total ₹28",
    ]) {
      const parsed = parseBillText(text);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]!.quantity).toBe(1);
      expect(parsed.items[0]!.lineTotal).toBe(parsed.subtotal);
    }
  });

  it("tolerates OCR-mangled currency glyphs in the summary of the raw OCR", () => {
    const parsed = parseBillText(fixture("blinkit-real-ocr-full-window.txt"));
    // Total extraction that regressed stays restored even through ¥/%/Z ruining.
    expect(parsed.itemsUnreliable).toBeFalsy();
    expect(parsed.items.length).toBeGreaterThanOrEqual(3);
    expect(parsed.items.length).toBeLessThanOrEqual(5);
    expect(parsed.subtotal).toBe(36300);  // "Item total ¥363"
    expect(parsed.discount).toBe(400);    // "Product discount -Z4"
    expect(parsed.deliveryFee).toBe(0);   // "Delivery charges FREE"
    expect(parsed.total).toBe(37400);     // "Bill total %374"
    // The first and last items survived OCR intact.
    expect(parsed.items[0]).toMatchObject({ name: "Haldiram's Nagpur Aloo Bhujia", quantity: 1, unitPrice: 9500 });
    expect(parsed.items[parsed.items.length - 1]).toMatchObject({
      name: "Britannia Little Hearts Classic Crunch Biscuit",
      quantity: 1,
      unitPrice: 2800,
    });
    // Nothing absurd: a weight is never a quantity.
    for (const item of parsed.items) {
      expect(item.quantity).toBeGreaterThanOrEqual(1);
      expect(item.quantity).toBeLessThanOrEqual(4);
    }
  });

  it(`does not invent items from UI chrome or the "5 items in this order" banner`, () => {
    const parsed = parseBillText(fixture("blinkit-real-ocr-full-window.txt"));
    const names = parsed.items.map((i) => i.name);
    for (const junk of ["Home", "My Orders", "My Prescriptions", "E-Gift Cards",
      "Account privacy", "Logout", "Bill details", "Order details", "MRP", "Be"]) {
      expect(names.some((n) => n.includes(junk))).toBe(false);
    }
  });

  it("shows honest emptiness for the downscaled OCR where digits were lost", () => {
    const parsed = parseBillText(fixture("blinkit-real-ocr-app-preprocessed.txt"));
    expect(parsed.items).toHaveLength(0);
    expect(parsed.total).toBeNull();
    expect(parsed.subtotal).toBeNull();
  });

  it("flags the parse as unreliable instead of returning a 799-item order", () => {
    const runaway = Array.from({ length: 150 }, (_, i) => `Item number ${i} Brand X\n1 x ₹10 ₹10`).join("\n");
    const parsed = parseBillText(runaway + "\nBill total ₹1500");
    expect(parsed.items).toHaveLength(0);
    expect(parsed.itemsUnreliable).toBe(true);
    expect(parsed.total).toBe(150000);
  });

  it("flags unreliable when extraction is far below declared item count", () => {
    const text = [
      "Blinkit",
      "5 items in this order",
      "Milk 500ml 1 x ₹30 ₹30",
      "Item total ₹30",
      "Bill total ₹30",
    ].join("\n");
    const parsed = parseBillText(text);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.itemsUnreliable).toBe(true);
  });

  it("does not flag unreliable when extraction is close to declared count", () => {
    const text = [
      "Blinkit",
      "5 items in this order",
      "Milk 500ml 1 x ₹30 ₹30",
      "Bread 1 x ₹45 ₹45",
      "Eggs 1 x ₹6 ₹6",
      "Butter 1 x ₹25 ₹25",
      "Cheese 1 x ₹40 ₹40",
      "Item total ₹146",
      "Bill total ₹146",
    ].join("\n");
    const parsed = parseBillText(text);
    expect(parsed.items).toHaveLength(5);
    expect(parsed.itemsUnreliable).toBeFalsy();
  });

  it("product weights never become quantities regardless of layout", () => {
    for (const [text, expectedQty] of [
      ["Haldiram 400g x 1 ₹95\nSubtotal ₹95\nBill total ₹95", 1],
      ["Haldiram 500g x1 ₹120\nSubtotal ₹120\nBill total ₹120", 1],
      ["Haldiram 79gx1 ₹28\nSubtotal ₹28\nBill total ₹28", 1],
      ["Haldiram 1kg x1 ₹80\nSubtotal ₹80\nBill total ₹80", 1],
      ["Haldiram 200ml x 1 ₹45\nSubtotal ₹45\nBill total ₹45", 1],
      ["Haldiram 2L x1 ₹60\nSubtotal ₹60\nBill total ₹60", 1],
      ["Haldiram 500g x 1 ₹95\nSubtotal ₹95\nBill total ₹95", 1],
      ["Haldiram 1L x1 ₹50\nSubtotal ₹50\nBill total ₹50", 1],
    ] as const) {
      const parsed = parseBillText(text);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]!.quantity).toBe(expectedQty);
    }
  });

  it("does not interpret large weight numbers as purchase quantity", () => {
    for (const line of [
      "Chips 500g x 1 ₹30",
      "Oats 400g x1 ₹85",
      "Cola 200ml x 1 ₹20",
      "Water 1L x1 ₹18",
      "Chips\n500g x 1 ₹30",
      "Oats\n400g x1 ₹85",
      "Cola\n200ml x 1 ₹20",
      "Water\n1L x1 ₹18",
    ]) {
      const parsed = parseBillText(`${line}\nSubtotal ₹30\nBill total ₹30`);
      expect(parsed.items[0]!.quantity).toBe(1);
    }
  });

  it("rejects items with implausible quantity from OCR-garbled numbers", () => {
    const parsed = parseBillText([
      "Soan Papdi by Haldiram's Nagpur",
      "500g x1 135",
      "Bill total ₹135",
    ].join("\n"));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.quantity).toBe(1);
    expect(parsed.items[0]!.lineTotal).toBe(13500);
  });

  it("handles a single-price name that is actually a size-qty fragment", () => {
    const parsed = parseBillText([
      "Product Name",
      "a 500g x1 135",
      "Bill total ₹135",
    ].join("\n"));
    // The SIZE_UNIT pattern detects "500g x1" as a size+qty line. The stray
    // captured name "a" is too short, so it falls back to the inferred name
    // from lines above ("Product Name"), avoiding a phantom item.
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.name).toBe("Product Name");
    expect(parsed.items[0]!.quantity).toBe(1);
    expect(parsed.items[0]!.lineTotal).toBe(13500);
  });

  it("recovers summary fields from OCR-mangled currency glyphs in system-tesseract output", () => {
    const parsed = parseBillText(fixture("blinkit-real-ocr-system-tesseract.txt"));
    expect(parsed.total).toBe(37400);     // "Bill total %374"
    expect(parsed.subtotal).toBe(36300); // "Item total %363"
    expect(parsed.discount).toBe(400);   // "Product discount -%4"
    expect(parsed.deliveryFee).toBe(0);  // "Delivery charges FREE"
    // "Handling charge +211" is genuinely garbled and cannot be recovered
    // reliably — null is safer than the wrong value.
    expect(parsed.handlingFee).toBeNull();
  });

  it("flags unreliable instead of producing catastrophic items from system-tesseract OCR", () => {
    const parsed = parseBillText(fixture("blinkit-real-ocr-system-tesseract.txt"));
    // The OCR is heavily degraded — total is reliably extracted but items
    // cannot be confidently parsed, so itemsUnreliable must be set.
    expect(parsed.itemsUnreliable).toBe(true);
    // At least the total is preserved even when items are unreliable.
    expect(parsed.total).toBe(37400);
  });

  it("wraps long product names across OCR lines without losing them", () => {
    const parsed = parseBillText([
      "Britannia Little Hearts",
      "Classic Crunch Biscuit",
      "79g x1 ₹28",
      "Bill total ₹28",
    ].join("\n"));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.name).toBe("Britannia Little Hearts Classic Crunch Biscuit");
    expect(parsed.items[0]!.quantity).toBe(1);
    expect(parsed.items[0]!.lineTotal).toBe(2800);
  });
});