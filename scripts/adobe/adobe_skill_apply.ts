import type { Page } from "playwright";
import { smartFill, waitForAny } from "@bac/browser_core";
import { act } from "@bac/stagehand_core";
import { resolveSelector } from "@bac/selector_store";
import {
  getAdobeSelectors,
  getAdobeSelectorsPath,
  selectorDescriptions,
} from "./adobe_selectors";
import { resultFromError } from "./adobe_skill_types";
import type { AdobeMetadata } from "./adobe_skill_types";

async function clickResolved(page: Page, key: keyof typeof selectorDescriptions): Promise<boolean> {
  const locator = await resolveSelector(page, key, getAdobeSelectors(), {
    descriptions: selectorDescriptions,
    jsonPath: getAdobeSelectorsPath(),
  });
  if (!locator) return false;
  return (await import("@bac/browser_core")).retryAction(
    async () => locator.click({ timeout: 3000 }), 2, 300,
  )
    .then(() => true)
    .catch((error: unknown) => {
      console.error(`[ADOBE] Click failed for ${String(key)}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
}

async function saveWork(page: Page) {
  try {
    await page.bringToFront();
    console.log("[ADOBE] Saving work.");
    if (!(await clickResolved(page, "saveButton"))) {
      await act(page, "Click the Save work button.");
    }
    const selectors = getAdobeSelectors();
    const conditions: string[] = ["[role='status']", "[role='alert']", "text=/saved/i", "text=/success/i"];
    if (selectors.successIndicator) conditions.unshift(selectors.successIndicator);
    const result = await waitForAny(page, conditions, 10000);
    if (!result) {
      console.warn("[ADOBE] Save confirmation indicator not detected; proceeding with fallback delay.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("[ADOBE] Work saved.");
    return { success: true };
  } catch (error: unknown) {
    return resultFromError(error);
  }
}

export async function applyImageMetadata(page: Page, metadata: AdobeMetadata) {
  try {
    await page.bringToFront();
    console.log("[ADOBE] Applying image metadata.");
    if (metadata.title) {
      if (!(await clickResolved(page, "titleInput"))) {
        await act(page, "Click the content title text input.");
      }
      if (!(await smartFill(page, getAdobeSelectors().titleInput ?? "", metadata.title, { commit: true }))) {
        await act(page, `Set the title to "${metadata.title}".`);
      }
    }
    if (metadata.keywords?.length) {
      if (!(await clickResolved(page, "eraseKeywordsButton"))) {
        await act(page, "Click the erase all keywords button.");
      }
      await page.waitForFunction(
        (sel) => { const el = document.querySelector(sel) as HTMLTextAreaElement | null; return !el || el.value.trim() === ""; },
        getAdobeSelectors().keywordsTextarea ?? "", { timeout: 3000 },
      ).catch(() => undefined);
      const keywordsStr = metadata.keywords.join(", ");
      if (!(await smartFill(page, getAdobeSelectors().keywordsTextarea ?? "", keywordsStr, { commit: true }))) {
        await act(page, `Type the keywords: ${keywordsStr}.`);
      }
      await page.waitForFunction(
        (sel) => { const el = document.querySelector(sel) as HTMLTextAreaElement | null; return el && el.value.trim().length > 0; },
        getAdobeSelectors().keywordsTextarea ?? "", { timeout: 3000 },
      ).catch(() => undefined);
    }
    if (metadata.created_with_ai !== undefined) {
      if (!(await clickResolved(page, "aiCheckbox"))) {
        await act(page, "Click the 'Created using generative AI tools' checkbox.");
      }
    }
    if (metadata.people_are_fictional !== undefined || metadata.property_is_fictional !== undefined) {
      if (!(await clickResolved(page, "fictionalCheckbox"))) {
        await act(page, "Click the 'People and Property are fictional' checkbox.");
      }
    }
    if (metadata.category) {
      if (!(await clickResolved(page, "categoryDropdown"))) {
        await act(page, "Open the category dropdown.");
      }
      await act(page, `Select the category "${metadata.category}".`);
    }
    const saveResult = await saveWork(page);
    if (!saveResult.success) return { success: false, error: `Failed to save metadata: ${saveResult.error}` };
    return { success: true };
  } catch (error: unknown) {
    return resultFromError(error);
  }
}
