export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

export function base64UrlToBytes(b64: string): Uint8Array {
  let clean = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (clean.length % 4 !== 0) clean += "=";
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Decode a "B" (Blinkit-style) base64 as base64url. */
export function b64ToBase64Url(s: string): string {
  return s
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += CHARS[b % CHARS.length];
  return out;
}