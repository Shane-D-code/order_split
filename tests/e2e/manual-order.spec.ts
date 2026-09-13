import { test, expect } from "@playwright/test";
import { onboard } from "./helpers";

test("adds a manual order, reviews it, and confirms it", async ({ page }) => {
  await onboard(page);

  await page.goto("/new");
  await page.getByRole("link", { name: "Manual entry" }).click();

  await page.getByLabel("Item 1 name").fill("Milk");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit price (₹)").fill("24");
  await page.getByLabel("Delivery fee (₹)").fill("10");

  // 2 × 24 + 10 delivery = ₹58.00
  await page.getByRole("button", { name: "Save draft · ₹58.00" }).click();

  await expect(page.getByRole("heading", { name: "Review order" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm · ₹58.00" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm · ₹58.00" }).click();

  await expect(page.getByText("Spent today")).toBeVisible();
  const card = page.getByRole("link", { name: /Other/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("₹58");
  await expect(page.getByText("₹58.00").first()).toBeVisible();
});

test("a raw OCR-style draft blocks confirm until the user overrides the error", async ({ page }) => {
  await onboard(page);

  // Simulate an OCR import that could not find any items: only a zero-item
  // draft exists (exactly what the import pipeline produces on an empty parse).
  const draftId = await page.evaluate(async () => {
    const { createDraft } = await import("/src/db/repositories/orders.ts");
    const draft = await createDraft({
      sourceType: "ocr",
      sourceName: "bill.jpg",
      platform: "other",
      orderedAt: new Date().toISOString(),
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      total: 0,
      warnings: [],
    });
    return draft.id;
  });

  await page.goto(`/review/${draftId}`);
  await expect(page.getByRole("heading", { name: "Review order" })).toBeVisible();

  // "No items were found on the bill." is an overridable error → blocks confirm.
  await expect(page.getByText("No items were found on the bill.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix issues to confirm" })).toBeVisible();

  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Confirm · ₹0.00" })).toBeVisible();
});