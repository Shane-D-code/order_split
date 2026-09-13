# Security

Threat model: an attacker who can read the relay's storage at rest or in route
should learn nothing about your orders. Private keys never leave the device.

## Cryptography (src/crypto/)

- **WebCrypto only** (`crypto.subtle`); no pure-JS crypto fallback in
  production paths.
- **Identity**: `deviceId` = first 32 hex chars of SHA-256 of the secret.
  The secret is the bearer credential (`X-Device-Token`) for the relay.
- **Pairing**: ECDH P-256 keypairs. The invite carries the advertiser's public
  key and a random pairing seed. Parent encrypts an ACK (containing the
  parent's public key + display name) with AES-256-GCM keyed off the seed.
  Advertiser decrypts with the same seed and records the parent's public key.
- **Channel**: ECDH(P-256) on both devices, HKDF-SHA256 to a 256-bit AES-GCM
  key, unique per device pair. AES-GCM nonce = 12 random bytes prepended to the
  ciphertext; salt per-generate kept for derivation.
- Payload envelope in the encrypted body is versioned
  (`OrderEnvelope.v=1`, `PairingAckEnvelope.v=1`) so future format bumps are
  safe.

## Relay hardening (worker/)

- **No plaintext order data**: only `{ciphertext, iv, salt}` plus routing ids
  are stored (`worker/tests/relay.test.ts` enforces the invariant).
- Keys are namespaced per device (`mail:<deviceId>:<messageId>`).
- Every message has a TTL (7 days); pairing codes TTL 10 minutes and are
  single-use (410 after use).
- Auth: bearer device secret per request; `senderDeviceId` must match the
  authenticated device (403 otherwise). First contact self-registers.
- Per-device rate cap (default 120 req/min) returns 429.
- Body size cap (64 KB) and JSON-only parsing; unknown routes 404.

## Keys & secrets hygiene

- Worker secrets and VAPID keys come from environment / `wrangler secrets`,
  never from code (see `docs/deployment.md`).
- app keys (device secret, channel keys, JWKs) live only in IndexedDB on the
  device; sync does not expose them.
- `pairingSeed` from the QR invite is held briefly (for finalize) and its
  pending record (`pendingPairingSeeds`) is consumed and removed after a
  successful pairing.

## Audit invariants (kept by tests)

- Money is integer paise end-to-end; the float boundary is UI-only.
- Draft→order conversion never alters totals; only derives
  `round(lineTotal/qty)` for a null `unitPrice`.
- Dedup prevents double insertion on relay redelivery.
- Overrides are explicit user actions, never automatic.