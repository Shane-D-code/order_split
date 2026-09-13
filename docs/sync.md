# Sync

Orders are encrypted on-device and relayed through a **dumb mailbox**: a
Cloudflare Worker + KV that stores only routing ids and ciphertext, never
plaintext order data. There is no central database; each phone is authoritative
for its own orders and receives a copy of every paired peer's orders.

## Architecture rules

- App is source of truth; relay is a temporary encrypted relay, nothing else.
- The relay never sees order totals, item names, or owner names.
- All writes are idempotent: dedup at ingest (message-level and orderId-level),
  plus ACK-only redelivery semantics.

## Pairing

1. **Advertiser** (new device) shows a QR invite:
   `familyorder://pair?v=1&code=...&pub=...&seed=...` assembled by
   `buildPairInvite` (`src/pairing/pairing.ts`).
2. **Parent** scans it, derives a pairing key with the `seed`
   (`derivePairingKey`, HKDF from seed), and calls
   `/pair/complete` with an AES-GCM encrypted `ack` containing the parent's
   public key.
3. The **relay** drops the ack into the advertiser's mailbox (single-use
   pairing code, TTL 10 min).
4. The advertiser finalizes with `finalizePairing`: decrypts the ack using the
   same seed, then derives a persistent per-recipient channel key from its own
   private key + the parent's public key (ECDH P-256 → HKDF → AES-GCM).

Channel keys are derived exactly once per device pair and stored locally; both
sides arrive at the same key without ever sending a private key.

## Message flow (src/sync/engine.ts)

- `enqueueOrderForSync(order)` writes an outbox `syncQueue` row (direction
  `out`), keyed to dedupe by `orderId`.
- `flushOutbox()` POSTs each row to the chosen recipient's mailbox, then marks
  `sent`.
- `pump()` runs flush + inbox poll on an interval driven by
  `src/sync/sync-store.ts` (which also drives the `SyncContext` status banner).
- `handleInboxMessage` decrypts the incoming `OrderEnvelope`, checks the
  `orderId:messageId` dedup table and the `order:orderId` marker, inserts via
  `tryInsertReceivedOrder` into `receivedOrders`, then ACKs the relay message
  so it is garbage-collected.
- Pairing ACKs (`pairing-ack`) are handled by `handlePairingAck` using the
  pending pairing seed saved during accept.

Backoff: a failing outbox row retries up to 8 times with exponential backoff
(starting 5 s), then stays `failed` and surfaces in the SyncBanner; failed syncs
are never silently dropped.

## Relay contract (also the basis of `worker/tests/relay.test.ts`)

| Endpoint | Method | Body | Notes |
| --- | --- | --- | --- |
| `/pair/initiate` | POST | `{ deviceId, displayName }` | returns `{ pairingCode }`, TTL 10 min |
| `/pair/complete` | POST | `{ pairingCode, fromDeviceId, ack }` | delivers encrypted ack to owner mailbox, single use |
| `/messages` | POST | `{ messageId, recipientDeviceId, type, senderDeviceId, payload }` | `type` is `order`; TTL 7 days |
| `/messages` | GET | — | returns `{ messages: [...] }` for this device |
| `/messages/:id/ack` | POST | — | deletes the message |

All requests must carry `X-Device-Token` (the device secret). The relay
self-registers a device on first contact; `senderDeviceId` must match the
authenticated device. Per-device rate cap returns 429. `RelayError` kinds on
the client: `network | auth | http | expired`.

## Testing

- `tests/integration/sync-engine.test.ts` runs a two-device harness against an
  in-memory fake relay (real WebCrypto). It covers flush→poll→ack, dedup on
  redelivery, and quiet-when-no-peers.
- `worker/tests/relay.test.ts` runs the relay against an injectable KV fake
  (pairing, mailbox, rate limit, spoof rejection, no-plaintext invariant).