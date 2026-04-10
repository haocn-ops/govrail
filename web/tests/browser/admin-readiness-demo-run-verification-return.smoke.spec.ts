import { expect, test } from "@playwright/test";

import { linkByHrefFragments } from "./support/navigation";

test("admin readiness demo-run branch -> verification -> admin keeps readiness browser continuity", async ({
  page,
}) => {
  test.slow();

  await page.goto("/admin?week8_focus=demo_run&attention_organization=org_preview&attention_workspace=preview");

  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governance focus" })).toBeVisible();
  await expect(page.getByText("Demo run", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Preview Organization").first()).toBeVisible();
  await expect(page.getByText("Preview Workspace").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week 8 readiness summary" })).toBeVisible();
  await expect(page.getByText("Drill-down active: Demo run")).toBeVisible();

  const openWeek8ChecklistLink = linkByHrefFragments(
    page,
    "Open Week 8 checklist",
    "/verification?surface=verification",
    "week8_focus=demo_run",
  );
  await expect(openWeek8ChecklistLink).toBeVisible();
  await openWeek8ChecklistLink.click();

  await expect(page).toHaveURL(/\/verification\?/);
  await expect(page).toHaveURL(/surface=verification/);
  await expect(page).toHaveURL(/source=admin-readiness/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "Week 8 launch checklist" })).toBeVisible();
  await expect(page.getByText("Admin follow-up context")).toBeVisible();
  await expect(page.getByText("Focus Demo run")).toBeVisible();
  await expect(page.getByText("Verification evidence lane")).toBeVisible();

  const adminReadinessReturnLink = linkByHrefFragments(
    page,
    "Return to admin readiness view",
    "/admin?",
    "readiness_returned=1",
  );
  await expect(adminReadinessReturnLink).toBeVisible();
  await adminReadinessReturnLink.click();

  await expect(page).toHaveURL(/\/admin\?/);
  await expect(page).toHaveURL(/readiness_returned=1/);
  await expect(page).toHaveURL(/week8_focus=demo_run/);
  await expect(page).toHaveURL(/attention_workspace=preview/);
  await expect(page).toHaveURL(/attention_organization=org_preview/);
  await expect(page.getByRole("heading", { name: "SaaS admin overview" })).toBeVisible();
  await expect(page.getByText("Returned from Week 8 readiness")).toBeVisible();
  await expect(page.getByText("Focus restored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear readiness focus" }).first()).toBeVisible();
});
