import { expect, test } from "@playwright/test";

test("admin readiness baseline branch -> onboarding -> go-live -> admin keeps readiness browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::*[.//a][1]");
  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Baseline gaps").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear all focus" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Week 8 readiness summary" })).toBeVisible();
  await expect(page.getByText("Drill-down active: Baseline gaps")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open onboarding flow" })).toBeVisible();

  const readinessFollowUpSection = page
    .getByRole("heading", { name: "Week 8 readiness follow-up" })
    .locator("xpath=ancestor::*[.//button][1]");
  await expect(readinessFollowUpSection.getByText("Preview Workspace").first()).toBeVisible();
  const finishOnboardingButton = readinessFollowUpSection
    .getByRole("button", { name: "Finish onboarding" })
    .first();
  await expect(finishOnboardingButton).toBeVisible();

  await finishOnboardingButton.click();

  await expect(page).toHaveURL(/\/onboarding\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=baseline/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Launch lane context")).toBeVisible();
  await expect(page.getByText("Focus Baseline gaps")).toBeVisible();

  const rehearseGoLiveLink = page.getByRole("link", { name: "Step 7: Rehearse go-live" }).first();
  await expect(rehearseGoLiveLink).toBeVisible();
  await rehearseGoLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=baseline/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Baseline gaps")).toBeVisible();

  const adminReadinessReturnLink = page
    .locator("a")
    .filter({ hasText: "Return to admin readiness view" })
    .first();
  await expect(adminReadinessReturnLink).toBeVisible();
  await adminReadinessReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=baseline/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
