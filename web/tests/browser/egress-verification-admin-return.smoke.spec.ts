import { expect, test } from "@playwright/test";

const egressEntry =
  "/egress?source=admin-readiness&week8_focus=credentials&attention_workspace=egress-demo&attention_organization=org_egress&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=1&recent_owner_display_name=Egress%20Operator&recent_owner_email=egress.operator%40govrail.test";

test("egress -> verification -> admin keeps readiness return continuity", async ({ page }) => {
  test.slow();

  await page.goto(egressEntry);

  await expect(page.getByRole("heading", { name: "Outbound permission control" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit export continuity" })).toBeVisible();
  await expect(page.getByText(/Navigation-only manual relay/)).toBeVisible();

  const verificationLink = page.getByRole("link", { name: "Continue verification evidence" }).first();
  await expect(verificationLink).toBeVisible();
  await verificationLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=egress-demo/);
  await expect(page).toHaveURL(/attention_organization=org_egress/);
  await expect(page).toHaveURL(/recent_track_key=verification/);
  await expect(page).toHaveURL(/recent_update_kind=verification/);
  await expect(page).toHaveURL(/evidence_count=1/);
  await expect(page).toHaveURL(/recent_owner_display_name=Egress(?:\+|%20)Operator/);
  await expect(page).toHaveURL(/recent_owner_email=egress\.operator(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Verification evidence lane")).toBeVisible();
  await expect(page.getByText("Focus Credentials")).toBeVisible();

  const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReturnLink).toBeVisible();
  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=egress-demo/);
  await expect(page).toHaveURL(/attention_organization=org_egress/);
  await expect(page).toHaveURL(/recent_owner_display_name=Egress(?:\+|%20)Operator/);
  await expect(page).toHaveURL(/recent_owner_email=egress\.operator(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
