# Deployment

The app is a static PWA (any static host can serve `dist/`) paired with a
tiny Cloudflare Worker relay. Nothing else is required.

## 1. Build the app

```sh
npm install
npm run build          # typecheck + vite build → dist/
```

PWA artifacts (`sw.js`, workbox) are generated automatically. The service
worker + manifest enable offline use; install it from a browser address bar or
add-to-home-screen.

### Static hosts

- **Cloudflare Pages**: point the root at the repo, build command
  `npm run build`, output `dist`.
- **GitHub Pages / Netlify / Vercel / nginx**: upload `dist/` (behind any
  static server). SPA fallback to `index.html` for 404s unless you serve a
  `_redirects`/rewrite.

Assets are fully self-hosted (fonts are system), so offline works with no
external CDN.

## 2. Deploy the relay

One Worker + one KV namespace.

```sh
npm run worker:dev      # local: http://localhost:8787
```

Steps:

1. Create namespace:
   ```sh
   npx wrangler kv namespace create MAILBOX
   ```
   Paste the returned `id` into `worker/wrangler.toml` under
   `[[kv_namespaces]]`.
2. Deploy:
   ```sh
   npm run worker:deploy
   ```
3. The relay needs **no secrets** (device tokens are client-provided and
   self-registered). Optional flags in `worker/wrangler.toml`:
   - `RATE_LIMIT_PER_MINUTE` (default 120)
   - `MESSAGE_TTL_SECONDS`, `PAIR_TTL_SECONDS` if you want different TTLs.

Configure the workers to a custom domain if you prefer
(e.g. `sync.orderhub.example.workers.dev` → set `relay` in App Settings).

## 3. Configure the app

Inside Settings → Sync/Relay, set the relay base URL to the deployed worker
URL. That setting is stored per-device in the `settings` table. Pairing is a
per-device step (Settings → Pair a device).

## 4. Verify

```sh
npm run build && npm run typecheck && npm run lint && npm test && npm run worker:typecheck && npm run worker:test
```

E2E (optional, needs Chromium once): `npx playwright install chromium && npm run test:e2e`.