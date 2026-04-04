import { expect, test } from "@playwright/test";

test("admin focus chips clear one dimension at a time without dropping broader governance continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto(
    "/admin?queue_surface=verification&attention_organization=org_preview&attention_workspace=preview&queue_returned=1",
  );

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  const governanceFocusSection = page
    .getByRole("heading", { name: "Governance focus" })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  await expect(governanceFocusSection).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Returned from follow-up").first()).toBeVisible();
  await expect(governanceFocusSection.getByRole("link", { name: "Clear all focus" })).toBeVisible();

  const workspaceChip = governanceFocusSection
    .getByText("Workspace", { exact: true })
    .locator("xpath=ancestor::div[1]");
  await expect(workspaceChip).toBeVisible();
  await expect(workspaceChip.getByText("Preview Workspace", { exact: true })).toBeVisible();
  await workspaceChip.getByRole("link", { name: "Clear" }).click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/queue_surface=verification/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).toHaveURL(/queue_returned=1/);
  await expect(page).not.toHaveURL(/attention_workspace=preview/);
  await expect(governanceFocusSection.getByText("Preview Organization").first()).toBeVisible();
  await expect(governanceFocusSection.getByText("Preview Workspace")).toHaveCount(0);

  const followUpReturnChip = governanceFocusSection
    .getByText("Follow-up return", { exact: true })
    .locator("xpath=ancestor::div[1]");
  await expect(followUpReturnChip).toBeVisible();
  await expect(followUpReturnChip.getByText("Returned from follow-up", { exact: true })).toBeVisible();
  await followUpReturnChip.getByRole("link", { name: "Clear" }).click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/queue_surface=verification/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page).not.toHaveURL(/queue_returned=1/);
  await expect(page.getByText("Admin queue focus restored")).toHaveCount(0);

  const organizationChip = governanceFocusSection
    .getByText("Organization", { exact: true })
    .locator("xpath=ancestor::div[1]");
  await expect(organizationChip).toBeVisible();
  await expect(organizationChip.getByText("Preview Organization", { exact: true })).toBeVisible();
  await organizationChip.getByRole("link", { name: "Clear" }).click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/queue_surface=verification/);
  await expect(page).not.toHaveURL(/attention_organization=org_preview/);
  await expect(governanceFocusSection.getByText("Preview Organization")).toHaveCount(0);
  await expect(governanceFocusSection.getByText("Verification").first()).toBeVisible();

  const clearAllFocusLink = page.getByRole("link", { name: "Clear all focus" });
  await expect(clearAllFocusLink).toBeVisible();
  await clearAllFocusLink.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
});
