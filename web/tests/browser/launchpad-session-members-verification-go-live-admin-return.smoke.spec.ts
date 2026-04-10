import { expect, test } from "@playwright/test";

import { linkByHrefFragments } from "./support/navigation";

const adminReadinessEntry =
  "/?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test(
  "launchpad -> session -> members -> verification -> go-live -> admin keeps readiness return continuity",
  async ({ page }) => {
    test.slow();

    await page.goto(adminReadinessEntry);

    await expect(page.getByRole("heading", { name: "SaaS Workspace Launch Hub" })).toBeVisible();
    const sessionCheckpointLink = linkByHrefFragments(page, "Return to session checkpoint", "/session");
    await expect(sessionCheckpointLink).toBeVisible();

    await sessionCheckpointLink.click();

    await expect(page).toHaveURL(/\/session\?/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Session and workspace access" })).toBeVisible();
    const membersLink = linkByHrefFragments(page, "Review members and access", "/members");
    await expect(membersLink).toBeVisible();

    await membersLink.click();

    await expect(page).toHaveURL(/\/members\?/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Workspace access" })).toBeVisible();
    await expect(page.getByText("Manual onboarding handoff")).toBeVisible();
    const verificationLink = linkByHrefFragments(
      page,
      "Capture verification evidence",
      "/verification?surface=verification",
    );
    await expect(verificationLink).toBeVisible();

    await verificationLink.click();

    await expect(page).toHaveURL(/\/verification\?/);
    await expect(page).toHaveURL(/surface=verification/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
    await expect(page.getByText("Verification evidence lane")).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Credentials")).toBeVisible();

    const goLiveLink = linkByHrefFragments(page, "Continue to go-live drill", "/go-live?surface=go_live");
    await expect(goLiveLink).toBeVisible();
    await goLiveLink.click();

    await expect(page).toHaveURL(/\/go-live\?/);
    await expect(page).toHaveURL(/surface=go_live/);
    await expect(page).toHaveURL(/source=admin-readiness/);
    await expect(page).toHaveURL(/week8_focus=credentials/);
    await expect(page).toHaveURL(/attention_workspace=preview/);
    await expect(page).toHaveURL(/attention_organization=org_demo/);
    await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
    await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
    await expect(page.getByText("Session-aware drill lane")).toBeVisible();
    await expect(page.getByText("Admin follow-up context")).toBeVisible();
    await expect(page.getByText("Focus Credentials")).toBeVisible();

    const adminReturnLink = linkByHrefFragments(
      page,
      "Return to admin readiness view",
      "/admin?",
      "readiness_returned=1",
    );
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
