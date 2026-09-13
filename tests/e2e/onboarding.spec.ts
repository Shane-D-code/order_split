import { test, expect } from "@playwright/test";

test("first run shows onboarding and persists identity after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

  await page.getByLabel("Your name on this device").fill("Tester");
  await page.getByRole("button", { name: "Start using" }).click();

  await expect(page.getByText("No orders yet today")).toBeVisible();
  await expect(page.getByText("Spent today")).toBeVisible();

  await page.reload();
  // Identity persisted: welcome screen must not reappear.
  await expect(page.getByRole("heading", { name: "Welcome" })).toHaveCount(0);
  await expect(page.getByText("No orders yet today")).toBeVisible();
});