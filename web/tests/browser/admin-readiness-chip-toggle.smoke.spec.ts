import { expect, test } from "@playwright/test";

test("admin readiness chip clear/toggle keeps broader governance focus continuity", async ({ page }) => {
  test.slow();

  await page.goto("/admin?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();

  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  const readinessSummarySection = page
    .getByRole("heading", { name: "Week 8 readiness summary" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");

  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Baseline gaps", { exact: true })).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(readinessSummarySection).toBeVisible();
  await expect(readinessSummarySection.getByText("Drill-down active: Baseline gaps")).toBeVisible();

  const clearReadinessFocusLink = readinessSummarySection.getByRole("link", { name: "Clear readiness focus" }).first();
  await expect(clearReadinessFocusLink).toBeVisible();
  await clearReadinessFocusLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).not.toHaveURL(/week8_focus=baseline/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(readinessSummarySection.getByText("No drill-down active")).toBeVisible();
  await expect(governanceFocusSection.getByText("Baseline gaps", { exact: true })).toHaveCount(0);
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();

  const credentialsMetric = readinessSummarySection
    .locator('a[href*="week8_focus=credentials"][href*="attention_organization=org_preview"][href*="attention_workspace=preview"]')
    .first();
  await expect(credentialsMetric).toBeVisible();
  await credentialsMetric.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(governanceFocusSection.getByText("Credentials", { exact: true })).toBeVisible();
  await expect(readinessSummarySection.getByText("Drill-down active: Credentials")).toBeVisible();

  const activeCredentialsMetric = readinessSummarySection
    .locator('a[aria-current="true"]')
    .filter({ hasText: "Credentials ready" })
    .first();
  await expect(activeCredentialsMetric).toBeVisible();
  await activeCredentialsMetric.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).not.toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(readinessSummarySection.getByText("No drill-down active")).toBeVisible();
  await expect(governanceFocusSection.getByText("Credentials", { exact: true })).toHaveCount(0);
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
});
