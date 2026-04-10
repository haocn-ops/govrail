import { expect, test } from "@playwright/test";

const membersEntry =
  "/members?source=onboarding&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview.owner%40govrail.test";

test("members -> accept-invitation -> return -> onboarding keeps invite continuity", async ({ page }) => {
  test.slow();

  await page.goto(membersEntry);

  await expect(page.getByRole("heading", { name: "Workspace access" })).toBeVisible();
  await expect(page.getByText("Manual onboarding handoff")).toBeVisible();
  const acceptInviteLink = page.getByRole("link", { name: "Open accept-invitation" }).first();
  await expect(acceptInviteLink).toBeVisible();

  await acceptInviteLink.click();

  await expect(page).toHaveURL(/\/accept-invitation\?/);
  await expect(page).toHaveURL(/source=onboarding/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Preview(?:\+|%20)Owner/);
  await expect(page).toHaveURL(/recent_owner_email=preview\.owner(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Accept workspace invitation" })).toBeVisible();
  await expect(page.getByText("Token guidance")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await expect(page.getByText("/session")).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/members\?/);
  await expect(page).toHaveURL(/source=onboarding/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Preview(?:\+|%20)Owner/);
  await expect(page).toHaveURL(/recent_owner_email=preview\.owner(?:%40|@)govrail\.test/);
  const onboardingLink = page.getByRole("link", { name: "Continue onboarding lane" }).first();
  await expect(onboardingLink).toBeVisible();

  await onboardingLink.click();

  await expect(page).toHaveURL(/\/onboarding\?/);
  await expect(page).toHaveURL(/source=onboarding/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Preview(?:\+|%20)Owner/);
  await expect(page).toHaveURL(/recent_owner_email=preview\.owner(?:%40|@)govrail\.test/);
  await expect(page.getByText("Launch lane context")).toBeVisible();
});
