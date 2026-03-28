import { connectBrowser, findPageByUrl, isDebugPortReady } from "../../../../../browser-automation-core/browser_core";

async function main(): Promise<void> {
  const shouldOpenSettings = process.argv.includes("--open-settings");
  const shouldOpenModelMenu = process.argv.includes("--open-model-menu");
  const shouldDismissToast = shouldOpenSettings || process.argv.includes("--dismiss-toast");
  if (!(await isDebugPortReady(9222))) {
    throw new Error("CDP port 9222 is not ready.");
  }

  const browser = await connectBrowser(9222);
  try {
    const page = findPageByUrl(browser, "/fx/tools/flow/project/");
    if (!page) {
      throw new Error("Flow project page not found.");
    }

    await page.bringToFront();

    if (shouldDismissToast) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const dismiss = buttons.find((button) => (button.textContent || "").includes("Dismiss"));
        (dismiss as HTMLButtonElement | undefined)?.click();
      });
      await page.waitForFunction(
        () => !document.body.innerText.includes("Upscaling complete, your image has been downloaded!"),
        undefined,
        { timeout: 2000 },
      ).catch(() => undefined);
    }

    if (shouldOpenSettings) {
      await page.locator("button").filter({ hasText: "Nano Banana 2" }).first().click({ timeout: 3000 });
      await page.waitForFunction(
        () => document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], [role=\"tab\"], [role=\"radio\"]").length > 0,
        undefined,
        { timeout: 2000 },
      ).catch(() => undefined);
    }

    if (shouldOpenModelMenu) {
      if (!shouldOpenSettings) {
        await page.locator("button").filter({ hasText: "Nano Banana 2" }).first().click({ timeout: 3000 });
        await page.waitForFunction(
          () => document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], [role=\"tab\"], [role=\"radio\"]").length > 0,
          undefined,
          { timeout: 2000 },
        ).catch(() => undefined);
      }

      await page.locator("button").filter({ hasText: "arrow_drop_down" }).first().click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], [role=\"radio\"], button"))
          .some((node) => (node.textContent || "").includes("Nano Banana")),
        undefined,
        { timeout: 2000 },
      ).catch(() => undefined);
    }

    const snapshot = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

      const buttons = Array.from(document.querySelectorAll("button")).map((button, index) => ({
        index,
        text: normalize((button as HTMLButtonElement).innerText),
        ariaLabel: normalize(button.getAttribute("aria-label")),
        title: normalize(button.getAttribute("title")),
        disabled: (button as HTMLButtonElement).disabled,
        dataset: { ...button.dataset },
      }));

      const textboxes = Array.from(document.querySelectorAll("[role=\"textbox\"], textarea")).map((node, index) => {
        const element = node as HTMLElement & { value?: string };
        return {
          index,
          tag: element.tagName.toLowerCase(),
          text: normalize(element.innerText),
          value: normalize(element.value),
          ariaLabel: normalize(element.getAttribute("aria-label")),
          placeholder: normalize(element.getAttribute("placeholder")),
          slateEditor: normalize(element.getAttribute("data-slate-editor")),
        };
      });

      const menuish = Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], [role=\"tab\"], [role=\"radio\"]")).map((node, index) => ({
        index,
        role: normalize(node.getAttribute("role")),
        text: normalize(node.textContent),
        ariaChecked: normalize(node.getAttribute("aria-checked")),
        ariaSelected: normalize(node.getAttribute("aria-selected")),
      }));

      const generatedCards = Array.from(document.querySelectorAll("img[alt=\"Generated image\"]")).slice(0, 12).map((image, index) => {
        const src = image.getAttribute("src") || "";
        let mediaName = "";
        try {
          mediaName = new URL(src, window.location.href).searchParams.get("name") || "";
        } catch {
          mediaName = "";
        }
        const tile = image.closest("[data-tile-id]");
        const cardText = normalize(tile?.textContent || image.parentElement?.textContent || "");
        return {
          index,
          mediaName,
          tileId: tile?.getAttribute("data-tile-id") || "",
          href: image.closest("a")?.getAttribute("href") || "",
          cardText: cardText.slice(0, 500),
        };
      });

      return {
        url: window.location.href,
        title: document.title,
        bodySnippet: normalize(document.body.innerText).slice(0, 4000),
        buttons,
        textboxes,
        menuish,
        generatedCards,
      };
    });

    console.log(JSON.stringify(snapshot, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
