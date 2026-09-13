# Family Orders

Local-first, offline-capable order tracking for families. One person
orders groceries from Blinkit / Zepto / Instamart / BigBasket / Amazon,
imports the bill, and the parent's device simply receives the order —
without accounts, without a server to run, and without any paid service.

## What it does

```
USER (child)                          PARENT
  Upload screenshot / PDF               Open app
  App extracts order                    Today: Blinkit 2:14 PM ₹202
  App validates the bill                        Zepto   11:42 AM ₹386
  User reviews + confirms               Tap order → exact items + prices
  Order saved locally
  Encrypted sync  ───────────────►  (only pending, encrypted messages relayed)
```

- **Local-first:** everything is stored on the device in IndexedDB. It
  works fully offline. Nothing is ever auto-deleted beyond the retention
  window.
- **Money is integer paise.** No floating-point money anywhere.
- **No provider scraping.** No Blinkit/Zepto API. Bills are imported from
  screenshots, PDFs, or typed by hand, then reviewed and confirmed.
- **Private:** orders are AES-GCM encrypted before they leave the device.
  The relay only ever holds temporary encrypted blobs that expire and are
  deleted on receipt.
- **Zero cost:** the app is a static PWA (Vercel / any static host) and a
  single Cloudflare Worker on their free tier. No VPS, no database.

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

Other commands: `npm run build`, `npm run test`, `npm run typecheck`,
`npm run lint`, `npm run worker:dev`, `npm run compile` (see below).

### Verify a change

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## How orders flow

1. **Import** — screenshot or PDF (OCR via in-browser tesseract.js; PDF
   text via pdfjs). Or **manual entry**.
2. **Parse** — text becomes a candidate order (items, qty, prices,
   subtotal, fees, discounts, taxes, total).
3. **Validate** — `qty × unit price ≈ line total` and
   `items + fees + taxes − discounts = total` are checked independently.
   Conflicts are surfaced as warnings; nothing is auto-corrected.
4. **Review** — the user edits values and confirms explicitly.
5. **Persist** — the confirmed order is stored locally.
6. **Sync** — encrypted copies go into a queue, then to the relay for the
   parent's device. Idempotent message IDs + a dedup set mean a redelivered
   message can never create two orders.

## Pairing

Child generates a QR invite (pair → "Add parent device"). Parent scans,
confirms, and the two devices exchange public keys through the relay.
After that the parent just opens the app and sees orders.

## Who is this for

Non-technical parents get a feed of today's orders and a tap-through
detail screen. No accounts, no sync concepts, no settings to manage.

## Documentation

- `ARCHITECTURE.md` — system design and data flows
- `docs/development.md` — working locally
- `docs/parsing.md` — OCR / PDF parsing and bill validation
- `docs/sync.md` — pairing, relay protocol, sync engine
- `docs/security.md` — threat model and cryptography
- `docs/deployment.md` — deploying the PWA and the Worker
- `docs/testing.md` — test strategy

## Status

This is an active development repository. See `AGENTS.md` for the current
contracts and the checkpoints being worked through in `docs/development.md`.# order_split
