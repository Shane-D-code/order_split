import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getThemeSetting, setThemeSetting } from "../db/repositories/settings";
import { applyRootTheme, getStoredTheme, type Theme } from "./theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyRootTheme(theme);
  }, [theme]);

  useEffect(() => {
    // Reconcile against the durable store on mount (covers e.g. a cleared
    // localStorage cache). Dexie settings are the source of truth.
    let alive = true;
    void getThemeSetting().then((stored) => {
      if (alive && stored !== getStoredTheme()) {
        applyRootTheme(stored);
        setThemeState(stored);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyRootTheme(next);
    void setThemeSetting(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}