import { expect, test } from "@playwright/test";

const onboardingEntry =
  "/onboarding?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("onboarding -> accept-invitation -> return -> verification keeps invite continuity", async ({ page }) => {
  test.slow();

  await page.goto(onboardingEntry);

  await expect(page.getByText("Launch lane context")).toBeVisible();
  await expect(page.getByText("Invite-to-accept path")).toBeVisible();
  const acceptInvitationLink = page.getByRole("link", { name: "Open accept-invitation" }).first();
  await expect(acceptInvitationLink).toBeVisible();

  await acceptInvitationLink.click();

  await expect(page).toHaveURL(/\/accept-invitation\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_demo/);
  await expect(page).toHaveURL(/delivery_context=week8/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Accept workspace invitation" })).toBeVisible();
  await expect(page.getByText("Token guidance")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await expect(page.getByText("/session")).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/onboarding\?/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByText("Launch lane context")).toBeVisible();
  const verificationLink = page.getByRole("link", { name: "Step 6: Capture verification evidence" }).first();
  await expect(verificationLink).toBeVisible();

  await verificationLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_demo/);
  await expect(page).toHaveURL(/delivery_context=week8/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Verification evidence lane")).toBeVisible();
});
