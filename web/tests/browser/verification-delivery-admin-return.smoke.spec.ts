import { expect, test } from "@playwright/test";

const verificationEntry =
  "/verification?surface=verification&source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("verification delivery panel -> go-live -> admin keeps readiness continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto(verificationEntry);

  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verification delivery notes" })).toBeVisible();
  const verificationPanel = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("Admin readiness evidence handoff", { exact: true }) })
    .first();
  await expect(verificationPanel).toBeVisible();
  await expect(verificationPanel.getByText(/navigation focus only/i)).toBeVisible();

  const goLiveLink = verificationPanel.getByRole("link", { name: "Continue to go-live drill" });
  await expect(goLiveLink).toBeVisible();
  await goLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Go-live delivery notes" })).toBeVisible();

  const goLivePanel = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("Admin readiness evidence handoff", { exact: true }) })
    .first();
  const adminReturnLink = goLivePanel.getByRole("link", { name: "Return to admin readiness view" });
  await expect(adminReturnLink).toBeVisible();
  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
});
