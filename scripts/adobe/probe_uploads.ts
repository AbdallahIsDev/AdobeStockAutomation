import fs from "node:fs";
import path from "node:path";
import { connectBrowser, getOrOpenPage, isDebugPortReady } from "@bac/browser_core";
import { REPORTS_DIR, ROOT } from "../project_paths";
import { moveJsonReportIfPresent } from "../common/logging";

const TARGET_URL = "https://contributor.stock.adobe.com/en/uploads";
const OUTPUT = path.join(REPORTS_DIR, "adobe_uploads_probe.json");
const LEGACY_OUTPUT = path.join(ROOT, "logs", "adobe_uploads_probe.json");

async function main(): Promise<void> {
  moveJsonReportIfPresent(LEGACY_OUTPUT, OUTPUT);

  if (!(await isDebugPortReady(9222))) {
    throw new Error("CDP port 9222 is not ready.");
  }

  const browser = await connectBrowser(9222);
  try {
    const page = await getOrOpenPage(browser, "contributor.stock.adobe.com/en/uploads", TARGET_URL);
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded");

    const data = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      footerText: document.querySelector("[data-t='asset-sidebar-footer']")?.textContent?.trim() ?? "",
      thumbnailCount: document.querySelectorAll("[data-t='assets-content-grid'] img[alt='thumbnail']").length,
      bodyTextSample: document.body.innerText.slice(0, 5000),
    }));

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(OUTPUT);
  } finally {
    void browser;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
