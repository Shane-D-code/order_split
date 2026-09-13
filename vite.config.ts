import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Family Orders",
        short_name: "FamilyOrders",
        description:
          "Local-first order tracking. Share groceries and household orders with family.",
        theme_color: "#f8c95b",
        background_color: "#f8c95b",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "en-IN",
        categories: ["utilities", "finance", "shopping"],
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Tesseract language data is fetched from a CDN on first OCR use.
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "tesseract-langdata",
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            // tesseract.js worker/wasm/js is bundled on jsdelivr; keep a copy
            // so OCR repeat runs don't redownload.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js/,
            handler: "CacheFirst",
            options: {
              cacheName: "tesseract-engine",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
    ],
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
  },
});