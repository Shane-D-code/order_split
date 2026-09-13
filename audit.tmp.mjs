#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const st = (m) => process.stderr.write(m + "\n");
const BASE = "http://localhost:4173";
const OUT = resolve("test-results/visual");
const GOLDEN = "rgb(248, 201, 91)";
const isDarkBrown = (c) => {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c ?? "");
  if (!m) return false;
  return +m[1] < 100 && +m[2] < 80 && +m[3] < 60;
};

const views = [
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
];
const phones = new Set([375, 390, 412]);

const js = `() => {
  const doc = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), bg: cs.backgroundColor, fontSize: cs.fontSize };
  };
  const text = (el) => el?.textContent.replace(/\\s+/g, " ").trim();
  const hero = document.querySelectorAll("section.app-max")[0];
  const headerEl = document.querySelector("header.app-max");
  const wordmark = document.querySelector('p[aria-label="Family Orders"]');
  const totEl = hero?.querySelector("p[class*='tabular-nums']");
  const headEl = hero?.querySelector("p.font-display");
  const labEl = hero ? [...hero.querySelectorAll("p")].find(p => p.textContent.includes("Spent today")) : null;
  const artEl = hero ? [...hero.querySelectorAll("svg,img")].find(el => getComputedStyle(el).animationName === "float" || el.closest("[class*='animate-float']")) : null;
  const heading = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === "Today's orders");
  const emptyTitle = [...document.querySelectorAll("p,h2")].find(el => text(el)?.startsWith("No orders yet today"));
  const emptyCard = emptyTitle?.closest("div.rounded-lg");
  const nav = document.querySelector('nav[aria-label="Primary"]');
  const navPill = nav?.querySelector(":scope > div");
  const linkSel = { today: 'a[href="/"]', add: 'a[href="/new"]', history: 'a[href="/history"]', settings: 'a[href="/settings"]' };
  const links = Object.entries(linkSel).map(([name, s]) => ({ name, ...doc(nav?.querySelector(s)) }));
  const addBtn = emptyCard ? [...emptyCard.querySelectorAll("button,a")].filter(el => text(el)?.includes("Add your first"))[0] : null;
  return {
    viewport: [innerWidth, innerHeight],
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    lock: nav ? getComputedStyle(nav).position : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    header: doc(headerEl), wordmark: doc(wordmark),
    hero: doc(hero), heroPanel: doc(hero?.querySelector(".rounded-[2.75rem]")),
    headline: doc(headEl), headlineSize: headEl ? getComputedStyle(headEl).fontSize : null,
    total: doc(totEl), totalSize: totEl ? getComputedStyle(totEl).fontSize : null, totalText: text(totEl),
    dailyLabel: doc(labEl), art: doc(artEl),
    ordersHeading: doc(heading), empty: doc(emptyCard), addBtn: doc(addBtn),
    nav: doc(nav), navPill: doc(navPill), navPillBg: navPill ? getComputedStyle(navPill).backgroundColor : null,
    links,
  };
}`;

let failures = 0;
const report = [];
const log = (ok, label, detail = "") => {
  report.push(`${ok ? "OK" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

async function onboard(page) {
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const name = page.getByLabel("Your name on this device");
  if (await name.count()) {
    await name.fill("QA");
    await page.getByRole("button", { name: "Start using" }).click();
  }
  await page.getByText("Spent today").waitFor({ state: "visible", timeout: 15000 });
}

async function auditHome(page, { w, h }) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const d = await page.evaluate(js);
  const vw = d.viewport[0];
  const grp = w >= 1024 ? "desktop" : phones.has(w) ? "phone" : "tablet";
  const tag = `[${grp} ${w}]`;

  log(d.overflow === false, `${tag} no horizontal overflow`, `sw=${d.scrollW} cw=${d.clientW}`);
  log(d.bodyBg === GOLDEN, `${tag} yellow fills page`, d.bodyBg);

  if (grp === "desktop") {
    log(Math.abs((vw - d.hero.width) / 2 - d.hero.left) < 32, `${tag} content centered`, `L=${d.hero.left} w=${d.hero.width}`);
    return d;
  }

  log(d.wordmark && d.wordmark.top >= 0 && d.wordmark.top < 90, `${tag} Family Orders top`, d.wordmark ? `top=${d.wordmark.top}` : "missing");
  const hr = (d.hero.width || 0) / vw;
  log(hr >= 0.86, `${tag} hero full width`, `${Math.round(hr * 100)}%`);
  log(d.hero.height >= 230 && d.hero.height <= 400, `${tag} hero compact`, `h=${d.hero.height}`);
  const tp = parseFloat(d.totalSize || "0");
  log(tp >= 44 && tp <= 76, `${tag} total 44-76px`, `${d.totalText} @${d.totalSize}`);
  log(d.total && d.total.right <= vw + 2, `${tag} total not clipped`, `R=${d.total?.right}`);
  log(d.total && d.total.right <= d.heroPanel.right + 2, `${tag} total inside panel`, `R=${d.total?.right} panelR=${d.heroPanel?.right}`);
  const artOk = d.art && d.art.width >= 80 && d.art.right <= vw + 2;
  log(artOk, `${tag} illustration visible`, d.art ? `w=${d.art.width} R=${d.art.right}` : "missing");
  const gap = d.ordersHeading ? d.ordersHeading.top - d.hero.bottom : null;
  log(gap !== null && gap >= 14 && gap <= 52, `${tag} heading gap`, `gap=${gap}`);
  if (d.empty) {
    log((d.empty.width / vw) >= 0.86, `${tag} empty near-full width`, `${d.empty.width}/${vw}`);
    log(d.empty.height >= 220 && d.empty.height <= 340, `${tag} empty compact`, `h=${d.empty.height}`);
    log(!isDarkBrown(d.empty.bg), `${tag} empty cream`, d.empty.bg);
    log(d.empty.left >= 4 && d.empty.right <= vw + 2, `${tag} empty inside viewport`, `L=${d.empty.left} R=${d.empty.right}`);
    const ab = d.addBtn;
    if (ab) log(ab.height >= 44, `${tag} add CTA >=44px`, `${ab.width}x${ab.height}`);
  }
  const nr = (d.nav.width || 0) / vw;
  log(nr >= 0.84, `${tag} nav spans width`, `${Math.round(nr * 100)}%`);
  log(d.nav.left >= 4 && d.nav.left <= 24, `${tag} nav left margin`, `L=${d.nav.left}`);
  log(d.navPill && (d.navPill.width / vw) >= 0.8, `${tag} nav pill wide`, `pill=${d.navPill?.width}`);
  log(!isDarkBrown(d.navPillBg || ""), `${tag} nav cream`, d.navPillBg);
  const gapB = h - d.nav.bottom;
  log(gapB >= 2 && gapB <= 60, `${tag} nav near bottom`, `gap=${gapB}`);
  for (const l of d.links) {
    if (!l.width && !l.height) { log(false, `${tag} link ${l.name} found`); continue; }
    log(l.height >= 44 && (l.width >= 42 || l.name === 'add'), `${tag} touch ${l.name}`, `${l.width}x${l.height}`);
    log(l.left >= -4 && l.right <= vw + 4, `${tag} ${l.name} not clipped`, `L=${l.left} R=${l.right}`);
  }
  return d;
}

async function sweepPages(page, { w, h }) {
  await page.setViewportSize({ width: w, height: h });
  const others = ["/history", "/new", "/import", "/new/manual", "/settings", "/settings/pair"];
  for (const p of others) {
    await page.goto(`${BASE}${p}`, { waitUntil: "load" });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      colW: [...document.querySelectorAll(".app-max")].reduce((max, el) => Math.max(max, el.getBoundingClientRect().width), 0),
    }));
    log(!r.overflow, `[${w}] ${p} no overflow`, `sw=${r.sw} cw=${r.cw}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true }).catch(() => undefined);
  const browser = await chromium.launch();
  st("browser launched");

  for (const v of views) {
    st(`audit ${v.w}x${v.h}...`);
    const ctx = await browser.newContext({ colorScheme: "light", locale: "en-IN", deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await onboard(page);
    const d = await auditHome(page, v);
    await page.screenshot({ path: `${OUT}/${v.w}x${v.h}-home.png` });
    await sweepPages(page, v);
    await ctx.close();
    st(`  done ${v.w}`);
  }

  st("populated flow...");
  const ctxP = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", locale: "en-IN", deviceScaleFactor: 2 });
  const pageP = await ctxP.newPage();
  await onboard(pageP);
  await pageP.goto(`${BASE}/new/manual`, { waitUntil: "load" });
  await pageP.getByPlaceholder("e.g. Loose onion 1 kg").fill("Amul Butter 500g");
  await pageP.getByPlaceholder("32.50").fill("94");
  await pageP.getByRole("button", { name: /Save draft/ }).click();
  await pageP.getByRole("button", { name: /Confirm/ }).waitFor({ state: "visible", timeout: 15000 });
  await pageP.getByRole("button", { name: /Confirm/ }).click();
  await pageP.getByText("Spent today").waitFor({ state: "visible", timeout: 15000 });
  const d = await pageP.evaluate(js);
  log(d.totalText === "₹94.00", "populated total", d.totalText);
  log(pageP.url().endsWith("/"), "populated navigated home", pageP.url());
  await pageP.screenshot({ path: `${OUT}/390x844-populated-home.png` });
  await ctxP.close();
  st("done");

  console.log("\n===== GEOMETRY AUDIT =====");
  for (const r of report) console.log(r);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  await browser.close();
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });