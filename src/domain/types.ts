export type Platform =
  | "blinkit"
  | "zepto"
  | "instamart"
  | "bigbasket"
  | "amazon"
  | "other";

export type OrderSource = "screenshot" | "pdf" | "manual";

export type Currency = "INR";

export const PLATFORMS: Platform[] = [
  "blinkit",
  "zepto",
  "instamart",
  "bigbasket",
  "amazon",
  "other",
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  blinkit: "Blinkit",
  zepto: "Zepto",
  instamart: "Instamart",
  bigbasket: "BigBasket",
  amazon: "Amazon",
  other: "Other",
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && PLATFORMS.includes(value as Platform);
}

export interface OrderItem {
  id: string;
  name: string;
  /** Always an integer >= 1. */
  quantity: number;
  /** Integer paise. */
  unitPrice: number;
  /** Integer paise. */
  lineTotal: number;
}

/**
 * A draft line item where the unit price may still be unknown (the parser
 * could not determine it, user must review). Unlike confirmed OrderItems,
 * `unitPrice` may be null until the user fills it in.
 */
export interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  /**
   * True once the user has touched this item (edited a field, or removed
   * it). Used to distinguish extracted/original values from user edits so
   * the reviewed order is never mistaken for the untouched invoice.
   */
  edited?: boolean;
}

export interface Order {
  id: string;
  platform: Platform;
  /** ISO 8601 timestamp. */
  orderedAt: string;
  items: OrderItem[];
  /** Integer paise. */
  subtotal: number;
  /** Integer paise. */
  deliveryFee: number;
  /** Integer paise. */
  handlingFee: number;
  /** Integer paise. */
  packagingFee: number;
  /** Integer paise. */
  tax: number;
  /** Integer paise. Positive number; subtracted from the total. */
  discount: number;
  /** Integer paise. */
  total: number;
  currency: Currency;
  sourceType: OrderSource;
  sourceName?: string;
  createdAt: string;
  updatedAt: string;
}

/** An order received from a peer device through the relay. */
export interface ReceivedOrder extends Order {
  receivedAt: string;
  fromDeviceId: string;
  /** dedupKey = `${senderOrderId}:${messageId}` — prevents redelivery duplicates. */
  dedupKey: string;
  syncMessageId: string;
}

export type SyncStatus =
  | "pending"
  | "in-flight"
  | "synced"
  | "acknowledged"
  | "failed";

export interface SyncMessage {
  id: string;
  direction: "outbox" | "inbox";
  type: "order" | "pairing-ack";
  status: SyncStatus;
  recipientDeviceId?: string;
  senderDeviceId?: string;
  payload: EncryptedPayload;
  orderId?: string;
  dedupKey?: string;
  attempts: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface FamilyMember {
  deviceId: string;
  role: "parent" | "child" | "peer";
  displayName: string;
  publicKeyJwk: JsonWebKey;
  pairingStatus: "connected";
  createdAt: string;
  pairedAt?: string;
}

export interface DeviceIdentity {
  deviceId: string;
  secret: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  displayName: string;
  createdAt: string;
}

export interface SyncRun {
  sent: number;
  received: number;
  acked: number;
  failed: number;
}