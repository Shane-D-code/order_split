import { test, expect } from "@playwright/test";
import { onboard } from "./helpers";

test("lists confirmed orders in history grouped by day", async ({ page }) => {
  await onboard(page);

  await page.goto("/new");
  await page.getByRole("link", { name: "Manual entry" }).click();
  await page.getByLabel("Item 1 name").fill("Oats");
  await page.getByLabel("Unit price (₹)").fill("150");
  await page.getByRole("button", { name: /Save draft/ }).click();
  await page.getByRole("button", { name: /Confirm/ }).click();
  // Confirm() writes the order, then navigates to Today. Wait for that
  // landing before moving on, so the IndexedDB write is committed.
  await page.getByText("Spent today").waitFor({ state: "visible", timeout: 15_000 });

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  const card = page.getByRole("link", { name: /Other/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("₹150");
  await page.goto("/");
  await expect(page.getByText("Spent today · 1 order")).toBeVisible();
  await expect(page.getByText("₹150.00").first()).toBeVisible();
});