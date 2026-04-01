import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { connectBrowser, getOrOpenPage, isDebugPortReady } from "../../../../../browser-automation-core/browser_core";
import { AUTOMATION_LOG_PATH, DATA_DIR, SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";
import { appendAutomationLog } from "../common/logging";

type SessionState = {
  current_project_url?: string;
  current_project_id?: string;
};

type FailureButton = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type ScanResult = {
  failedTileCount: number;
  retryButtons: FailureButton[];
  reuseButtons: FailureButton[];
};

const FLOW_RECOVERY_REPORT_PATH = path.join(DATA_DIR, "flow_recovery_report.json");
const CDP_PORT = 9222;

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(message: string): void {
  appendAutomationLog(message);
}

function getProjectUrl(session: SessionState): string {
  if (session.current_project_url) {
    return session.current_project_url;
  }
  if (session.current_project_id) {
    return `https://labs.google/fx/tools/flow/project/${session.current_project_id}`;
  }
  return "https://labs.google/fx/tools/flow";
}

async function scanFailures(page: Page): Promise<ScanResult> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button,[role=\"button\"]")) as HTMLElement[];
    let failedTileCount = 0;
    const retryButtons: FailureButton[] = [];
    const reuseButtons: FailureButton[] = [];
    for (const el of buttons) {
      const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim();
      const lower = text.toLowerCase();
      const rect = el.getBoundingClientRect();
      if (lower.includes("failed") && rect.width > 120 && rect.height > 120) {
        failedTileCount += 1;
      }
      if (lower.includes("retry") && rect.width <= 80 && rect.height <= 60) {
        retryButtons.push({ text, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
      if (lower.includes("reuse prompt") && rect.width >= 34 && rect.width <= 80 && rect.height <= 60) {
        reuseButtons.push({ text, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }
    return { failedTileCount, retryButtons, reuseButtons };
  });
}

async function clickSmallButtons(page: Page, mode: "retry" | "reuse"): Promise<number> {
  return page.evaluate((targetMode) => {
    const buttons = Array.from(document.querySelectorAll("button,[role=\"button\"]")) as HTMLElement[];
    const candidates = buttons.filter((el) => {
      const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
      const rect = el.getBoundingClientRect();
      if (rect.width > 80 || rect.height > 60) {
        return false;
      }
      if (targetMode === "retry") {
        return text.includes("retry");
      }
      return text.includes("reuse prompt") && rect.width >= 34;
    });
    for (const el of candidates) {
      el.click();
    }
    return candidates.length;
  }, mode);
}

async function main(): Promise<void> {
  if (!(await isDebugPortReady(CDP_PORT))) {
    throw new Error("Chrome debug port 9222 is not ready. Start the shared launch_browser.bat session first.");
  }

  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const browser = await connectBrowser(CDP_PORT);
  try {
    const page = await getOrOpenPage(browser, "labs.google/fx/tools/flow/project/", getProjectUrl(session));
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded");

    const before = await scanFailures(page);
    if (!before.failedTileCount) {
      appendLog("Flow recovery scan found no visible failed tiles.");
      writeJson(FLOW_RECOVERY_REPORT_PATH, {
        checked_at: jsonTimestamp(),
        project_url: page.url(),
        before,
        after_retry: before,
        after_reuse: before,
        action: "no_op",
      });
      return;
    }

    const retryClicked = await clickSmallButtons(page, "retry");
    await page.waitForTimeout(2000);
    const afterRetry = await scanFailures(page);

    let reuseClicked = 0;
    let afterReuse = afterRetry;
    if (afterRetry.failedTileCount > 0) {
      reuseClicked = await clickSmallButtons(page, "reuse");
      await page.waitForTimeout(2500);
      afterReuse = await scanFailures(page);
    }

    writeJson(FLOW_RECOVERY_REPORT_PATH, {
      checked_at: jsonTimestamp(),
      project_url: page.url(),
      before,
      retry_clicked: retryClicked,
      after_retry: afterRetry,
      reuse_clicked: reuseClicked,
      after_reuse: afterReuse,
    });

    appendLog(
      `Flow recovery handled visible failures. Before=${before.failedTileCount}, retry_clicked=${retryClicked}, after_retry=${afterRetry.failedTileCount}, reuse_clicked=${reuseClicked}, after_reuse=${afterReuse.failedTileCount}.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
