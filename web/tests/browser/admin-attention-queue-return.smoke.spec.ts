import { expect, test } from "@playwright/test";

test("admin attention branch -> verification -> admin keeps minimal browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?queue_surface=verification");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent delivery activity" })).toBeVisible();

  const recentDeliverySection = page
    .getByRole("heading", { name: "Recent delivery activity" })
    .locator("xpath=ancestor::*[.//button][1]");
  const openVerificationButton = recentDeliverySection
    .getByRole("button", { name: "Open verification checklist" })
    .first();
  await expect(openVerificationButton).toBeVisible();

  await openVerificationButton.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/source=admin-attention/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();

  const verificationUrl = new URL(page.url());
  const workspaceSlug = verificationUrl.searchParams.get("attention_workspace");
  const organizationId = verificationUrl.searchParams.get("attention_organization");
  const deliveryContext = verificationUrl.searchParams.get("delivery_context");
  const recentUpdateKind = verificationUrl.searchParams.get("recent_update_kind");
  const evidenceCount = verificationUrl.searchParams.get("evidence_count");
  const recentOwnerLabel =
    verificationUrl.searchParams.get("recent_owner_display_name") ??
    verificationUrl.searchParams.get("recent_owner_label");
  expect(workspaceSlug).toBeTruthy();
  expect(organizationId).toBeTruthy();
  expect(deliveryContext).toBe("recent_activity");
  expect(recentUpdateKind).toBeTruthy();
  expect(evidenceCount).toBeTruthy();

  if (recentOwnerLabel) {
    await expect(page.getByText(`Last updated by ${recentOwnerLabel}`)).toBeVisible();
  }

  const adminQueueReturnLink = page
    .locator('a[href*="queue_returned=1"][href*="queue_surface=verification"]')
    .filter({ hasText: "Return to admin queue" })
    .first();
  await expect(adminQueueReturnLink).toBeVisible();

  await adminQueueReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/queue_surface=verification/);
  await expect(page).toHaveURL(/queue_returned=1/);
  await expect(page).toHaveURL(/delivery_context=recent_activity/);
  await expect(page).toHaveURL(new RegExp(`recent_update_kind=${recentUpdateKind}`));
  await expect(page).toHaveURL(new RegExp(`evidence_count=${evidenceCount}`));
  await expect(page).toHaveURL(new RegExp(`attention_workspace=${workspaceSlug}`));
  await expect(page).toHaveURL(new RegExp(`attention_organization=${organizationId}`));
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Admin queue focus restored")).toBeVisible();
  await expect(page.getByText("Focused return").first()).toBeVisible();
});
