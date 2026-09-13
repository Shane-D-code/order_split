/**
 * Explicit theme control. The product default is the sunny LIGHT palette;
 * dark is an opt-in alternate theme (never driven by the OS preference).
 * The active theme is cached in localStorage so it can be applied before
 * first paint (see <html data-theme>), and mirrored in the Dexie settings
 * store as the durable source of truth.
 */

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "light";

export const STORAGE_KEY = "fo-theme";

export const THEME_META_COLOR: Record<Theme, string> = {
  light: "#f8c95b",
  dark: "#241a0f",
};

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Synchronous, side-effect-only: safe to call before React mounts. */
export function applyRootTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_META_COLOR[theme];
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage disabled — theme still applies for this session */
  }
}