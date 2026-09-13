import { chromium } from "playwright";
const st = (m) => process.stderr.write(m + "\n");
const browser = await chromium.launch();
st("launched");
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", locale: "en-IN", deviceScaleFactor: 2 });
const page = await ctx.newPage();
st("context ready");
await page.goto("http://localhost:4173/", { waitUntil: "load" });
st("goto load done");
await page.waitForTimeout(800);
const name = page.getByLabel("Your name on this device");
st("name count: " + (await name.count()));
if (await name.count()) {
  await name.fill("QA");
  st("filled");
  await page.getByRole("button", { name: "Start using" }).click();
  st("clicked start");
}
await page.getByText("Spent today").waitFor({ state: "visible", timeout: 15000 });
st("home visible");
const d = await page.evaluate(() => ({
  vw: innerWidth,
  hero: document.querySelectorAll("section.app-max")[0]?.getBoundingClientRect().width,
}));
st("audit: " + JSON.stringify(d));
await page.screenshot({ path: "test-results/visual/_debug.png" });
st("shot");
await ctx.close();
await browser.close();
st("done");