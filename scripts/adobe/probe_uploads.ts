import fs from "node:fs";
import path from "node:path";
import { connectBrowser, getOrOpenPage } from "C:/Users/11/browser-automation-core/browser_core";
import { REPORTS_DIR, ROOT } from "../project_paths";
import { DEFAULT_ADOBE_SELECTORS, saveAdobeSelectors } from "./selector_cache";
import { moveJsonReportIfPresent } from "../common/logging";

const TARGET_URL = "https://contributor.stock.adobe.com/en/uploads";
const OUTPUT = path.join(REPORTS_DIR, "adobe_uploads_probe.json");
const LEGACY_OUTPUT = path.join(ROOT, "logs", "adobe_uploads_probe.json");

async function main(): Promise<void> {
  moveJsonReportIfPresent(LEGACY_OUTPUT, OUTPUT);
  const browser = await connectBrowser(9222);
  try {
    const page = await getOrOpenPage(browser, "contributor.stock.adobe.com/en/uploads", TARGET_URL);
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded");

    saveAdobeSelectors(DEFAULT_ADOBE_SELECTORS);

    const data = await page.evaluate((selectors) => ({
      title: document.title,
      url: location.href,
      footerText: document.querySelector(selectors.footer)?.textContent?.trim() ?? "",
      thumbnailCount: document.querySelectorAll(selectors.gridThumbnails).length,
      bodyTextSample: document.body.innerText.slice(0, 5000),
      selectors,
    }), DEFAULT_ADOBE_SELECTORS);

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(OUTPUT);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
