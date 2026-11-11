#!/usr/bin/env node
// Drives the editor's own controls for the clicked-control check.
//
// Every step here is a real mouse press at a real control's own coordinates,
// or an editor command run from the command palette. Nothing is dispatched to
// the facade and no DOM event is synthesised: the editor decides what each
// click means, exactly as it would for a person, and the check watches the
// facade's audit trail, the real child process, and the durable run record.
//
// The one concession to automation is the palette: the sessions list lives in
// a sidebar that is hidden by default, and a hidden control cannot be clicked.
// Revealing it by name is what a person would do through the same palette.
import fs from "node:fs";
import { launchChrome, attach, FINDER } from "./cdp.mjs";

const SETTLE_MS = 400;
const settle = (ms = SETTLE_MS) => new Promise((done) => setTimeout(done, ms));

export const DRIVER_NOTE =
  "Real mouse presses at the editor's own controls, dispatched into Chrome by " +
  "scripts/vscode-drive.mjs. No protocol action was dispatched by the check " +
  "and no DOM event was synthesised: the editor interpreted each click.";

export async function driveNativeControls({
  url,
  sessionTitle,
  log = () => {},
  screenshotDir,
  commandStarted = async () => true,
  timeoutMs = 120000,
}) {
  const chrome = await launchChrome({ url });
  const page = await attach(
    chrome.port,
    (target) => target.type === "page" && /127\.0\.0\.1/.test(target.url),
  );
  const shot = async (name) => {
    if (!screenshotDir) return;
    try {
      await page.send("Page.enable");
      const image = await page.send("Page.captureScreenshot", {
        format: "png",
      });
      fs.mkdirSync(screenshotDir, { recursive: true });
      fs.writeFileSync(
        screenshotDir + "/" + name + ".png",
        Buffer.from(image.data, "base64"),
      );
    } catch {}
  };
  const clicked = [];
  const click = async (text, selector, label) => {
    const box = await page.waitFor(
      "__avoozlFind(" +
        JSON.stringify(text) +
        ", " +
        JSON.stringify(selector) +
        ")",
      { label: label || text, timeoutMs },
    );
    const at = await page.clickCentre(box);
    clicked.push({
      control: label || text,
      label: box.label || undefined,
      at,
      size: { width: Math.round(box.width), height: Math.round(box.height) },
    });
    log("clicked " + (label || text) + " at " + at.x + "," + at.y);
    await settle();
    return box;
  };
  try {
    await page.waitFor("!!document.querySelector('.monaco-workbench')", {
      label: "the workbench to load",
      timeoutMs,
    });
    await settle(5000);
    await page.exec(FINDER);
    // The sessions list is in a sidebar that is off by default.
    await page.command("Show Agent Sessions Sidebar", { settleMs: 2500 });
    await shot("01-sessions");

    await click(sessionTitle, ".monaco-list-row", "the session in the list");
    await settle(6000);
    await shot("02-transcript");

    await click(
      "Allow once",
      ".monaco-button, .monaco-text-button, a.monaco-button",
      "Allow once",
    );
    // The command must actually be running before cancelling means anything.
    // This condition is about the machine, not the page, so it is polled here
    // rather than evaluated in the editor.
    const deadline = Date.now() + timeoutMs;
    while (!(await commandStarted())) {
      if (Date.now() > deadline)
        throw Error("the approved command never started");
      await settle(250);
    }
    await shot("03-running");

    await click("Cancel", ".action-label, .monaco-button, .codicon", "Cancel");
    await settle(3000);
    await shot("04-cancelled");
    return { clicked, editorScreenshots: Boolean(screenshotDir) };
  } finally {
    await page.close();
    try {
      chrome.proc.kill("SIGTERM");
    } catch {}
    fs.rmSync(chrome.profileDir, { recursive: true, force: true });
  }
}

if (import.meta.url === "file://" + process.argv[1]) {
  const url = process.argv[2];
  const title = process.argv[3] || "Native control check";
  if (!url) {
    console.error("Usage: vscode-drive.mjs <editor-url> [session title]");
    process.exit(2);
  }
  const result = await driveNativeControls({
    url,
    sessionTitle: title,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify(result, null, 2));
}
