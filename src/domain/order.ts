import {
  computeItemsTotal,
  computeLineTotal,
  computeTotal,
  sum,
} from "../money/money";
import { newId } from "./id";
import type {
  Order,
  OrderItem,
  OrderSource,
  Platform,
} from "./types";

/**
 * Pure operations over Order/OrderItem aggregates. No I/O, no React.
 */

export function createOrderItem(input: {
  name: string;
  quantity: number;
  unitPrice: number;
}): OrderItem {
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;
  const unitPrice = Math.max(0, Math.round(input.unitPrice));
  return {
    id: newId(),
    name: input.name.trim(),
    quantity,
    unitPrice,
    lineTotal: computeLineTotal(unitPrice, quantity),
  };
}

export interface OrderTotals {
  itemsTotal: number;
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  packagingFee: number;
  tax: number;
  discount: number;
  total: number;
}

/**
 * Recompute all monetary components from a list of items and the fee
 * inputs. The fee inputs are user/parser supplied; itemsTotal and total
 * are derived deterministically.
 */
export function computeOrderTotals(parts: {
  items: Pick<OrderItem, "quantity" | "unitPrice">[];
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  packagingFee: number;
  tax: number;
  discount: number;
}): OrderTotals {
  const itemTotals = parts.items.map((i) =>
    computeLineTotal(Math.max(0, Math.round(i.unitPrice)), i.quantity),
  );
  const itemsTotal = computeItemsTotal(itemTotals);
  const discount = Math.max(0, Math.round(parts.discount));
  const total = computeTotal({
    itemsTotal,
    deliveryFee: Math.max(0, Math.round(parts.deliveryFee)),
    handlingFee: Math.max(0, Math.round(parts.handlingFee)),
    packagingFee: Math.max(0, Math.round(parts.packagingFee)),
    tax: Math.max(0, Math.round(parts.tax)),
    discount,
  });
  return {
    itemsTotal,
    subtotal: Math.max(0, Math.round(parts.subtotal)),
    deliveryFee: Math.max(0, Math.round(parts.deliveryFee)),
    handlingFee: Math.max(0, Math.round(parts.handlingFee)),
    packagingFee: Math.max(0, Math.round(parts.packagingFee)),
    tax: Math.max(0, Math.round(parts.tax)),
    discount,
    total,
  };
}

export function buildOrder(input: {
  id?: string;
  platform: Platform;
  orderedAt: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  packagingFee: number;
  tax: number;
  discount: number;
  sourceType: OrderSource;
  sourceName?: string;
  createdAt?: string;
}): Order {
  const now = input.createdAt ?? new Date().toISOString();
  const totals = computeOrderTotals(input);
  return {
    id: input.id ?? newId(),
    platform: input.platform,
    orderedAt: input.orderedAt,
    items: input.items,
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    handlingFee: totals.handlingFee,
    packagingFee: totals.packagingFee,
    tax: totals.tax,
    discount: totals.discount,
    total: totals.total,
    currency: "INR",
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    createdAt: now,
    updatedAt: now,
  };
}

export function itemCount(items: OrderItem[]): number {
  return items.reduce((acc, i) => acc + i.quantity, 0);
}

export function itemsSubtotal(items: OrderItem[]): number {
  return sum(items.map((i) => i.lineTotal));
}

type DraftLine = {
  id?: string;
  name: string;
  quantity: number;
  /** A null unit price is derived from the line total at confirmation. */
  unitPrice: number | null;
  lineTotal: number;
};

/**
 * Convert a reviewed draft into a confirmed Order.
 *
 * Totals are preserved exactly as the user confirmed — this never
 * recomputes or silently alters subtotal/total/fees. The only derivation
 * is a line item with a missing unit price, which is rounded from its
 * line total (quantity is always known).
 */
export function orderFromDraft(input: {
  id?: string;
  platform: Platform;
  orderedAt: string;
  items: DraftLine[];
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  packagingFee: number;
  tax: number;
  discount: number;
  total: number;
  sourceType: OrderSource;
  sourceName?: string;
  createdAt?: string;
}): Order {
  const now = input.createdAt ?? new Date().toISOString();
  const items: OrderItem[] = input.items.map((i) => {
    const quantity =
      Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1;
    const unitPrice =
      i.unitPrice === null ? Math.round(i.lineTotal / quantity) : Math.max(0, Math.round(i.unitPrice));
    return {
      id: i.id ?? newId(),
      name: i.name.trim(),
      quantity,
      unitPrice,
      lineTotal:
        i.unitPrice === null ? unitPrice * quantity : Math.max(0, Math.round(i.lineTotal)),
    };
  });
  return {
    id: input.id ?? newId(),
    platform: input.platform,
    orderedAt: input.orderedAt,
    items,
    subtotal: Math.max(0, Math.round(input.subtotal)),
    deliveryFee: Math.max(0, Math.round(input.deliveryFee)),
    handlingFee: Math.max(0, Math.round(input.handlingFee)),
    packagingFee: Math.max(0, Math.round(input.packagingFee)),
    tax: Math.max(0, Math.round(input.tax)),
    discount: Math.max(0, Math.round(input.discount)),
    total: Math.max(0, Math.round(input.total)),
    currency: "INR",
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    createdAt: now,
    updatedAt: now,
  };
}