import { describe, it, expect } from "vitest";
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
    expect(p.handlingFee).toBe(300);
    expect(p.tax).toBe(500);
    expect(p.total).toBe(23600);
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
});