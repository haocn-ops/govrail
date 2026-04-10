import { expect, test } from "@playwright/test";

import { linkByHrefFragments } from "./support/navigation";

const settingsEntry =
  "/settings?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("settings -> go-live -> admin keeps handoff continuity", async ({ page }) => {
  test.slow();

  await page.goto(settingsEntry);

  await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enterprise evidence lane" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dedicated environment evidence lane" })).toBeVisible();
  await expect(
    linkByHrefFragments(page, "Rehearse go-live readiness", "/go-live?surface=go_live"),
  ).toBeVisible();

  const dedicatedUpgradeLink = page
    .getByText(/Dedicated environment delivery is exposed as a plan-gated readiness surface in this slice\./)
    .locator('xpath=ancestor::div[.//a[normalize-space()="Upgrade plan"]][1]')
    .getByRole("link", { name: "Upgrade plan" });
  await expect(dedicatedUpgradeLink).toBeVisible();
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /\/settings\?/);
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /intent=upgrade/);
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /source=admin-readiness/);
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /week8_focus=credentials/);
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /attention_workspace=preview/);
  await expect(dedicatedUpgradeLink).toHaveAttribute("href", /attention_organization=org_preview/);
  await dedicatedUpgradeLink.click();

  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page).toHaveURL(/intent=upgrade/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByText("Upgrade intent", { exact: true })).toBeVisible();

  const goLiveLink = page
    .getByText(/You landed here to complete the self-serve upgrade lane/)
    .locator('xpath=ancestor::div[.//a[normalize-space()="Continue to go-live drill"]][1]')
    .getByRole("link", { name: "Continue to go-live drill" });
  await expect(goLiveLink).toBeVisible();
  await goLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=go_live/);
  await expect(page).toHaveURL(/recent_update_kind=go_live/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Session-aware drill lane")).toBeVisible();

  const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReturnLink).toBeVisible();
  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_update_kind=go_live/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
});
