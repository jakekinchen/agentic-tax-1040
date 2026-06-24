import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function useSample(page: Page) {
  await page.getByLabel("I am using synthetic data and understand this demo is not a filing service.").check();
  await page.getByRole("button", { name: "Use sample W-2" }).click();
  await expect(page.locator("#stage")).toContainText("W2_EXTRACTED");
  await expect(page.locator("input[name=firstName]")).toHaveValue("Avery");
}

async function confirmW2(page: Page) {
  await page.getByRole("button", { name: "These details are right" }).click();
  await expect(page.locator("#stage")).toContainText("W2_CONFIRMED");
}

async function chooseSingle(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#stage")).toContainText("FILING_STATUS_CAPTURED");
}

async function chooseMfj(page: Page) {
  await page.locator("select[name=status]").selectOption("married_filing_jointly");
  await page.locator("input[name=spouseFirstName]").fill("Jordan");
  await page.locator("input[name=spouseLastName]").fill("Sample");
  await page.locator("input[name=spouseSsn]").fill("900-12-3457");
  await page.locator("input[name=spouseHadNoIncome]").check();
  await page.locator("input[name=spouseHadNoOtherTaxDocuments]").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#stage")).toContainText("FILING_STATUS_CAPTURED");
}

async function confirmScope(page: Page) {
  await page.getByRole("button", { name: "All apply" }).click();
  await expect(page.locator("#stage")).toContainText("SCOPE_CONFIRMED");
}

async function answerFlags(page: Page, digitalAssets: "no" | "yes" = "no") {
  await page.locator("select[name=digitalAssets]").selectOption(digitalAssets);
  await page.getByRole("button", { name: "Build PDF" }).click();
}

test("sample Single path downloads a two-page PDF and observation trail shows tools", async ({ page }) => {
  await page.goto("/");
  await useSample(page);
  await confirmW2(page);
  await chooseSingle(page);
  await confirmScope(page);
  const downloadPromise = page.waitForEvent("download");
  await answerFlags(page);
  await expect(page.locator("#stage")).toContainText("PDF_READY");
  await expect(page.locator("#result-outcome")).toContainText("$525");
  await page.getByText("How this worked").click();
  await expect(page.locator("#events")).toContainText("tool.extract_w2.succeeded");
  await expect(page.locator("#events")).toContainText("tool.calculate.succeeded");
  await expect(page.locator("#events")).toContainText("tool.generate_pdf.succeeded");
  await page.locator("#download").click();
  const download = await downloadPromise;
  const pdf = await PDFDocument.load(await readFile(await download.path()));
  expect(pdf.getPageCount()).toBe(2);
});

test("married and unsupported paths are visible", async ({ page }) => {
  await page.goto("/");
  await useSample(page);
  await confirmW2(page);
  await chooseMfj(page);
  await confirmScope(page);
  await answerFlags(page);
  await expect(page.locator("#result-outcome")).toContainText("$2,347");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator("#stage")).toContainText("NEW");
  await useSample(page);
  await confirmW2(page);
  await chooseSingle(page);
  await confirmScope(page);
  await answerFlags(page, "yes");
  await expect(page.locator("#stage")).toContainText("UNSUPPORTED");
  await expect(page.locator("#download")).toBeHidden();
});
