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
    case "download":
      await import("./flow/flow_download_worker");
      return;
    case "download-nonblocking":
      await import("./flow/flow_nonblocking_download_worker");
      return;
    case "wait-renders":
      await import("./flow/flow_wait_for_new_renders");
      return;
    default:
      throw new Error(
        "Usage: --action=probe|submit-batch|download|download-nonblocking|wait-renders",
      );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
