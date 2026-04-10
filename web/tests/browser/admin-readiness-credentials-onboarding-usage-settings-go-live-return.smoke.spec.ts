import { expect, test } from "@playwright/test";

test(
  "admin readiness credentials branch -> onboarding -> usage -> /settings?intent=manage-plan -> go-live -> admin keeps readiness browser continuity",
  async ({ page }) => {
    test.slow();

    await page.goto("/admin?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview");

    await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
    await expect(page.getByText("Drill-down active: Credentials")).toBeVisible();

    const openOnboardingFlowLink = page.getByRole("link", { name: "Open onboarding flow" }).first();
    await expect(openOnboardingFlowLink).toBeVisible();
    await openOnboardingFlowLink.click();

    await expect(page).toHaveURL(/\/onboarding\?/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);

    const usageLink = page.getByRole("link", { name: "Step 5: Confirm usage window" }).first();
    await expect(usageLink).toBeVisible();
    await Promise.all([page.waitForURL(/\/usage\?/), usageLink.click()]);

    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Workspace usage and plan posture" })).toBeVisible();

    const settingsLink = page.getByRole("link", { name: "Review plan limits in Settings" }).first();
    await expect(settingsLink).toBeVisible();
    await Promise.all([page.waitForURL(/\/settings\?/), settingsLink.click()]);

    await expect(page).toHaveURL(/intent=manage-plan/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();

    const goLiveLink = page.getByRole("link", { name: "Rehearse go-live readiness" }).first();
    await expect(goLiveLink).toBeVisible();
    await goLiveLink.click();

    await expect(page).toHaveURL(/\/go-live\?/);
    await expect(page).toHaveURL(/surface=go_live/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Credentials")).toBeVisible();

    const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
    await expect(adminReturnLink).toBeVisible();
    await adminReturnLink.click();

    await expect(page).toHaveURL(/\/admin\?/);
    await expect(page).toHaveURL(/readiness_returned=1/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
    await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
    await expect(page.getByText("Focus restored")).toBeVisible();
  },
);
