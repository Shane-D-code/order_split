#!/usr/bin/env node
/**
 * Visual QA checker for Family Orders.
 * Uses Playwright to load the production build, then asserts:
 *  - no horizontal overflow at any viewport
 *  - the LIGHT palette is the DEFAULT: the page canvas resolves to
 *    sunny golden yellow even when the OS reports a dark color-scheme
 *    (dark never leaks in unless the user explicitly chooses it)
 *  - the bottom navigation and empty state are cream paper, not dark
 *  - explicit Night theme applies and persists across reload
 *  - screenshots are saved under test-results/visual for inspection
 *
 * Run:  npm run build && node .visual-check.mjs
 */
import { chromium } from "playwright";
import { readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const views = [375, 390, 412, 768, 1440];
const schemes = ["light", "dark"];

const GOLDEN = "rgb(248, 201, 91)"; // --fo-canvas light

const isDarkBrown = (rgb) => {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  if (!m) return false;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return r < 100 && g < 80 && b < 60;
};

async function main() {
  const dist = resolve("dist");
  await readdir(dist).catch(() => {
    throw new Error("dist/ missing — run `npm run build` first");
  });
  await mkdir(resolve("test-results/visual"), { recursive: true }).catch(() => undefined);
  const browser = await chromium.launch();
  let failures = 0;

  const pages = ["/", "/new", "/import", "/history", "/new/manual", "/settings", "/settings/pair"];

  for (const scheme of schemes) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme,
      locale: "en-US",
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    console.log(`\n— OS color-scheme: ${scheme} —`);

    // Bootstrap: fresh context → no stored theme → the app must start LIGHT
    // even when the OS is dark, so onboarding is always the sunny palette.
    await page.goto(`http://localhost:4173/`, { waitUntil: "networkidle" });
    const bootTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
    if (bootTheme !== "light") {
      failures++;
      console.log(`  FAIL fresh boot data-theme=${bootTheme} (OS ${scheme})`);
    }
    const bootBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (isDarkBrown(bootBody)) {
      failures++;
      console.log(`  FAIL fresh boot dark canvas → ${bootBody} (OS ${scheme})`);
    } else if (scheme === "light" && bootBody !== GOLDEN) {
      failures++;
      console.log(`  FAIL fresh boot not golden → ${bootBody}`);
    } else {
      console.log(`  OK fresh boot canvas → ${bootBody}`);
    }
    await page.screenshot({ path: `test-results/visual/fresh-boot-${scheme}.png` });
    await page.getByLabel("Your name on this device").fill("QA");
    await page.getByRole("button", { name: "Start using" }).click();
    await page.getByText("Spent today").waitFor({ state: "visible", timeout: 15_000 });

    for (const path of pages) {
      await page.goto(`http://localhost:4173${path}`, { waitUntil: "networkidle" });
      if (scheme === "light") {
        const slug = path === "/" ? "home" : path.replace(/^\//, "").replaceAll("/", "-");
        await page.screenshot({ path: `test-results/visual/light-${slug}.png` });
      }
      const audit = await page.evaluate(() => {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const canvasVar = getComputedStyle(document.documentElement).getPropertyValue("--fo-canvas").trim();
        return {
          bodyBg,
          canvasVar,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      if (isDarkBrown(audit.bodyBg)) {
        failures++;
        console.log(`  FAIL dark canvas at ${path} (OS ${scheme}) → ${audit.bodyBg}`);
      }
      if (scheme === "light" && audit.bodyBg !== GOLDEN) {
        failures++;
        console.log(`  FAIL body not golden at ${path} → ${audit.bodyBg} (var ${audit.canvasVar})`);
      }
      if (audit.overflow) {
        failures++;
        console.log(`  FAIL overflow at ${path} (${scheme})`);
      }
    }

    // Today empty-state + nav surfaces must be cream paper, not dark.
    await page.goto(`http://localhost:4173/`, { waitUntil: "networkidle" });
    const surfaces = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Primary'] > div");
      const heading = [...document.querySelectorAll("p, h2")].find((el) =>
        el.textContent?.replace(/\s+/g, " ").trim().startsWith("No orders yet today")
      );
      const emptyCard = heading?.closest("div.rounded-lg");
      const pick = (el) => (el ? getComputedStyle(el).backgroundColor : null);
      return { nav: pick(nav), empty: emptyCard ? pick(emptyCard) : null };
    });
    const labels = { nav: surfaces.nav, empty: surfaces.empty };
    for (const [label, color] of Object.entries(labels)) {
      if (!color) {
        failures++;
        console.log(`  FAIL ${label} surface not found (OS ${scheme})`);
      } else if (isDarkBrown(color)) {
        failures++;
        console.log(`  FAIL ${label} is dark (OS ${scheme}) → ${color}`);
      } else {
        console.log(`  OK ${label} → ${color}`);
      }
    }

    // Explicit Night choice must apply and persist; Sun must return.
    if (scheme === "light") {
      await page.goto(`http://localhost:4173/settings`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Night/i }).click();
      await page.waitForTimeout(250);
      const darkNow = await page.evaluate(() => ({
        attr: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      if (darkNow.attr !== "dark" || !isDarkBrown(darkNow.body)) {
        failures++;
        console.log(`  FAIL explicit night not applied → ${JSON.stringify(darkNow)}`);
      } else {
        console.log(`  OK explicit night → ${darkNow.body}`);
      }
      await page.reload({ waitUntil: "networkidle" });
      const darkReload = await page.evaluate(() => ({
        attr: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      if (darkReload.attr !== "dark" || !isDarkBrown(darkReload.body)) {
        failures++;
        console.log(`  FAIL night did not persist → ${JSON.stringify(darkReload)}`);
      } else {
        console.log(`  OK night persisted across reload → ${darkReload.body}`);
      }
      await page.screenshot({ path: "test-results/visual/settings-night.png" });
      await page.getByRole("button", { name: /Sun/i }).click();
      await page.waitForTimeout(250);
      const sunNow = await page.evaluate(() => ({
        attr: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      if (sunNow.attr !== "light" || sunNow.body !== GOLDEN) {
        failures++;
        console.log(`  FAIL back-to-sun not applied → ${JSON.stringify(sunNow)}`);
      }
      await page.reload({ waitUntil: "networkidle" });
      const lightBack = await page.evaluate(() => ({
        attr: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      if (lightBack.attr !== "light" || lightBack.body !== GOLDEN) {
        failures++;
        console.log(`  FAIL back-to-sun failed → ${JSON.stringify(lightBack)}`);
      } else {
        console.log(`  OK back-to-sun → ${lightBack.body}`);
      }
    }
    await ctx.close();
  }

  // Full-viewport overflow sweep (default light).
  for (const width of views) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "light",
      locale: "en-US",
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    for (const path of pages) {
      await page.goto(`http://localhost:4173${path}`, { waitUntil: "networkidle" });
      const isOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      if (isOverflow) {
        failures++;
        console.log(`  FAIL overflow @${width} ${path}`);
      }
    }
    await ctx.close();
  }

  console.log(failures === 0 ? "\nPASS — all sweeps clean, screenshots in test-results/visual" : `\n${failures} issue(s) found`);
  if (failures > 0) process.exitCode = 1;
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});