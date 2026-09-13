import { base64UrlToBytes, bytesToBase64Url, bytesToText, randomBytes } from "../lib/base64";
import type { DeviceIdentity, EncryptedPayload } from "../domain/types";

/**
 * All cryptography uses the WebCrypto API. No home-grown crypto.
 *
 * - Device identity: random secret, deviceId = SHA-256(secret)
 * - Key agreement: ECDH P-256
 * - Key derivation: HKDF-SHA256
 * - Message secrecy: AES-256-GCM
 */

export class CryptoError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "CryptoError";
    if (cause) this.cause = cause;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDeviceIdentity(
  displayName: string,
): Promise<DeviceIdentity> {
  const secretBytes = randomBytes(32);
  const secret = bytesToBase64Url(secretBytes);
  const digest = await sha256Hex(textBytes(secret));
  const deviceId = bytesToHex(digest).slice(0, 32);

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    deviceId,
    secret,
    publicKeyJwk,
    privateKeyJwk,
    displayName,
    createdAt: new Date().toISOString(),
  };
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export async function importEcdhPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

export async function importEcdhPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

const HKDF_INFO = textBytes("family-order/v1/channel");

/**
 * Derive the per-recipient AES-GCM key from my private key + the peer's
 * public key. Both devices compute the same key; no key material ever
 * leaves a device.
 */
export async function deriveChannelKey(
  ownPrivateJwk: JsonWebKey,
  peerPublicJwk: JsonWebKey,
): Promise<CryptoKey> {
  const priv = await importEcdhPrivateKey(ownPrivateJwk);
  const peerPub = await importEcdhPublicKey(peerPublicJwk);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPub },
    priv,
    256,
  );
  return expandKey(sharedBits, HKDF_INFO);
}

async function expandKey(seed: ArrayBuffer, info: Uint8Array): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    seed,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Derive a single-session key from the pairing seed shared through the
 * QR invite. Used only for the one-time pairing acknowledgement.
 */
export async function derivePairingKey(pairingSeedB64: string): Promise<CryptoKey> {
  const seed = base64UrlToBytes(pairingSeedB64);
  return expandKey(seed, textBytes("family-order/v1/pairing"));
}

export async function encryptJson(
  key: CryptoKey,
  plaintext: unknown,
): Promise<EncryptedPayload> {
  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const encoded = textBytes(JSON.stringify(plaintext));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: salt },
    key,
    encoded,
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
    iv: bytesToBase64Url(iv),
    salt: bytesToBase64Url(salt),
  };
}

export async function decryptJson<T>(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<T> {
  try {
    const iv = base64UrlToBytes(payload.iv);
    const salt = base64UrlToBytes(payload.salt);
    const ciphertext = base64UrlToBytes(payload.ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: salt },
      key,
      ciphertext,
    );
    return JSON.parse(bytesToText(new Uint8Array(decrypted))) as T;
  } catch (err) {
    throw new CryptoError("Failed to decrypt payload", err);
  }
}

/** Push Notification VAPID key sanity check (may be unset). */
export function vapidIsConfigured(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** localStorage-safe display of a public key for the pairing invite. */
export function publicKeyToB64Jwk(jwk: JsonWebKey): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(jwk)));
}

export function b64JwkToPublicKeyJwk(b64: string): JsonWebKey {
  try {
    return JSON.parse(bytesToText(base64UrlToBytes(b64))) as JsonWebKey;
  } catch (err) {
    throw new CryptoError("Invalid public key payload", err);
  }
}