# AGENTS.md

Guidance for AI agents and humans working in this repository.

## Repository

Local-first, offline-capable **family order aggregation** PWA.
No permanent backend, no VPS, no maintained database. Phones are the
source of truth. A Cloudflare Worker acts only as a temporary encrypted
message relay.

## Commands

```sh
npm install                       # install dependencies
npm run dev                       # local dev server (http://localhost:5173)
npm run build                     # typecheck (tsc -b) + production build
npm run preview                   # preview the production build
npm run typecheck                 # TypeScript strict check (no emit)
npm run lint                      # ESLint
npm test                          # unit + integration tests (Vitest, jsdom + fake-indexeddb)
npm run test:e2e                  # Playwright end-to-end tests
npm run worker:dev                # run Cloudflare Worker relay locally (wrangler)
npm run worker:deploy             # deploy Worker relay
npm run worker:typecheck          # Worker relay typecheck (tsc -p worker)
npm run worker:test               # Worker relay tests (Vitest, node env)
npm run icons                     # regenerate PWA PNG icons
```

## Non-negotiables

- **Money is integer paise.** Never use floats for money anywhere in the
  codebase. `₹202.50` is `20250`. Conversions happen only at the UI
  boundary (`src/money/format.ts`).
- **Do not silently alter totals.** Validation may warn and the user may
  edit, but nothing is auto-corrected.
- **Do not silently discard user data.** Retention cleanup is explicit and
  requires no data beyond the retention window; failed syncs stay visible.
- **Never commit secrets.** Worker secrets and VAPID keys come from
  environment variables / wrangler secrets, never from code.
- **No plaintext order data on the relay.** Everything uploaded to the
  Worker is AES-GCM encrypted on-device before it leaves the device.

## Architecture rules

- The app is the source of truth; the relay is a dumb encrypted mailbox.
- No backend database. IndexedDB (via Dexie) is the only store.
- No large state-management library. Prefer small composable modules,
  React hooks, and declared types.
- OCR and PDF extraction are behind interfaces (`src/parse/extractors/`)
  so implementations can be swapped without touching the UI.
- No scraping of grocery platforms and no reliance on provider APIs.
  Bills are imported from screenshots / PDFs / manual entry only.

## Conventions

- TypeScript strict mode. `verbatimModuleSyntax` is on: use `import type`
  when importing types only.
- Avoid comments unless they explain intent that the code cannot express.
- Naming: files `kebab-case.ts`; React components `PascalCase.tsx`.
- Prefer pure functions in `src/domain` and `src/money`; keep them free of
  React and free of Dexie so they are trivially unit-testable.
- Tests live beside their domain in `src/**/*.test.ts` for pure logic, plus
  integration suites under `tests/integration/` and E2E under
  `tests/e2e/`. Run `npm test` before claiming anything works.

## How to verify work

Every change should at minimum pass:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

For worker changes additionally: `npm run worker:test`.

E2E (`npm run test:e2e`) requires Playwright browsers installed once via
`npx playwright install chromium`.

## Decision records (short form)

- **Storage:** Dexie/IndexedDB. Tables: `orders`, `orderItems`, `drafts`,
  `receivedOrders`, `devices`, `family`, `syncQueue`, `settings`,
  `messages`. See `src/db/database.ts`.
- **Crypto:** WebCrypto only. ECDH P-256 for pairing/shared secrets,
  HKDF-SHA256 for key derivation, AES-GCM for message encryption.
- **Relay:** Cloudflare Worker + KV, keys namespaced by device, TTL on all
  temporary messages. Pairing uses a single-use pairing code.
- **Router:** react-router v6. **PWA:** vite-plugin-pwa (workbox).
- **OCR:** tesseract.js (in-browser, free, WASM). Lazy-loaded only when a
  screenshot import happens. PDF text extraction via pdfjs-dist first;
  OCR only when a PDF has no usable text layer.