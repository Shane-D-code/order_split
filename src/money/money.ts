/**
 * Money is integer paise. Nothing in this module uses floating point to
 * represent amounts; floats only ever appear as intermediate OCR numbers
 * that are immediately rounded to integer paise.
 */

export type Paise = number;

/** ₹202.50 => 20250 */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error("rupeesToPaise: non-finite input");
  }
  return Math.round(rupees * 100);
}

export function add(a: Paise, b: Paise): Paise {
  return a + b;
}

export function subtract(a: Paise, b: Paise): Paise {
  return a - b;
}

export function negate(a: Paise): Paise {
  return -a;
}

export function sum(values: Paise[]): Paise {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Multiply an amount by a quantity (which may be decimal, e.g. 0.5 kg). */
export function multiplyBy(a: Paise, qty: number): Paise {
  if (!Number.isFinite(qty) || qty < 0) {
    throw new Error("multiplyBy: quantity must be a non-negative number");
  }
  return Math.round(a * qty);
}

/** Line total of a single item. */
export function computeLineTotal(unitPrice: Paise, quantity: number): Paise {
  return multiplyBy(unitPrice, quantity);
}

/**
 * Items total: sum of line totals before fees, taxes and discounts.
 */
export function computeItemsTotal(lineTotals: Paise[]): Paise {
  return sum(lineTotals);
}

/**
 * Final total from components. `discount` is subtracted, everything else
 * added.
 */
export function computeTotal(parts: {
  itemsTotal: Paise;
  deliveryFee: Paise;
  handlingFee: Paise;
  packagingFee: Paise;
  tax: Paise;
  discount: Paise;
}): Paise {
  return (
    parts.itemsTotal +
    parts.deliveryFee +
    parts.handlingFee +
    parts.packagingFee +
    parts.tax -
    parts.discount
  );
}

export function isZero(a: Paise): boolean {
  return a === 0;
}

/** Difference between two amounts ignoring sign. */
export function absoluteDifference(a: Paise, b: Paise): Paise {
  return Math.abs(a - b);
}