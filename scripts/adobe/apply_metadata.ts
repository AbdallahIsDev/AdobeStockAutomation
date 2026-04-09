import path from "node:path";
import { connectAdobeStock, disconnectStagehand } from "./adobe_skill";
import {
  REPORTS_DIR,
  ROOT,
} from "../project_paths";
import { jsonTimestamp } from "../common/time";
import { appendAutomationLog, moveJsonReportIfPresent } from "../common/logging";
import { loadAdobeSelectors } from "./adobe_selectors";
import {
  CHECK_ONLY,
  TARGET_DATE,
  TARGET_TOKEN,
  PAGE_LIMIT,
  ITEM_LIMIT,
  ONLY_NAME,
  findMatch,
  buildSidecarIndex,
  writeJson,
} from "./apply_metadata_logic";
import { prepareMetadataPlan } from "./apply_metadata_plan";
import {
  ensureNewTab,
  selectThumbnail,
  readPanelState,
  applyMetadata,
  clickNextPage,
} from "./apply_metadata_browser";

const REPORT_PATH = path.join(REPORTS_DIR, "adobe_apply_report.json");
const LEGACY_REPORT_PATH = path.join(ROOT, "logs", "adobe_apply_report.json");

export async function main(): Promise<void> {
  const { browser, page } = await connectAdobeStock();
  moveJsonReportIfPresent(LEGACY_REPORT_PATH, REPORT_PATH);
  const report = {
    started_at: jsonTimestamp(),
    target_date: TARGET_DATE,
    checked: 0,
    updated: 0,
    rebuilt: 0,
    skipped: 0,
    failed: 0,
    pages_processed: 0,
    items_processed: 0,
    errors: [] as string[],
  };

  try {
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded");

    const selectors = loadAdobeSelectors();
    await ensureNewTab(page, selectors);

    const sidecarIndex = buildSidecarIndex();
    let pageNumber = 1;

    while (pageNumber <= PAGE_LIMIT && report.items_processed < ITEM_LIMIT) {
      const thumbCount = await page.locator(selectors.gridThumbnails ?? "").count();
      let previousOriginalName: string | null = null;

      for (let index = 0; index < thumbCount && report.items_processed < ITEM_LIMIT; index += 1) {
        try {
          const originalName = await selectThumbnail(page, selectors, index, previousOriginalName);
          previousOriginalName = originalName;

          if (!originalName.includes(TARGET_TOKEN)) {
            report.skipped += 1;
            appendAutomationLog(`Adobe metadata skipped for ${originalName} because it is outside ${TARGET_DATE}.`, "INFO");
            continue;
          }
          if (ONLY_NAME && originalName !== ONLY_NAME) {
            report.skipped += 1;
            continue;
          }

          report.items_processed += 1;
          if (report.items_processed > ITEM_LIMIT) {
            break;
          }

          const panelState = await readPanelState(page, selectors);
          const match = findMatch(sidecarIndex, originalName);

          if (match.sidecar.status === "analysis_failed") {
            report.skipped += 1;
            appendAutomationLog(`Adobe metadata skipped for ${originalName} because File 03 marked analysis_failed.`, "WARN");
            continue;
          }

          const plan = prepareMetadataPlan(originalName, match, panelState);
          report.checked += 1;
          if (plan.action === "update_from_sidecar") {
            report.updated += 1;
          }
          if (plan.action === "rebuilt_from_current" || plan.action === "rebuilt_from_fallback") {
            report.rebuilt += 1;
          }

          await applyMetadata(page, selectors, originalName, plan);
        } catch (error) {
          report.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          report.errors.push(`Page ${pageNumber}, item ${index + 1}: ${message}`);
          appendAutomationLog(`Adobe metadata failed on page ${pageNumber}, item ${index + 1}: ${message}`, "ERROR");
        }
      }

      report.pages_processed += 1;
      if (!(await clickNextPage(page))) {
        break;
      }
      pageNumber += 1;
    }
  } finally {
    writeJson(REPORT_PATH, { ...report, ended_at: jsonTimestamp() });
    appendAutomationLog(
      `Adobe metadata ${CHECK_ONLY ? "check" : "apply"} summary for ${TARGET_DATE}: ${report.checked} checked | ${report.updated} updated | ${report.rebuilt} rebuilt | ${report.skipped} skipped | ${report.failed} failed.`,
      report.failed > 0 ? "WARN" : "SUCCESS",
    );
    await disconnectStagehand();
    void browser;
  }
}
