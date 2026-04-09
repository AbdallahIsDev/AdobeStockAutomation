import "dotenv/config";

function readAction(): string {
  const actionArg = process.argv.find((arg) => arg.startsWith("--action="));
  return actionArg?.split("=", 2)[1]?.trim().toLowerCase() ?? "";
}

async function main(): Promise<void> {
  const action = readAction();

  switch (action) {
    case "probe":
      await import("./flow/flow_probe");
      return;
    case "submit-batch":
      await import("./flow/flow_batch_submit_worker");
      return;
    case "run-session":
      await import("./flow/flow_run_session");
      return;
    case "download":
    case "download-nonblocking":
      await import("./flow/flow_nonblocking_download_worker");
      return;
    case "download-recovery":
      await import("./flow/flow_download_worker");
      return;
    case "wait-renders":
      await import("./flow/flow_wait_for_new_renders");
      return;
    case "retry-failed":
      await import("./flow/flow_retry_failed_prompts");
      return;
    case "recover-failures":
      await import("./flow/flow_recover_failures");
      return;
    case "repair-sidecars":
      await import("./flow/flow_repair_sidecars");
      return;
    case "reconcile-downloads":
      await import("./flow/flow_reconcile_downloads");
      return;
    default:
      throw new Error(
        "Usage: --action=probe|submit-batch|run-session|download|download-nonblocking|download-recovery|wait-renders|retry-failed|recover-failures|repair-sidecars|reconcile-downloads",
      );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
