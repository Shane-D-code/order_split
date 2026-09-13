import { type Page } from "@playwright/test";

const SAYS_TODAY = "Spent today";

export async function onboard(page: Page, name = "Tester"): Promise<void> {
  await page.goto("/");
  // Each test gets a fresh context with no identity, so the welcome screen
  // always appears once the async identity check resolves. No conditional:
  // let Playwright auto-retry past the initial "Preparing your device…" spinner.
  await page.getByRole("heading", { name: "Welcome" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByLabel("Your name on this device").fill(name);
  await page.getByRole("button", { name: "Start using" }).click();
  await page.getByText(SAYS_TODAY).waitFor({ state: "visible", timeout: 15_000 });
}