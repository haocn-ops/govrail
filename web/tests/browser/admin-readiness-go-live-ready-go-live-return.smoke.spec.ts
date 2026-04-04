import { expect, test } from "@playwright/test";

test("admin readiness go-live-ready branch -> go-live -> admin keeps readiness browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  const readinessSummarySection = page
    .getByRole("heading", { name: "Week 8 readiness summary" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");

  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Go-live ready", { exact: true })).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(readinessSummarySection).toBeVisible();
  await expect(readinessSummarySection.getByText("Drill-down active: Go-live ready")).toBeVisible();

  const goLiveDrillLink = readinessSummarySection.getByRole("link", { name: "Open mock go-live drill" });
  await expect(goLiveDrillLink).toBeVisible();
  await goLiveDrillLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=go_live_ready/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Go-live ready")).toBeVisible();

  const adminReadinessReturnLink = page
    .locator("a")
    .filter({ hasText: "Return to admin readiness view" })
    .first();
  await expect(adminReadinessReturnLink).toBeVisible();
  await adminReadinessReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=go_live_ready/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
