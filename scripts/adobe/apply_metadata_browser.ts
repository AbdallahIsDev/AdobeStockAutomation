import type { Page } from "playwright";
import { smartClick, smartFill, waitForElement } from "@bac/browser_core";
import { jsonTimestamp } from "../common/time";
import { appendAutomationLog } from "../common/logging";
import type { AdobeSelectorMap } from "./adobe_selectors";
import type {
  AdobeMetadata,
  MatchResult,
  MetadataPlan,
  PanelState,
  Sidecar,
} from "./apply_metadata_types";
import {
  CHECK_ONLY,
  writeJson,
} from "./apply_metadata_logic";
import { upsertRegistry } from "./apply_metadata_plan";

export async function ensureNewTab(page: Page, selectors: AdobeSelectorMap): Promise<void> {
  await waitForElement(page, selectors.newTab ?? "", 10000);
  await smartClick(page, selectors.newTab ?? "");
  await page.waitForLoadState("domcontentloaded");
}

export async function extractOriginalName(page: Page, selectors: AdobeSelectorMap): Promise<string> {
  const footerText = (await page.locator(selectors.footer ?? "").innerText()).trim();
  const match = footerText.match(/Original name\(s\):\s*([^\n]+?)(?:\s*Actions:|$)/i);
  if (!match?.[1]) {
    throw new Error(`Could not parse original name from Adobe footer: ${footerText}`);
  }
  return match[1].trim();
}

async function readSelectedOption(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((node) => {
    const select = node as HTMLSelectElement;
    return select.selectedOptions[0]?.textContent?.trim() ?? "";
  });
}

async function getKeywordSuggestions(page: Page, selectors: AdobeSelectorMap): Promise<string[]> {
  return page.locator(`${selectors.keywordSuggestionsGroup ?? ""} button`).evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? "").filter((value) => value.length > 0),
  );
}

async function getCurrentKeywords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("button"))
      .map((node) => (node.textContent ?? "").trim())
      .filter((value) => /remove keyword$/i.test(value))
      .map((value) => value.replace(/remove keyword$/i, "").trim())
      .filter((value) => value.length > 0);
  });
}

export async function readPanelState(page: Page, selectors: AdobeSelectorMap): Promise<PanelState> {
  const originalName = await extractOriginalName(page, selectors);
  return {
    originalName,
    currentTitle: await page.locator(selectors.titleInput ?? "").inputValue().catch(() => ""),
    currentKeywords: await getCurrentKeywords(page),
    currentCategory: await readSelectedOption(page, `select[name="category"]`).catch(() => ""),
    currentFileType: await readSelectedOption(page, `select[name="contentType"]`).catch(() => ""),
    currentLanguage: await readSelectedOption(page, `select[name="language"]`).catch(() => ""),
    keywordSuggestions: await getKeywordSuggestions(page, selectors),
    aiChecked: await page.locator(selectors.aiCheckbox ?? "").isChecked().catch(() => false),
    fictionalChecked: await page.locator(selectors.fictionalCheckbox ?? "").isChecked().catch(() => false),
  };
}

export async function selectThumbnail(page: Page, selectors: AdobeSelectorMap, index: number, previousOriginalName: string | null): Promise<string> {
  const thumb = page.locator(selectors.gridThumbnails ?? "").nth(index);
  await thumb.scrollIntoViewIfNeeded();
  await thumb.click({ timeout: 10000 });
  await page.waitForFunction(
    ({ selector, previous }) => {
      const footer = document.querySelector(selector);
      if (!footer) {
        return false;
      }
      const text = footer.textContent ?? "";
      const match = text.match(/Original name\(s\):\s*([^\n]+?)(?:\s*Actions:|$)/i);
      if (!match?.[1]) {
        return false;
      }
      const current = match[1].trim();
      return previous ? current !== previous : current.length > 0;
    },
    { selector: selectors.footer ?? "", previous: previousOriginalName },
    { timeout: 10000 },
  );
  return extractOriginalName(page, selectors);
}

async function setSelectLabel(page: Page, selector: string, label: string): Promise<void> {
  const options = await page.locator(`${selector} option`).evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").trim()).filter((value) => value.length > 0),
  );
  const target = options.find((option) => option.toLowerCase() === label.trim().toLowerCase())
    ?? options.find((option) => option.toLowerCase().includes(label.trim().toLowerCase()))
    ?? null;
  if (!target) {
    throw new Error(`Select option not found for ${selector}: ${label}. Available: ${options.join(", ")}`);
  }
  await page.selectOption(selector, { label: target });
}

async function setCheckbox(page: Page, selector: string, checked: boolean): Promise<void> {
  const locator = page.locator(selector);
  if ((await locator.count()) === 0) {
    return;
  }
  if ((await locator.isChecked()) !== checked) {
    await locator.click();
  }
}

async function setKeywords(page: Page, selectors: AdobeSelectorMap, keywords: string[]): Promise<void> {
  if ((await page.locator(selectors.eraseKeywordsButton ?? "").count()) > 0) {
    await smartClick(page, selectors.eraseKeywordsButton ?? "");
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return !el || el.value.trim() === "";
      },
      selectors.keywordsTextarea ?? "",
      { timeout: 3000 },
    ).catch(() => undefined);
  }
  await smartFill(page, selectors.keywordsTextarea ?? "", keywords.join(", "));
}

export async function applyMetadata(page: Page, selectors: AdobeSelectorMap, originalName: string, plan: MetadataPlan): Promise<void> {
  const metadata = plan.desiredMetadata;
  if (!metadata.title || !metadata.keywords || metadata.keywords.length < 5 || !metadata.category) {
    throw new Error(`Incomplete metadata for ${originalName}`);
  }

  if (plan.needsApply && !CHECK_ONLY) {
    const fields = plan.applyFields;
    let changed = false;

    if (fields.language) {
      await setSelectLabel(page, `select[name="language"]`, "English");
      changed = true;
    }
    if (fields.fileType) {
      await setSelectLabel(page, `select[name="contentType"]`, metadata.file_type ?? "Photos");
      changed = true;
    }
    if (fields.category) {
      await setSelectLabel(page, `select[name="category"]`, metadata.category);
      changed = true;
    }

    if (fields.aiDisclosure || fields.fictional) {
      await setCheckbox(page, selectors.aiCheckbox ?? "", Boolean(metadata.created_with_ai));
      if (metadata.created_with_ai) {
        await waitForElement(page, selectors.fictionalCheckbox ?? "", 3000).catch(() => undefined);
        await setCheckbox(page, selectors.fictionalCheckbox ?? "", Boolean(metadata.people_are_fictional || metadata.property_is_fictional));
      } else if ((await page.locator(selectors.releasesNo ?? "").count()) > 0) {
        await page.evaluate((selector) => {
          const input = document.querySelector(selector) as HTMLInputElement | null;
          if (input) {
            input.click();
          }
        }, selectors.releasesNo ?? "");
      }
      changed = true;
    }

    if (fields.title) {
      await smartFill(page, selectors.titleInput ?? "", metadata.title);
      changed = true;
    }
    if (fields.keywords) {
      await setKeywords(page, selectors, metadata.keywords);
      changed = true;
    }

    if (changed) {
      await smartClick(page, selectors.saveButton ?? "");
      await waitForElement(page, "[role='status'], [role='alert'], text=/saved/i", 8000).catch(() => undefined);
    }
  }

  if (plan.match.sidecarPath && !CHECK_ONLY) {
    const updated: Sidecar = {
      ...plan.match.sidecar,
      applied_to_adobe_stock: true,
      applied_at: jsonTimestamp(),
      status: "ready_for_upload",
      adobe_stock_metadata: {
        ...metadata,
        title_char_count: metadata.title.length,
        keyword_count: metadata.keywords.length,
      },
    };
    writeJson(plan.match.sidecarPath, updated);
    plan.match.sidecar = updated;
  }

  if (!CHECK_ONLY) {
    upsertRegistry(originalName, plan.match, plan.sourceType);
  }
  appendAutomationLog(
    `Adobe metadata ${CHECK_ONLY ? "checked" : (plan.action === "checked_only" ? "checked" : "updated")} for ${originalName} using ${plan.match.matchedBy}. Reason: ${plan.reason}.`,
    CHECK_ONLY || plan.action === "checked_only" ? "INFO" : "SUCCESS",
  );
}

export async function clickNextPage(page: Page): Promise<boolean> {
  const next = page.getByRole("link", { name: "Next" });
  if ((await next.count()) === 0) {
    return false;
  }
  if ((await next.getAttribute("aria-disabled")) === "true") {
    return false;
  }
  await next.click();
  await page.waitForLoadState("domcontentloaded");
  await waitForElement(page, "[data-t='assets-content-grid'] img[alt='thumbnail']", 5000).catch(() => undefined);
  return true;
}
