import Dexie, { type EntityTable } from "dexie";
import type { DraftItem, Platform, OrderSource } from "../domain/types";
import type { Paise } from "../money/money";
import type { UnclassifiedFee, ValidationWarning } from "../parse/types";

/**
 * Storage rows. Rows are the physical shapes stored in IndexedDB; domain
 * aggregates (Order, ReceivedOrder) are composed by repositories.
 */

export interface OrderRow {
  id: string;
  platform: Platform;
  orderedAt: string;
  subtotal: Paise;
  deliveryFee: Paise;
  handlingFee: Paise;
  packagingFee: Paise;
  tax: Paise;
  discount: Paise;
  total: Paise;
  currency: "INR";
  sourceType: OrderSource;
  sourceName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemRow {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  unitPrice: Paise;
  lineTotal: Paise;
}

export interface ReceivedOrderRow extends OrderRow {
  receivedAt: string;
  fromDeviceId: string;
  dedupKey: string;
  syncMessageId: string;
}

export interface DraftRow {
  id: string;
  sourceType: OrderSource;
  sourceName?: string;
  rawText?: string;
  /** Original bill image kept only for the current in-flight import. */
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
  currency: "INR";
  /** Fees the parser could not classify, preserved for the review step. */
  unclassifiedFees?: UnclassifiedFee[];
  /**
   * Snapshot of the items as extracted, before any user edit. Kept so the
   * reviewed order is never mistaken for the untouched invoice and so a
   * removal can be undone. Items removed by the user live in `removedItems`.
   */
  originalItems?: DraftItem[];
  removedItems?: DraftItem[];
  /** Original (extracted) subtotal/total for comparison after edits. */
  originalSubtotal?: Paise;
  originalTotal?: Paise;
  /** Validation warnings computed from the draft contents. */
  warnings: ValidationWarning[];
  status: "editing";
  sourceDraftId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMessageRow {
  id: string;
  direction: "outbox" | "inbox";
  type: "order" | "pairing-ack";
  status: "pending" | "in-flight" | "synced" | "acknowledged" | "failed";
  recipientDeviceId?: string;
  senderDeviceId?: string;
  /** Encoded EncryptedPayload, kept JSON-serializable for IndexedDB. */
  payload: {
    ciphertext: string;
    iv: string;
    salt: string;
  };
  orderId?: string;
  dedupKey?: string;
  attempts: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRow {
  id: string;
  deviceId: string;
  secret: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  displayName: string;
  createdAt: string;
}

export interface FamilyMemberRow {
  deviceId: string;
  role: "parent" | "child" | "peer";
  displayName: string;
  publicKeyJwk: JsonWebKey;
  pairingStatus: "connected";
  createdAt: string;
  pairedAt?: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export const db = new Dexie("family-order") as Dexie & {
  orders: EntityTable<OrderRow, "id">;
  orderItems: EntityTable<OrderItemRow, "id">;
  receivedOrders: EntityTable<ReceivedOrderRow, "id">;
  drafts: EntityTable<DraftRow, "id">;
  devices: EntityTable<DeviceRow, "id">;
  family: EntityTable<FamilyMemberRow, "deviceId">;
  syncQueue: EntityTable<SyncMessageRow, "id">;
  settings: EntityTable<SettingRow, "key">;
  dedup: EntityTable<{ key: string; createdAt: string }, "key">;
};

db.version(1).stores({
  orders: "id, orderedAt, updatedAt, createdAt",
  orderItems: "id, orderId",
  receivedOrders: "id, orderedAt, receivedAt, fromDeviceId, dedupKey",
  drafts: "id, updatedAt",
  devices: "id",
  family: "deviceId",
  syncQueue: "id, status, nextRetryAt, direction",
  settings: "key",
  dedup: "key",
});

db.version(2).stores({
  orders: "id, orderedAt, updatedAt, createdAt",
  orderItems: "id, orderId",
  receivedOrders: "id, orderedAt, receivedAt, fromDeviceId, dedupKey",
  drafts: "id, updatedAt",
  devices: "id",
  family: "deviceId",
  syncQueue: "id, status, nextRetryAt, direction, orderId",
  settings: "key",
  dedup: "key",
});

