import { describe, it, expect } from "vitest";
import {
  computeItemsTotal,
  computeLineTotal,
  computeTotal,
  multiplyBy,
  rupeesToPaise,
  sum,
} from "../../src/money/money";
import {
  formatDiscount,
  formatRupee,
  formatRupeeCompact,
  parseRupeeInput,
  tryParseRupee,
} from "../../src/money/format";

describe("money", () => {
  it("converts rupees to integer paise without float drift", () => {
    expect(rupeesToPaise(202.5)).toBe(20250);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(0.1)).toBe(10);
    expect(rupeesToPaise(2.9)).toBe(290);
    expect(rupeesToPaise(199.99)).toBe(19999);
  });

  it("computes line totals exactly", () => {
    expect(computeLineTotal(3000, 2)).toBe(6000);
    expect(computeLineTotal(6, 12)).toBe(72);
    expect(computeLineTotal(4550, 3)).toBe(13650);
  });

  it("multiplies only by integers", () => {
    expect(() => multiplyBy(100, 1.5)).toThrow();
    expect(multiplyBy(100, 3)).toBe(300);
  });

  it("computes items totals and final totals", () => {
    expect(computeItemsTotal([6000, 4500, 7200])).toBe(17700);
    expect(
      computeTotal({
        itemsTotal: 17700,
        deliveryFee: 0,
        handlingFee: 500,
        packagingFee: 0,
        tax: 0,
        discount: 2000,
      }),
    ).toBe(16200);
  });

  it("sums without float issues", () => {
    expect(sum([0.1 + 0.2]) === 0.3).toBe(false); // never trust floats
    expect(sum([10500, 900, 300])).toBe(11700);
  });

  it("formats paise as rupees", () => {
    expect(formatRupee(20250)).toBe("₹202.50");
    expect(formatRupee(500)).toBe("₹5.00");
    expect(formatRupeeCompact(20000)).toBe("₹200");
    expect(formatRupeeCompact(20250)).toBe("₹202.50");
    expect(formatDiscount(2000)).toBe("−₹20");
  });

  it("parses user rupee input", () => {
    expect(parseRupeeInput("202.50")).toBe(20250);
    expect(parseRupeeInput("₹202.50")).toBe(20250);
    expect(parseRupeeInput("₹ 202")).toBe(20200);
    expect(parseRupeeInput("202")).toBe(20200);
    expect(parseRupeeInput("1,299.90")).toBe(129990);
    expect(() => parseRupeeInput("")).toThrow();
    expect(() => parseRupeeInput("abc")).toThrow();
    expect(() => parseRupeeInput("-5")).toThrow();
    expect(tryParseRupee("junk")).toBeNull();
    expect(tryParseRupee("45.5")).toBe(4550);
  });
});