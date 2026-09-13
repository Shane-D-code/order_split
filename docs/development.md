# Development

Local-first, offline-capable **family order aggregation** PWA. No maintained
backend, no VPS. Phones are the source of truth; a Cloudflare Worker acts only
as a temporary encrypted message relay.

## Stack

| Concern | Choice |
| --- | --- |
| App framework | React 18 + TypeScript (strict) + Vite 6 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Local store | IndexedDB via Dexie 4 (the only store) |
| Routing | react-router v6 |
| PWA | vite-plugin-pwa (workbox `generateSW`) |
| OCR | tesseract.js 5, lazy-loaded (WASM, in-browser) |
| PDF text | pdfjs-dist 4 |
| QR | `qrcode` (render) + jsQR (scan path, `src/pairing/scanner.ts`) |
| Crypto | WebCrypto only (ECDH P-256, HKDF-SHA256, AES-GCM) |
| Tests | Vitest (unit + integration), Playwright (E2E) |
| Relay | Cloudflare Worker + KV (`worker/`) |

## Commands

```sh
npm install               # install dependencies
npm run dev               # local dev server (http://localhost:5173)
npm run build             # typecheck + production build
npm run preview           # preview the production build
npm run typecheck         # app TypeScript strict check
npm run lint              # ESLint for app + worker
npm test                  # app unit + integration tests
npm run test:e2e          # Playwright E2E (needs `npx playwright install chromium`)
npm run worker:dev        # run the relay locally (wrangler)
npm run worker:deploy     # deploy the relay
npm run worker:typecheck  # relay TypeScript strict check
npm run worker:test       # relay tests
npm run icons             # regenerate PWA PNG icons from public/app-icon.svg
```

## Layout

```
src/
  app/          App.tsx, routes, providers, onboarding gate
  components/   UI kit (Button, Card, Field, Screen), layout (AppShell), order views
  crypto/       WebCrypto primitives (keys, derive, seal/open)
  db/           Dexie schema + typed repositories
  domain/       pure order/family models, validation, drafts
  lib/          small pure helpers (dates, base64, etc.)
  money/        integer-paise money helpers + formatting
  pairing/      invite/ACK/finalize protocol (QR payloads)
  parse/        extractors (OCR/PDF), order parser, validation
  pages/        Today/History/Detail/New/Manual/Import/Review/Settings/Pair
  sync/         relay client, sync engine, sync store
  settings/     persistence of settings (Dexie `settings` table)
worker/
  src/          relay (Cloudflare Worker + KV), tested with an injectable store
  tests/        relay tests (vitest, node env)
  wrangler.toml
docs/
tests/
  unit/         pure-logic tests next to nothing in src (grouped here)
  integration/  Dexie-backed flows (import pipeline, dedup, sync engine)
  e2e/          Playwright specs
```

## Conventions

- TypeScript strict mode; `verbatimModuleSyntax` is on — `import type` for types.
- Money is **integer paise**. `₹202.50` → `20250`. Conversions only at the UI
  boundary in `src/money/format.ts`.
- Never silently alter totals; validation warns, the user edits. Nothing is
  auto-corrected.
- Naming: files `kebab-case.ts`; components `PascalCase.tsx`. Prefer pure
  functions in `src/domain`, `src/money`, `src/lib` (no React, no Dexie).
- No comments unless they express intent the code cannot.
- No scraping of grocery platforms; imports are screenshots / PDFs / manual.
- Never commit secrets. Relay auth and VAPID keys come from env / wrangler
  secrets.

## Money example

```ts
const total = itemTotal + deliveryFee + codFee;      // paise, integers
unitPrice = Math.round(lineTotal / quantity);         // derived only, never stored
formatINR(total) // "₹202.00" — display only
```

See `src/money/` for helpers and `tests/unit/money.test.ts` for the invariants.

## Pitfalls

- jsdom supplies `atob`/`btoa` and fake-indexeddb; **WebCrypto only exists on
  the Node side**. Crypto tests (`pairing`, `sync-engine`, `crypto`) must run
  in the jsdom environment and must NOT use `@vitest-environment node`.
- Test harnesses that simulate two devices share one fake-indexeddb database:
  clear the sender's local `orders`/`orderItems` between phases, or item ids
  collide and inserts fail with `ConstraintError`.
- The relay is reachable at different base URL per environment — it lives in
  the `settings` table, defaulting to the deployed worker only after configure.