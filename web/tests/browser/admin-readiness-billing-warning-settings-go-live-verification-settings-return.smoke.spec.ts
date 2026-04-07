import { expect, test } from "@playwright/test";

test(
  "admin readiness billing warning branch -> settings -> go-live -> verification -> settings -> admin keeps readiness browser continuity",
  async ({ page }) => {
    test.slow();

    await page.goto(
      "/admin?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview",
    );

    await expect(page.getByRole("heading", { name: "Week 8 readiness summary" })).toBeVisible();
    const readinessSummarySection = page
      .getByRole("heading", { name: "Week 8 readiness summary" })
      .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
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
    await expect(page.getByText("Enterprise evidence lane")).toBeVisible();

    const goLiveLink = page.getByRole("link", { name: "Rehearse go-live readiness" }).first();
    await expect(goLiveLink).toBeVisible();
    await goLiveLink.click();

    await expect(page).toHaveURL(/\/go-live\?/);
    await expect(page).toHaveURL(/surface=go_live/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=billing_warning/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Billing warning")).toBeVisible();

    const verificationLink = page.getByRole("link", { name: "Reopen verification evidence" }).first();
    await expect(verificationLink).toBeVisible();
    await verificationLink.click();

    await expect(page).toHaveURL(/\/verification\?/);
    await expect(page).toHaveURL(/surface=verification/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=billing_warning/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Billing warning")).toBeVisible();

    const settingsLink = page.getByRole("link", { name: "Review settings + billing" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    await expect(page).toHaveURL(/\/settings\?/);
    await expect(page).toHaveURL(/intent=manage-plan/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=billing_warning/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Billing warning")).toBeVisible();

    const adminReadinessReturnLink = page
      .locator("a")
      .filter({ hasText: "Return to admin readiness view" })
      .first();
    await expect(adminReadinessReturnLink).toBeVisible();
    await adminReadinessReturnLink.click();

    await expect(page).toHaveURL(/\/admin\?/);
    await expect(page).toHaveURL(/readiness_returned=1/);
    await expect(page).toHaveURL(/week8_focus=billing_warning/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_preview/);
    await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
    await expect(page.getByText("Focus restored")).toBeVisible();
  },
);
