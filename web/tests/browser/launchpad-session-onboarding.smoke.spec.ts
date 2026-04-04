import { expect, test } from "@playwright/test";

const adminReadinessEntry =
  "/?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops";

test("launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin keeps minimal browser continuity", async ({ page }) => {
  test.slow();

  await page.goto(adminReadinessEntry);

  await expect(page.getByRole("heading", { name: "SaaS Workspace Launch Hub" })).toBeVisible();
  const sessionCheckpointLink = page.getByRole("link", { name: "Return to session checkpoint" }).first();
  await expect(sessionCheckpointLink).toBeVisible();

  await sessionCheckpointLink.click();

  await expect(page).toHaveURL(/\/session\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByRole("heading", { name: "Session and workspace access" })).toBeVisible();
  const openOnboardingLink = page.getByRole("link", { name: "Open onboarding" }).first();
  await expect(openOnboardingLink).toBeVisible();

  await openOnboardingLink.click();

  await expect(page).toHaveURL(/\/onboarding\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByText("Launch lane context")).toBeVisible();
  await expect(page.getByRole("link", { name: "Confirm session context" })).toBeVisible();
  await expect(page.getByText("Trusted session reminder")).toBeVisible();

  const usageCheckpointLink = page.getByRole("link", { name: "Step 5: Confirm usage window" });
  await expect(usageCheckpointLink).toBeVisible();

  await usageCheckpointLink.click();

  await expect(page).toHaveURL(/\/usage\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByRole("heading", { name: "Workspace usage and plan posture" })).toBeVisible();

  const settingsPlanLink = page.getByRole("link", { name: "Review plan limits in Settings" });
  await expect(settingsPlanLink).toBeVisible();

  await settingsPlanLink.click();

  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page).toHaveURL(/intent=manage-plan/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
  await expect(page.getByText("Enterprise evidence lane")).toBeVisible();

  const verificationLink = page.getByRole("link", { name: "Capture verification evidence" }).first();
  await expect(verificationLink).toBeVisible();

  await verificationLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Verification evidence lane")).toBeVisible();

  const goLiveLink = page.getByRole("link", { name: "Continue to go-live drill" }).first();
  await expect(goLiveLink).toBeVisible();

  await goLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Session-aware drill lane")).toBeVisible();

  const adminReturnLink = page
    .locator('a[href*="readiness_returned=1"][href*="recent_update_kind=verification"]')
    .filter({ hasText: "Return to admin readiness view" })
    .first();
  await expect(adminReturnLink).toBeVisible();

  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_demo/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
});
