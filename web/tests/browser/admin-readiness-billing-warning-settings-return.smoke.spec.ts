import { expect, test } from "@playwright/test";

test("admin readiness billing warning branch -> settings -> admin keeps readiness browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto(
    "/admin?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview",
  );

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  const readinessSummarySection = page
    .getByRole("heading", { name: "Week 8 readiness summary" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");

  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Billing warning", { exact: true })).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(readinessSummarySection).toBeVisible();
  await expect(readinessSummarySection.getByText("Drill-down active: Billing warning")).toBeVisible();

  const billingWarningFlowLink = readinessSummarySection.getByRole("link", { name: "Open billing warning flow" });
  await expect(billingWarningFlowLink).toBeVisible();
  await billingWarningFlowLink.click();

  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page).toHaveURL(/intent=resolve-billing/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=billing_warning/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Billing warning")).toBeVisible();
  await expect(page.getByText("Enterprise evidence lane")).toBeVisible();

  const adminReadinessReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReadinessReturnLink).toBeVisible();
  await adminReadinessReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=billing_warning/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
