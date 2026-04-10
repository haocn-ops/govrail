import { expect, test } from "@playwright/test";

test("admin readiness demo-run branch -> verification -> go-live -> settings -> admin keeps readiness browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?week8_focus=demo_run&attention_organization=org_preview&attention_workspace=preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  const readinessSummarySection = page
    .getByRole("heading", { name: "Week 8 readiness summary" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");

  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Demo run", { exact: true })).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(readinessSummarySection).toBeVisible();
  await expect(readinessSummarySection.getByText("Drill-down active: Demo run")).toBeVisible();

  const openWeek8ChecklistLink = readinessSummarySection.getByRole("link", { name: "Open Week 8 checklist" });
  await expect(openWeek8ChecklistLink).toBeVisible();
  await openWeek8ChecklistLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Demo run")).toBeVisible();

  const continueGoLiveLink = page.getByRole("link", { name: "Continue to go-live drill" }).first();
  await expect(continueGoLiveLink).toBeVisible();
  await continueGoLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Demo run")).toBeVisible();

  const settingsLink = page.getByRole("link", { name: "Review billing + settings" }).first();
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();

  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page).toHaveURL(/intent=manage-plan/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Demo run")).toBeVisible();

  const adminReadinessReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReadinessReturnLink).toBeVisible();
  await adminReadinessReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
