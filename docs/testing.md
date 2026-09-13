# Testing

Status on the CI-style command set:

```sh
npm run typecheck      # app TS strict
npm run worker:typecheck
npm run lint
npm test               # app unit + integration (Vitest, jsdom + fake-indexeddb)
npm run worker:test    # relay tests (Vitest, node env, injectable KV)
npm run build
```

## App tests (`npm test`)

Run with Vitest. Everything is jsdom + `fake-indexeddb` so Dexie works. Pure
logic tests live under `tests/unit/`; Dexie-backed flows under
`tests/integration/`.

- `tests/unit/money.test.ts` — integer-paise invariants, format boundary.
- `tests/unit/order-domain.test.ts` — order model, `orderFromDraft` totals
  preservation, derived `unitPrice`.
- `tests/unit/order-parser.test.ts` — line parsing (₹/Rs/x2/2x styles).
- `tests/unit/validate-import.test.ts` — warning/error severities, overrides.
- `tests/unit/pairing.test.ts` — QR invite roundtrip, junk rejection, ACK
  encrypt/decrypt with the pairing seed, wrong-seed rejection.
- `tests/integration/import-pipeline.test.ts` — file → extract → parse →
  validate → draft.
- `tests/integration/db-orders.test.ts` — repo CRUD + day listing.
- `tests/integration/received-dedup.test.ts` — message-level + order-level
  dedup.
- `tests/integration/sync-engine.test.ts` — two-device harness (real WebCrypto,
  in-memory fake relay): flush→poll→ack, redelivery dedup, quiet with no peers.

## Relay tests (`npm run worker:test`)

Node environment. `worker/tests/relay.test.ts` drives `handleApi` with an
in-memory `KVStore` so no Cloudflare runtime is needed:

- code generation (unambiguous alphabet, uniqueness),
- pairing lifecycle (initiate → deliver ACK → single-use → 410),
- mailbox (send/list/ack per device, isolation between devices),
- spoofed `senderDeviceId` → 403,
- rate limit → 429,
- **ciphertext-only invariant** (payload has `{ciphertext,iv,salt}` and never
  plaintext figures).

## E2E (`npm run test:e2e`)

Playwright specs live in `tests/e2e/`. Once per machine:

```sh
npx playwright install chromium
```

They boot the Vite dev server (or preview build) and exercise onboarding,
manual order entry, review confirm, and the pair flow UI.

## Golden rules

1. **Money is integer paise.** Any float in money logic is a failing test.
2. **No silent totals.** Sum mismatches warn; nothing auto-corrects.
3. **No silent data loss.** A failed sync stays visible; retention is explicit.
4. Crypto tests must keep the **jsdom** environment (WebCrypto is node-only;
   `atob`/`btoa` are jsdom-only). Worker tests are the exception — node env.
5. Multi-device simulation shares one IndexedDB; clear the sender's local
   `orders`/`orderItems` between phases to avoid item-id collisions.