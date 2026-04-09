import type { Page } from "playwright";
import {
  connectBrowser,
  getOrOpenPage,
  isDebugPortReady,
  retryAction,
  waitForAny,
} from "@bac/browser_core";
import { connectStagehand, act } from "@bac/stagehand_core";
export { disconnectStagehand } from "@bac/stagehand_core";
import { resolveSelector } from "@bac/selector_store";
import {
  getAdobeSelectors,
  getAdobeSelectorsPath,
  selectorDescriptions,
} from "./adobe_selectors";
import {
  ADOBE_URL_PATTERN,
  ADOBE_OPEN_URL,
  resultFromError,
} from "./adobe_skill_types";
export type { AdobeSkillResult, AdobeConnection, AdobeMetadata } from "./adobe_skill_types";
export { applyImageMetadata } from "./adobe_skill_apply";

async function clickResolved(page: Page, key: keyof typeof selectorDescriptions): Promise<boolean> {
  const locator = await resolveSelector(page, key, getAdobeSelectors(), {
    descriptions: selectorDescriptions,
    jsonPath: getAdobeSelectorsPath(),
  });
  if (!locator) return false;
  return retryAction(async () => locator.click({ timeout: 3000 }), 2, 300)
    .then(() => true)
    .catch((error: unknown) => {
      console.error(`[ADOBE] Click failed for ${String(key)}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
}

export async function connectAdobeStock(port = 9222) {
  if (!(await isDebugPortReady(port))) throw new Error(`CDP port ${port} is not ready.`);
  const browser = await connectBrowser(port);
  const page = await getOrOpenPage(browser, ADOBE_URL_PATTERN, ADOBE_OPEN_URL);
  await page.bringToFront();
  const stagehand = await connectStagehand(port, ADOBE_URL_PATTERN);
  console.log("[ADOBE] Connected to Adobe Stock Contributor tab.");
  return { browser, page, stagehand };
}

export async function probeUploadQueue(page: Page) {
  try {
    await page.bringToFront();
    console.log("[ADOBE] Probing upload queue.");
    const data = await page.evaluate(() => {
      const thumbnailCount = document.querySelectorAll("[data-t='assets-content-grid'] img[alt='thumbnail']").length;
      const footerEl = document.querySelector("[data-t='asset-sidebar-footer']");
      return {
        title: document.title, url: location.href, thumbnailCount,
        footerText: footerEl?.textContent?.trim() ?? "",
        bodyTextSample: document.body.innerText.slice(0, 5000),
      };
    });
    console.log(`[ADOBE] Found ${data.thumbnailCount} thumbnails.`);
    return { success: true, data: data as Record<string, unknown> };
  } catch (error: unknown) {
    return resultFromError(error);
  }
}

export async function submitUpload(page: Page) {
  try {
    await page.bringToFront();
    console.log("[ADOBE] Submitting upload.");
    if (!(await clickResolved(page, "submitButton"))) {
      await act(page, "Click the submit or publish button.");
    }
    await clickResolved(page, "confirmUploadButton");
    const selectors = getAdobeSelectors();
    const conditions: string[] = ["[role='status']", "[role='alert']", "text=/success/i", "text=/submitted/i"];
    if (selectors.successIndicator) conditions.unshift(selectors.successIndicator);
    const result = await waitForAny(page, conditions, 15000);
    if (!result) throw new Error("Submit success indicator did not appear within timeout.");
    console.log("[ADOBE] Upload submitted successfully.");
    return { success: true };
  } catch (error: unknown) {
    return resultFromError(error);
  }
}

export async function selectThumbnail(page: Page, order: number) {
  try {
    await page.bringToFront();
    console.log(`[ADOBE] Selecting thumbnail #${order}.`);
    const thumbs = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll("[data-t='assets-content-grid'] img[alt='thumbnail']"));
      return images.map((img, index) => {
        const rect = img.getBoundingClientRect();
        return { index, top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      });
    });
    const sorted = thumbs.sort((a, b) => a.top - b.top || a.left - b.left);
    const target = sorted[order - 1];
    if (!target) throw new Error(`Thumbnail #${order} not found (${sorted.length} visible).`);
    const clicked = await page.evaluate((idx: number) => {
      const images = Array.from(document.querySelectorAll("[data-t='assets-content-grid'] img[alt='thumbnail']"));
      const sorted = images.sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      const target = sorted[idx];
      if (target) { (target as HTMLElement).click(); return true; }
      return false;
    }, target.index);
    if (!clicked) throw new Error("Failed to click the target thumbnail.");
    await waitForAny(page, [
      "[data-t='edit-asset-panel']", "[data-t='asset-detail-panel']",
      "[data-t='assets-edit']", "textarea", "[role='tabpanel']",
    ], 5000).catch(() => undefined);
    return { success: true };
  } catch (error: unknown) {
    return resultFromError(error);
  }
}
