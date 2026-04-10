import { expect, test } from "@playwright/test";

const settingsEntry =
  "/settings?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("settings -> verification -> admin keeps handoff continuity", async ({ page }) => {
  test.slow();

  await page.goto(settingsEntry);

  await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enterprise evidence lane" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SSO evidence lane" })).toBeVisible();

  const ssoUpgradeLink = page
    .getByText(/SSO configuration is available as a plan-gated enterprise surface\./)
    .locator('xpath=ancestor::div[.//a[normalize-space()="Upgrade plan"]][1]')
    .getByRole("link", { name: "Upgrade plan" });
  await expect(ssoUpgradeLink).toBeVisible();
  await expect(ssoUpgradeLink).toHaveAttribute("href", /\/settings\?/);
  await expect(ssoUpgradeLink).toHaveAttribute("href", /intent=upgrade/);
  await expect(ssoUpgradeLink).toHaveAttribute("href", /source=admin-readiness/);
  await expect(ssoUpgradeLink).toHaveAttribute("href", /week8_focus=credentials/);
  await expect(ssoUpgradeLink).toHaveAttribute("href", /attention_workspace=preview/);
  await expect(ssoUpgradeLink).toHaveAttribute("href", /attention_organization=org_preview/);
  await ssoUpgradeLink.click();

  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page).toHaveURL(/intent=upgrade/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByText("Upgrade intent", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirm usage evidence")).toBeVisible();

  const verificationLink = page.getByRole("link", { name: "Capture verification evidence" }).first();
  await expect(verificationLink).toBeVisible();
  await verificationLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Verification evidence lane")).toBeVisible();

  const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReturnLink).toBeVisible();
  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
});
