import { expect, test } from "@playwright/test";

const membersEntry =
  "/members?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test(
  "members -> accept-invitation -> verification -> go-live -> settings -> admin keeps readiness return continuity",
  async ({ page }) => {
    test.slow();

    await page.goto(membersEntry);

    await expect(page.getByRole("heading", { name: "Workspace access" })).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Manual onboarding handoff")).toBeVisible();
    const acceptInviteLink = page.getByRole("link", { name: "Open accept-invitation" }).first();
    await expect(acceptInviteLink).toBeVisible();
    await acceptInviteLink.click();

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

    await expect(page).toHaveURL(/\/members\?/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    const verificationLink = page.getByRole("link", { name: "Capture verification evidence" }).first();
    await expect(verificationLink).toBeVisible();
    await verificationLink.click();

    await expect(page).toHaveURL(/\/verification\?/);
    await expect(page).toHaveURL(/surface=verification/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_track_key=verification/);
    await expect(page).toHaveURL(/recent_update_kind=verification/);
    await expect(page).toHaveURL(/evidence_count=2/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
    await expect(page.getByText("Verification evidence lane")).toBeVisible();
    const goLiveLink = page.getByRole("link", { name: "Continue to go-live drill" }).first();
    await expect(goLiveLink).toBeVisible();
    await goLiveLink.click();

    await expect(page).toHaveURL(/\/go-live\?/);
    await expect(page).toHaveURL(/surface=go_live/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_track_key=verification/);
    await expect(page).toHaveURL(/recent_update_kind=verification/);
    await expect(page).toHaveURL(/evidence_count=2/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
    await expect(page.getByText("Session-aware drill lane")).toBeVisible();
    const settingsLink = page.getByRole("link", { name: "Review billing + settings" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    await expect(page).toHaveURL(/\/settings\?/);
    await expect(page).toHaveURL(/intent=manage-plan/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Workspace configuration" })).toBeVisible();
    const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
    await expect(adminReturnLink).toBeVisible();
    await adminReturnLink.click();

    await expect(page).toHaveURL(/\/admin\?/);
    await expect(page).toHaveURL(/readiness_returned=1/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
    await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
    await expect(page.getByText("Focus restored")).toBeVisible();
    await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
  },
);
