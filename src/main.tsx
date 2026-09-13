import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { applyRootTheme, getStoredTheme } from "./app/theme";
import "./index.css";

registerSW({ immediate: true });

// Apply the persisted explicit theme (if any) before first render. A fresh
// user has no stored choice and gets the sunny LIGHT default — the OS dark
// preference is never consulted.
applyRootTheme(getStoredTheme());

const container = document.getElementById("root");
if (!container) throw new Error("root element missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);