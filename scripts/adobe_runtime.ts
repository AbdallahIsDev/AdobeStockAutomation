import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { connectAdobeStock, probeUploadQueue, disconnectStagehand } from "./adobe/adobe_skill";
import { main as applyMetadataMain } from "./adobe/apply_metadata";
import { REPORTS_DIR } from "./project_paths";

function readAction(): string {
  const actionArg = process.argv.find((arg) => arg.startsWith("--action="));
  return actionArg?.split("=", 2)[1]?.trim().toLowerCase() ?? "";
}

const PROBE_OUTPUT = path.join(REPORTS_DIR, "adobe_uploads_probe.json");

async function runProbe(): Promise<void> {
  const { page, stagehand } = await connectAdobeStock();
  try {
    const result = await probeUploadQueue(page);
    fs.mkdirSync(path.dirname(PROBE_OUTPUT), { recursive: true });
    fs.writeFileSync(PROBE_OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(PROBE_OUTPUT);
    if (!result.success) {
      throw new Error(("error" in result ? result.error : undefined) ?? "Probe failed.");
    }
  } finally {
    await disconnectStagehand();
  }
}

async function runApply(): Promise<void> {
  try {
    await applyMetadataMain();
  } finally {
    await disconnectStagehand();
  }
}

async function main(): Promise<void> {
  const action = readAction();

  switch (action) {
    case "probe":
      await runProbe();
      return;
    case "repair-sidecars":
      await import("./adobe/repair_sidecars");
      return;
    case "check":
      process.env.ADOBE_APPLY_MODE = "check";
      await runApply();
      return;
    case "apply":
      process.env.ADOBE_APPLY_MODE = "apply";
      await runApply();
      return;
    default:
      throw new Error(
        "Usage: --action=probe|repair-sidecars|check|apply [--date=YYYY-MM-DD] [--page-limit=N] [--item-limit=N] [--only-name=FILE]",
      );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
