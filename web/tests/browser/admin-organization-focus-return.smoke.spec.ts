import { expect, test } from "@playwright/test";

test("admin organization focus branch -> verification -> admin keeps governance focus continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?queue_surface=verification&attention_organization=org_preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear all focus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attention by organization" })).toBeVisible();

  const organizationSection = page
    .getByRole("heading", { name: "Attention by organization" })
    .locator("xpath=following::*[.//button][1]");
  await expect(organizationSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(organizationSection.getByText("Focused organization", { exact: true })).toBeVisible();
  const openVerificationButton = organizationSection
    .getByRole("button", { name: "Open verification checklist" })
    .first();
  await expect(openVerificationButton).toBeVisible();

  await openVerificationButton.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/source=admin-attention/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();

  const verificationUrl = new URL(page.url());
  const workspaceSlug = verificationUrl.searchParams.get("attention_workspace");

  expect(workspaceSlug).toBeTruthy();
  expect(verificationUrl.searchParams.get("attention_organization")).toBe("org_preview");

  const adminQueueReturnLink = page
    .locator('a[href*="queue_returned=1"][href*="queue_surface=verification"]')
    .filter({ hasText: "Return to admin queue" })
    .first();
  await expect(adminQueueReturnLink).toBeVisible();

  await adminQueueReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/queue_surface=verification/);
  await expect(page).toHaveURL(/queue_returned=1/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(new RegExp(`attention_workspace=${workspaceSlug}`));
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Admin queue focus restored")).toBeVisible();
  await expect(
    page.getByText("Organization focus is preserved for this return path so the same governance cluster stays in view."),
  ).toBeVisible();
  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();

  const clearAllFocusLink = page.getByRole("link", { name: "Clear all focus" });
  await expect(clearAllFocusLink).toBeVisible();
  await clearAllFocusLink.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
});
