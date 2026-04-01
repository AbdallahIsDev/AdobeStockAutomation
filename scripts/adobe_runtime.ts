function readAction(): string {
  const actionArg = process.argv.find((arg) => arg.startsWith("--action="));
  return actionArg?.split("=", 2)[1]?.trim().toLowerCase() ?? "";
}

async function main(): Promise<void> {
  const action = readAction();

  switch (action) {
    case "probe":
      await import("./adobe/probe_uploads");
      return;
    case "repair-sidecars":
      await import("./adobe/repair_sidecars");
      return;
    case "check":
      process.env.ADOBE_APPLY_MODE = "check";
      await import("./adobe/apply_metadata");
      return;
    case "apply":
      process.env.ADOBE_APPLY_MODE = "apply";
      await import("./adobe/apply_metadata");
      return;
    default:
      throw new Error("Usage: --action=probe|repair-sidecars|check|apply [--date=YYYY-MM-DD] [--page-limit=N] [--item-limit=N] [--only-name=FILE]");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
