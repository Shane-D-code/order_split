import { db } from "../database";

export const SETTINGS_KEYS = {
  displayName: "displayName",
  retention: "retentionDays",
  relayUrl: "relayUrl",
  vapidPublicKey: "vapidPublicKey",
  onboarded: "onboarded",
  lastSyncAt: "lastSyncAt",
  theme: "theme",
} as const;

export type StoredTheme = "light" | "dark";

export async function getThemeSetting(): Promise<StoredTheme> {
  const raw = await getSetting(SETTINGS_KEYS.theme);
  return raw === "dark" ? "dark" : "light";
}

export async function setThemeSetting(theme: StoredTheme): Promise<void> {
  await setSetting(SETTINGS_KEYS.theme, theme === "dark" ? "dark" : "light");
}

export async function getSetting(key: string, fallback?: string): Promise<string | undefined> {
  const row = await db.settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getRetentionDays(): Promise<number> {
  const raw = await getSetting(SETTINGS_KEYS.retention, "30");
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 30;
}

export async function setRetentionDays(days: number): Promise<void> {
  await setSetting(SETTINGS_KEYS.retention, String(Math.max(1, Math.round(days))));
}

export async function getDisplayName(): Promise<string> {
  return (await getSetting(SETTINGS_KEYS.displayName)) ?? "";
}

export async function setDisplayName(name: string): Promise<void> {
  await setSetting(SETTINGS_KEYS.displayName, name.trim());
}

export const DEFAULT_RELAY_URL = "https://family-order-relay.<your-subdomain>.workers.dev";

export async function getRelayUrl(): Promise<string> {
  return (await getSetting(SETTINGS_KEYS.relayUrl)) ?? DEFAULT_RELAY_URL;
}

export async function setRelayUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/, "");
  await setSetting(SETTINGS_KEYS.relayUrl, normalized);
}

export async function getOnboarded(): Promise<boolean> {
  return (await getSetting(SETTINGS_KEYS.onboarded)) === "1";
}

export async function setOnboarded(): Promise<void> {
  await setSetting(SETTINGS_KEYS.onboarded, "1");
}