import { describe, it, expect } from "vitest";
import { finalizeImport } from "../../src/parse/pipeline";
import { validateParsedOrder } from "../../src/parse/validate-import";

const BLINKIT = `
Blinkit
Order placed on 12/08/2026 at 2:14 PM
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

describe("import pipeline (text -> parse -> validate)", () => {
  it("produces a valid candidate from a clean bill", () => {
    const result = finalizeImport({ text: BLINKIT, sourceKind: "text" });
    expect(result.sourceKind).toBe("text");
    expect(result.parsed.platform).toBe("blinkit");
    expect(result.parsed.items).toHaveLength(3);
    expect(result.parsed.total).toBe(16200);
    expect(result.warnings).toEqual([]);
    expect(validateParsedOrder(result.parsed)).toEqual([]);
  });

  it("surfaces warnings without touching the candidate", () => {
    const tampered = BLINKIT.replace("Bill total ₹162", "Bill total ₹190");
    const result = finalizeImport({ text: tampered, sourceKind: "text" });
    expect(result.parsed.total).toBe(19000);
    expect(result.warnings.map((w) => w.code)).toContain("TOTAL_MISMATCH");
  });

  it("keeps missing totals null and reports them as errors", () => {
    const noTotal = BLINKIT.replace("Bill total ₹162", "");
    const result = finalizeImport({ text: noTotal, sourceKind: "text" });
    expect(result.parsed.total).toBeNull();
    expect(result.warnings.some((w) => w.code === "TOTAL_MISSING")).toBe(true);
  });
});