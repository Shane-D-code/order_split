import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config used for the Cloudflare Worker relay tests (Node environment).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["worker/test/**/*.test.ts"],
  },
});