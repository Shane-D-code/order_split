import type { DraftItem, OrderSource, Platform } from "../../domain/types";
import type { Paise } from "../../money/money";
import type { ValidationWarning } from "../../parse/types";

/**
 * Shape used to create a new in-flight draft (usually produced by the
 * parse/review pipeline).
 */
export interface DraftInput {
  sourceType: OrderSource;
  sourceName?: string;
  rawText?: string;
  image?: Blob;
  platform: Platform;
  orderedAt: string;
  items: DraftItem[];
  subtotal: Paise;
  deliveryFee: Paise;
  handlingFee: Paise;
  packagingFee: Paise;
  tax: Paise;
  discount: Paise;
  total: Paise;
  warnings: ValidationWarning[];
  sourceDraftId?: string;
  createdAt?: string;
}