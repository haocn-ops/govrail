import { expect, test } from "@playwright/test";

const serviceAccountsEntry =
  "/service-accounts?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery.ops%40govrail.test";

test("service-accounts -> go-live -> admin keeps readiness return continuity", async ({ page }) => {
  test.slow();

  await page.goto(serviceAccountsEntry);

  await expect(page.getByRole("heading", { name: "Machine identities" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit export continuity" })).toBeVisible();
  const goLiveLink = page.getByRole("link", { name: "Reopen go-live drill" }).first();
  await expect(goLiveLink).toBeVisible();
  await goLiveLink.click();

  await expect(page).toHaveURL(/\/go-live\?/);
  await expect(page).toHaveURL(/surface=go_live/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/recent_track_key=go_live/);
  await expect(page).toHaveURL(/recent_update_kind=go_live/);
  await expect(page).toHaveURL(/evidence_count=2/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "Mock go-live drill" })).toBeVisible();
  await expect(page.getByText("Session-aware drill lane")).toBeVisible();
  await expect(page.getByText("Focus Credentials")).toBeVisible();

  const adminReturnLink = page.getByRole("link", { name: "Return to admin readiness view" }).first();
  await expect(adminReturnLink).toBeVisible();
  await adminReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=credentials/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/recent_owner_display_name=Avery(?:\+|%20)Ops/);
  await expect(page).toHaveURL(/recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
