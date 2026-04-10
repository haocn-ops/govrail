import type { Locator, Page } from "@playwright/test";

function hrefFragmentSelector(fragment: string): string {
  return `[href*=${JSON.stringify(fragment)}]`;
}

export function linkByHrefFragments(page: Page, text: string, ...hrefFragments: string[]): Locator {
  const selector = hrefFragments.map(hrefFragmentSelector).join("");
  return page.locator(`a${selector}`).filter({ hasText: text }).first();
}
