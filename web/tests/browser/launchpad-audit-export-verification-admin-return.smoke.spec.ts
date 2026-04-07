import { expect, test } from "@playwright/test";

import { linkByHrefFragments } from "./support/navigation";

const adminReadinessEntry =
  "/?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("launchpad audit export -> verification -> admin keeps readiness continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto(adminReadinessEntry);

  await expect(page.getByRole("heading", { name: "SaaS Workspace Launch Hub" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit export continuity" })).toBeVisible();

  const verificationLink = linkByHrefFragments(
    page,
    "Carry proof to verification",
    "/verification?surface=verification",
    "source=admin-readiness",
    "recent_update_kind=verification",
  );
  await expect(verificationLink).toBeVisible();
  const adminReturnLink = linkByHrefFragments(
    page,
    "Return to admin readiness view",
    "/admin?",
    "readiness_returned=1",
    "recent_update_kind=verification",
  );
  await expect(adminReturnLink).toBeVisible();

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
  await expect(page.getByText("Admin follow-up context")).toBeVisible();

  const verificationAdminReturnLink = linkByHrefFragments(
    page,
    "Return to admin readiness view",
    "/admin?",
    "readiness_returned=1",
    "recent_update_kind=verification",
  );
  await expect(verificationAdminReturnLink).toBeVisible();
  await verificationAdminReturnLink.click();

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
});
