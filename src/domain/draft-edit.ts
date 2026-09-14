import type { DraftItem } from "./types";
import {
  computeTotal,
  multiplyBy,
  sum,
} from "../money/money";

/**
 * Pure user-edit operations over a draft's item state.
 *
 * Removing an item is a deliberate USER EDIT. The original extraction is
 * never overwritten: removed items move to `removedItems` (marked
 * `edited`) so the review can undo, and the extracted snapshot stays in
 * the draft's `originalItems`.
 */

export interface EditItemState {
  items: DraftItem[];
  removedItems: DraftItem[];
}

function cloneItems(items: DraftItem[]): DraftItem[] {
  return items.map((i) => ({ ...i }));
}

function cloneSafe(items: DraftItem[]): DraftItem[] {
  return items.map((i) => ({ ...i }));
}

/** Move an item from the active list to the removed list. */
export function removeItem(
  state: EditItemState,
  itemId: string,
): EditItemState {
  const target = state.items.find((i) => i.id === itemId);
  if (!target) return state;
  return {
    items: cloneItems(state.items).filter((i) => i.id !== itemId),
    removedItems: cloneSafe(state.removedItems).concat([
      { ...target, edited: true },
    ]),
  };
}

/** Restore a removed item back into the active list. */
export function undoRemove(
  state: EditItemState,
  itemId: string,
): EditItemState {
  const target = state.removedItems.find((i) => i.id === itemId);
  if (!target) return state;
  return {
    items: cloneItems(state.items).concat([{ ...target, edited: false }]),
    removedItems: cloneSafe(state.removedItems).filter((i) => i.id !== itemId),
  };
}

/** Sum of the current (active) line items. */
export function itemsSubtotalOf(items: DraftItem[]): number {
  return sum(items.map((i) => i.lineTotal));
}

export interface RecomputeInput {
  items: DraftItem[];
  deliveryFee: number;
  handlingFee: number;
  packagingFee: number;
  tax: number;
  discount: number;
  unclassifiedFees: number;
}

/**
 * Recalculate subtotal & final total after a user edit, following the
 * app's accounting rules: total = items + fees + tax - discount.
 * Unclassified fees are carried through so the total keeps reconciling.
 */
export function recomputeAfterEdit(input: RecomputeInput): {
  subtotal: number;
  total: number;
} {
  const subtotal = itemsSubtotalOf(input.items);
  const total =
    computeTotal({
      itemsTotal: subtotal,
      deliveryFee: Math.max(0, Math.round(input.deliveryFee)),
      handlingFee: Math.max(0, Math.round(input.handlingFee)),
      packagingFee: Math.max(0, Math.round(input.packagingFee)),
      tax: Math.max(0, Math.round(input.tax)),
      discount: Math.max(0, Math.round(input.discount)),
    }) + Math.max(0, Math.round(input.unclassifiedFees));
  return { subtotal, total };
}

/**
 * Compute a line total from quantity × unit price. Quantity may be
 * decimal (0.5 kg etc.); the result is always integer paise.
 */
export function lineTotalFor(quantity: number, unitPrice: number): number {
  return Math.round(multiplyBy(unitPrice, quantity));
}