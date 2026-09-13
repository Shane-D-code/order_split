# ARCHITECTURE.md

This document describes the implemented architecture of **Family Orders**.
It is intentionally small: a local-first PWA on a phone with a dumb,
temporary, encrypted relay. There is no backend database, no VPS, and no
always-running process in production.

## System overview

```
                 INTERNET
                 ┌──────────────────────┐
                 │ Static web hosting    │  Vercel / Cloudflare Pages / any
                 │ (React PWA)           │  static host — free tier
                 └──────────┬───────────┘
                            │
                   React PWA (same app)
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
 ┌─────────────────┐                    ┌─────────────────┐
 │  USER DEVICE    │                    │  PARENT DEVICE  │
 │  React PWA      │                    │  React PWA      │
 │  IndexedDB      │                    │  IndexedDB      │
 │  OCR + parser   │                    │  Today feed     │
 │  review + sync  │                    │  history + ACK  │
 └───────┬─────────┘                    └────────▲────────┘
         │      encrypted, single-use,            │
         └──────── temp messages  ───────────────┘
                        │
                 ┌──────┴──────────┐
                 │ Cloudflare      │  temporary encrypted mailbox only.
                 │ Worker + KV     │  routes by recipient device id.
                 └─────────────────┘
```

### Principles

- **Phones are the source of truth.** The Worker only relocates
  encrypted bytes between devices. It never stores a decoded order, a
  bill image, or any document.
- **Lower-cost than a backend by construction.** No database service, no
  VM. The free tiers of a static host and Cloudflare Workers cover normal
  personal use.
- **Offline first.** Local writes never wait on the network. A change
  always lands in IndexedDB before it is queued for sync.

## Source of truth and stores

IndexedDB (via Dexie) is the only store. Tables (`src/db/database.ts`):

| Table            | Contents                                                        |
| ---------------- | --------------------------------------------------------------- |
| `orders`         | My confirmed orders (created on this device).                    |
| `orderItems`     | Line items for `orders`.                                         |
| `receivedOrders` | Orders received from a parent/child peer device.                 |
| `drafts`         | In-flight imports (parse results not yet confirmed).             |
| `devices`        | This device's identity keys.                                     |
| `family`         | Paired peer devices (public keys, roles, display names).         |
| `syncQueue`      | Encrypted messages waiting to be uploaded to the relay.          |
| `messages`       | Encrypted messages downloaded from the relay, awaiting decrypt.  |
| `settings`       | App settings (retention window, display name, relay URL).        |

There is deliberately **no order data on the server**. The Worker sees
only: recipient device id, encrypted payload, timestamps, and message id.

## Money

Money is **integer paise** everywhere except the UI boundary.

- `src/money/money.ts` — paise-safe arithmetic (add, subtract, multiply
  by quantity, compare, parse from strings like `202.50` or `₹202`).
- `src/money/format.ts` — the only place rupees/paise are formatted for
  rendering and where user input strings become paise.
- Totals are always recomputed from components with integer math; UI
  never renders a float.

## Order ingestion pipeline

```
INPUT                                       (screenshot | pdf | manual)
  → image/PDF preprocessing
  → text extraction / OCR            (src/parse/extractors/)
  → raw extraction                   (ExtractedDocument)
  → order parser                     (src/parse/order-parser.ts)
  → structured candidate order       (ParsedOrder)
  → validation                       (src/parse/validate-import.ts)
  → review screen                    (src/pages/ReviewOrderPage.tsx)
  → explicit user confirmation
  → persist to IndexedDB
  → encrypted sync queue
```

- OCR is `tesseract.js` (WebAssembly, no server, no API key). It is
  lazy-imported only when a screenshot is imported.
- PDFs use `pdfjs-dist` text extraction first; images and scanned PDFs
  fall back to OCR. Both live behind `TextExtractor` / `ImageExtractor`
  interfaces so implementations are swappable.
- The parser is pure text → structured data with no I/O, so bill formats
  (Blinkit, Zepto, Instamart, generic) are covered by deterministic unit
  tests using fixture text.

### Validation engine

`validate-import.ts` computes items-total from `qty × unitPrice`, compares
against `subtotal + fees + taxes − discounts` and the bill total, and
emits **warnings never silent fixes**. A warning blocks confirmation until
the user edits the conflicting value or explicitly overrides it.

## Sync

### Pairing

1. Child taps *Add parent device* → the app creates a pairing-code
   session on the relay (`POST /pair/initiate`) and renders a QR
   containing the code, the child's device id, the child's ECDH public
   key, and relay coordinates.
2. Parent scans the QR → the parent creates its own identity and posts an
   encrypted pairing acknowledgement to the child's mailbox
   (`POST /pair/complete`), encrypted to the child's public key.
3. Child polls, decrypts the ACK, and stores the parent as a family
   member. Both sides now derive the same AES-GCM key via ECDH.

### Message flow

```
Local DB ─► syncQueue (pending)
                 │  POST /messages  {recipientId, encryptedPayload}
                 ▼
        Worker KV: key message:{id}  TTL 7 days
                 │
Parent polls GET /messages ─► decrypt ─► validate dedup ─► receivedOrders
                 │                                        
                 └─► POST /messages/:id/ack ─► Worker deletes key
```

- **Idempotent:** the sync engine generates a stable `messageId`; the
  Worker treats re-POST of the same id as a no-op.
- **Duplicate-proof:** the parent keeps a dedup set of
  `orderId:messageId`; a redelivered message is dropped without creating
  an order.
- **Retries** use exponential backoff with jitter; a message stays
  visible as *pending* or *failed* in the UI until ACKed.
- **Offline:** creation always succeeds locally; sync is opportunistic.

## Worker relay API

`worker/src/index.ts`. BASE = relay URL. All order-bearing requests are
authenticated with `X-Device-Token` (the device's secret) and are
scoped to the authenticated device.

| Method | Path                | Purpose                                        |
| ------ | ------------------- | ---------------------------------------------- |
| POST   | `/pair/initiate`    | Create single-use pairing code for this device |
| POST   | `/pair/complete`    | Deliver an encrypted pairing ACK to a code     |
| POST   | `/messages`         | Store one encrypted message for a recipient    |
| GET    | `/messages`         | List pending messages for the calling device   |
| POST   | `/messages/:id/ack` | Mark a delivered message handled and delete it |

All stored records have a TTL (pairing codes: single-use/short; messages:
7 days). KV namespaces order records; there is no relational data, no
user account system, no analytics.

## PWA

- `vite-plugin-pwa` (Workbox) generates the service worker, precaches the
  app shell, and enables offline startup.
- Manifest + standalone display; icons generated by `npm run icons`
  (`scripts/generate-icons.mjs`, pure Node, no native deps).
- Tesseract language data is cached after first OCR use so repeat imports
  work offline.
- Storage is IndexedDB; original bill images are kept only in the drafts
  table for the current import and never uploaded.

## Security model

Threat model, key derivation, and payload formats are documented in
`docs/security.md`. Summary:

- Device identity = random secret; `deviceId = SHA-256(secret)`; the
  secret never leaves the device except when it authenticates a request
  over HTTPS in an `X-Device-Token` header.
- Order payload AES-256-GCM with a key derived per recipient pair via
  ECDH (P-256) + HKDF-SHA256. A parent can only decrypt what a child
  encrypted specifically for it.
- The relay sees ciphertext only.

## Frontend structure

```
src/
  money/      pure money types + arithmetic + formatting
  domain/     Order / OrderItem / Device / Family types
  db/         Dexie schema + typed repositories
  parse/      extraction interfaces, OCR/PDF, parser, validator
  crypto/     WebCrypto helpers (identity, ECDH, AES-GCM, HKDF)
  sync/       relay client, sync engine, dedup
  pairing/    QR encode/decode, invite protocol
  pages/      Today, OrderDetail, NewOrder, Import, Review, History,
              Settings, Pair, Received
  components/ shared UI
  app/        router, shell, providers
```

Pages use small hooks and composable modules; there is no global state
store (the DB is the store, React Query-free, effect-light).

## Cost and deployment

- **Frontend:** static export → Vercel (or equivalent). No runtime server.
- **Worker:** `npm run worker:deploy` pushes the relay to Cloudflare's
  free tier with a KV namespace and a `RELAY_TOKEN` secret.
- Normal personal use stays within free tiers. Third-party free tiers are
  not guaranteed forever — the app is designed to degrade gracefully
  (offline, retry, visible pending state) without them.

See `docs/deployment.md` for exact steps.