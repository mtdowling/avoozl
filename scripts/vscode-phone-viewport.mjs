#!/usr/bin/env node
// Emulated-phone comparison of the two surfaces, for the website decision.
//
// This is NOT phone acceptance. The plan's gate needs a physical phone on a
// network outside the home, and that gate is still open. What this does is
// settle the part that does not need hardware: at a phone's viewport, with
// touch as the only pointer, can each surface do the work — and how big are
// the controls you have to hit?
//
// Both surfaces are driven with touch events only: no mouse, no keyboard.
// A surface that needs a keyboard to reach a control fails here, which is
// exactly what a phone would do.
//
//   node scripts/vscode-phone-viewport.mjs --server DIR [--keep]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork, execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createFixture } from "./vscode-fixture.mjs";
import { startServer } from "../src/app/server.mjs";
import { ensureAgentHost } from "../src/app/remote-manager.mjs";
import { startAhpFacade } from "../src/app/ahp/facade.mjs";
import { agentProviderId } from "../src/app/ahp/projection.mjs";
import { localClient } from "../src/app/client.mjs";
import { loadTokens } from "../src/app/ahp/main.mjs";
import { launchChrome, attach, FINDER } from "./cdp.mjs";

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const serverRoot = argv[argv.indexOf("--server") + 1];
const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outFile = path.join(
  repositoryRoot,
  "docs/evidence/vscode/phone-viewport.json",
);
const say = (text) => process.stdout.write(text + "\n");

// An iPhone 15's CSS viewport, its pixel ratio, and touch as the only
// pointer. Apple asks for 44pt minimum hit targets; that is the bar used
// here for "can you hit it".
const PHONE = { width: 393, height: 852, deviceScaleFactor: 3, mobile: true };
const MINIMUM_TARGET = 44;

const fixture = await createFixture({ name: "Phone viewport comparison" });
const editorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-phone-"));
const profile = path.join(editorRoot, "p");
const extensions = path.join(editorRoot, "x");

let host, server, facade, editorProc, browser;
const cleanup = async () => {
  try {
    browser?.proc.kill("SIGTERM");
  } catch {}
  try {
    editorProc?.kill("SIGTERM");
  } catch {}
  try {
    await facade?.close();
  } catch {}
  try {
    server?.close();
  } catch {}
  host?.kill("SIGTERM");
  await delay(500);
  for (const name of fs.existsSync(fixture.markers)
    ? fs.readdirSync(fixture.markers)
    : [])
    if (name.endsWith(".started"))
      try {
        const { pid } = JSON.parse(
          fs.readFileSync(path.join(fixture.markers, name), "utf8"),
        );
        process.kill(pid, "SIGTERM");
      } catch {}
  if (!keep) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(editorRoot, { recursive: true, force: true });
  } else say("\nKept: " + fixture.root + " and " + editorRoot);
};

// Touch, not mouse. A tap is a touchStart/touchEnd pair at the control's own
// centre, which is what a finger does.
async function tap(page, box) {
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await page.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await delay(600);
  return { x, y };
}
const measure = (box) => ({
  width: Math.round(box.width),
  height: Math.round(box.height),
  hittable: box.width >= MINIMUM_TARGET && box.height >= MINIMUM_TARGET,
});

const surfaces = {};
try {
  host = fork(
    path.join(repositoryRoot, "scripts/vscode-fixture-host.mjs"),
    [fixture.root],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const hostLog = fs.createWriteStream(path.join(fixture.root, "host.log"));
  host.stdout.pipe(hostLog);
  host.stderr.pipe(hostLog);
  const hostManifest = path.join(
    path.dirname(fixture.dbPath),
    "agent-host.json",
  );
  while (!fs.existsSync(hostManifest)) await delay(50);
  const manager = await ensureAgentHost({
    dbPath: fixture.dbPath,
    manifestPath: hostManifest,
  });
  server = startServer({
    dbPath: fixture.dbPath,
    port: 0,
    projectionRoot: path.join(fixture.workspace, "plans"),
    sourceRoot: path.join(fixture.workspace, "plans"),
    manager,
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = "http://127.0.0.1:" + server.address().port;
  const { store, ops } = server.workspace;

  const facadeManifest = path.join(
    path.dirname(fixture.dbPath),
    "ahp-facade.json",
  );
  facade = startAhpFacade({
    store,
    client: localClient(ops),
    file: path.join(path.dirname(fixture.dbPath), "ahp.sqlite"),
    port: 0,
    pollIntervalMs: 50,
    workspaceEndpoint: endpoint,
    tokens: loadTokens(
      path.join(path.dirname(fixture.dbPath), "ahp-tokens.json"),
    ),
    manifestPath: facadeManifest,
    models: async () => {
      const catalog = await ops.execute("models", { provider: "claude" });
      return ["claude", "codex"].map((offered) => ({
        provider: agentProviderId(offered),
        displayName: "Avoozl " + offered,
        description: "Fixture provider; real child processes.",
        models: catalog.models.map((m) => ({
          id: m.id,
          provider: agentProviderId(offered),
          name: m.label || m.id,
        })),
        protectedResources: [],
      }));
    },
  });
  await facade.listening;
  const editorClient = JSON.parse(fs.readFileSync(facadeManifest, "utf8"))
    .clients.editor;

  // One conversation per surface, each stopped on its own approval, so the
  // two surfaces are compared on the same work rather than sharing a run.
  const ready = await ops.execute("query", { scope: "all", q: "ready:true" });
  // A different task per surface: the workspace refuses a second session on a
  // task that already has one, which is the rule being preserved, not a bug.
  let taskIndex = 0;
  const startRun = async (id, title) => {
    const taskId = ready[taskIndex++]?.id || ready[0]?.id;
    const submitted = await ops.execute("intent.submit", {
      action: "run",
      prompt: "Run the authored fixture command and wait for its result.",
      submissionId: id,
      title,
      provider: "claude",
      projectId: fixture.projectId,
      model: "fixture-fast",
      approvalMode: "manual",
      context: { selected: taskId },
    });
    const runId = submitted.run.id;
    while (store.get("runs", runId)?.state !== "waiting-approval")
      await delay(50);
    return runId;
  };
  const websiteRun = await startRun("phone-website", "Phone website check");
  const editorRun = await startRun("phone-editor", "Phone editor check");

  browser = await launchChrome({ url: "about:blank" });
  const phone = async (page) => {
    await page.send("Emulation.setDeviceMetricsOverride", PHONE);
    await page.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await page.send("Emulation.setEmitTouchEventsForMouse", {
      enabled: false,
    });
  };
  const shot = async (page, name) => {
    await page.send("Page.enable");
    const image = await page.send("Page.captureScreenshot", { format: "png" });
    const dir = path.join(fixture.root, "shots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name + ".png");
    fs.writeFileSync(file, Buffer.from(image.data, "base64"));
    return file;
  };
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const markerFor = async () => {
    const deadline = Date.now() + 40000;
    for (;;) {
      const found = fs
        .readdirSync(fixture.markers)
        .filter((name) => name.endsWith(".started"));
      if (found.length)
        return JSON.parse(
          fs.readFileSync(path.join(fixture.markers, found.at(-1)), "utf8"),
        );
      if (Date.now() > deadline) return null;
      await delay(250);
    }
  };

  // ── The website, at a phone's viewport, by touch ─────────────────────────
  say("\nWebsite at " + PHONE.width + "×" + PHONE.height + ", touch only");
  {
    const page = await attach(
      browser.port,
      (target) => target.type === "page" && /about:blank|127\.0\.0\.1/.test(target.url),
    );
    await phone(page);
    // The hub is where blocked work appears; a conversation is opened from it
    // by tapping its row, which is the path a phone would take.
    await page.navigate(endpoint + "/?view=activity");
    await page.waitFor("!!document.querySelector('body')", {
      label: "the website",
      timeoutMs: 60000,
    });
    await delay(6000);
    await page.exec(FINDER);
    const record = { surface: "website", steps: [], controls: {} };
    const reach = async (what, expression) => {
      const box = await page
        .waitFor(expression, { label: what, timeoutMs: 25000 })
        .catch(() => null);
      record.controls[what] = box
        ? measure(box)
        : { reachable: false };
      if (box) record.controls[what].reachable = true;
      record.steps.push({
        step: what,
        reached: Boolean(box),
      });
      say(
        (box ? "  ✓ " : "  ✗ ") +
          what +
          (box
            ? " — " +
              record.controls[what].width +
              "×" +
              record.controls[what].height +
              (record.controls[what].hittable ? "" : " (below " + MINIMUM_TARGET + "px)")
            : ""),
      );
      return box;
    };
    record.firstPaint = await shot(page, "phone-website-01");
    // Blocked work, without typing anything.
    await reach(
      "work needing a decision is listed",
      "__avoozlFind('Phone website check', 'article, .hub-decision')",
    );
    const decision = await reach(
      "the control that opens that conversation",
      "__avoozlFind('Review & respond', 'button[data-open-run], button')",
    );
    if (decision) await tap(page, decision);
    await delay(5000);
    record.transcript = await shot(page, "phone-website-02");
    const allow = await reach(
      "the approve control",
      "__avoozlFind('Allow', 'button.primary, button')",
    );
    if (allow) {
      await tap(page, allow);
      await delay(2500);
      const answered = store
        .list("requests")
        .find((entry) => entry.runId === websiteRun);
      record.approved = answered?.state === "allowed";
      say((record.approved ? "  ✓ " : "  ✗ ") + "the tap approved the request");
      const started = await markerFor();
      record.processStarted = Boolean(started && alive(started.pid));
      const stop = await reach(
        "the stop control",
        "__avoozlFind('Stop', 'button') || __avoozlFind('Interrupt', 'button') || __avoozlFind('Cancel', 'button')",
      );
      if (stop) {
        await tap(page, stop);
        await delay(4000);
        const run = store.get("runs", websiteRun);
        record.interrupted = run?.state === "interrupted";
        record.processStopped = started ? !alive(started.pid) : null;
        say(
          (record.interrupted ? "  ✓ " : "  ✗ ") +
            "the tap stopped the conversation and its process",
        );
      }
    }
    record.plan = Boolean(
      await page
        .eval("__avoozlFind('Plans', 'a, button, nav *')")
        .catch(() => null),
    );
    record.lastPaint = await shot(page, "phone-website-03");
    surfaces.website = record;
    await page.close();
  }

  // ── The bridged editor, same viewport, same touch-only rule ──────────────
  if (serverRoot) {
    say("\nBridged browser editor, same viewport, touch only");
    const binary = path.join(serverRoot, "bin", "code-server");
    if (!fs.existsSync(binary)) throw Error("No code-server at " + binary);
    execFileSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts/package-extension.mjs"),
        "--out",
        path.join(fixture.root, "build"),
      ],
      { stdio: "ignore" },
    );
    const vsix = fs
      .readdirSync(path.join(fixture.root, "build"))
      .find((name) => name.endsWith(".vsix"));
    fs.mkdirSync(extensions, { recursive: true });
    fs.mkdirSync(path.join(profile, "User"), { recursive: true });
    execFileSync("unzip", [
      "-q",
      path.join(fixture.root, "build", vsix),
      "-d",
      path.join(fixture.root, "unpacked"),
    ]);
    fs.renameSync(
      path.join(fixture.root, "unpacked", "extension"),
      path.join(extensions, "mtdowling.avoozl-0.1.0"),
    );
    fs.writeFileSync(
      path.join(profile, "User", "settings.json"),
      JSON.stringify(
        {
          "avoozl.endpoint": endpoint,
          "avoozl.facadeManifest": facadeManifest,
          "chat.viewSessions.enabled": true,
          "telemetry.telemetryLevel": "off",
          "update.mode": "none",
          "workbench.startupEditor": "none",
        },
        null,
        2,
      ),
    );
    const tokenFile = path.join(editorRoot, "connection-token");
    const browserToken = randomUUID();
    fs.writeFileSync(tokenFile, browserToken, { mode: 0o600 });
    const webPort = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
    editorProc = spawn(
      binary,
      [
        "--accept-server-license-terms",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--connection-token-file",
        tokenFile,
        "--server-data-dir",
        path.join(editorRoot, "s"),
        "--user-data-dir",
        profile,
        "--extensions-dir",
        extensions,
        "--agent-host-bridge-host",
        "127.0.0.1",
        "--agent-host-bridge-port",
        String(facade.port),
        "--agent-host-bridge-connection-token",
        editorClient.connectionToken,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const log = fs.createWriteStream(path.join(fixture.root, "server.log"));
    editorProc.stdout.pipe(log);
    editorProc.stderr.pipe(log);
    await delay(12000);

    const page = await attach(
      browser.port,
      (target) => target.type === "page",
    );
    await phone(page);
    await page.navigate("http://127.0.0.1:" + webPort + "/?tkn=" + browserToken);
    await page.waitFor("!!document.querySelector('.monaco-workbench')", {
      label: "the editor workbench",
      timeoutMs: 120000,
    });
    await delay(10000);
    await page.exec(FINDER);
    const record = { surface: "bridged-editor", steps: [], controls: {} };
    record.firstPaint = await shot(page, "phone-editor-01");
    const reach = async (what, expression) => {
      const box = await page
        .waitFor(expression, { label: what, timeoutMs: 25000 })
        .catch(() => null);
      record.controls[what] = box ? measure(box) : { reachable: false };
      if (box) record.controls[what].reachable = true;
      record.steps.push({ step: what, reached: Boolean(box) });
      say(
        (box ? "  ✓ " : "  ✗ ") +
          what +
          (box
            ? " — " +
              record.controls[what].width +
              "×" +
              record.controls[what].height +
              (record.controls[what].hittable
                ? ""
                : " (below " + MINIMUM_TARGET + "px)")
            : ""),
      );
      return box;
    };
    // The sessions list is behind a command on this build. A phone has no
    // keyboard, so whether it can be reached by touch is the question.
    const sessionsControl = await reach(
      "the sessions list, by touch alone",
      "__avoozlFind('Agent Sessions', '.action-label, .action-item, button') || __avoozlFind('Show Sessions', '.action-label, button')",
    );
    if (sessionsControl) await tap(page, sessionsControl);
    else {
      // Not a failure to drive: a finding. On this build the sessions list is
      // behind a palette command, and a phone has no palette without its soft
      // keyboard. Recorded, then reached with the keyboard so the rest of the
      // comparison can still be made.
      record.sessionsListNeedsKeyboard = true;
      say(
        "  ! the sessions list has no touch-reachable control; using the keyboard",
      );
      await page
        .command("Show Agent Sessions Sidebar", { settleMs: 3000 })
        .catch(() => {});
    }
    await delay(3000);
    const sessionRow = await reach(
      "the conversation in the list",
      "__avoozlFind('Phone editor check', '.monaco-list-row')",
    );
    if (sessionRow) {
      await tap(page, sessionRow);
      await delay(8000);
      record.transcript = await shot(page, "phone-editor-02");
      const allow = await reach(
        "the approve control",
        "__avoozlFind('Allow once', '.monaco-button, .monaco-text-button, a.monaco-button')",
      );
      if (allow) {
        await tap(page, allow);
        await delay(3000);
        const answered = store
          .list("requests")
          .find((entry) => entry.runId === editorRun);
        record.approved = answered?.state === "allowed";
        say(
          (record.approved ? "  ✓ " : "  ✗ ") + "the tap approved the request",
        );
        const started = await markerFor();
        record.processStarted = Boolean(started && alive(started.pid));
        const cancel = await reach(
          "the cancel control",
          "__avoozlFind('Cancel', '.action-label, .monaco-button, .codicon')",
        );
        if (cancel) {
          await tap(page, cancel);
          await delay(4000);
          const run = store.get("runs", editorRun);
          record.interrupted = run?.state === "interrupted";
          record.processStopped = started ? !alive(started.pid) : null;
          say(
            (record.interrupted ? "  ✓ " : "  ✗ ") +
              "the tap stopped the conversation and its process",
          );
        }
      }
    }
    record.lastPaint = await shot(page, "phone-editor-03");
    surfaces.editor = record;
    await page.close();
  } else say("\nNo --server DIR, so the editor surface was not compared.");

  const receipt = {
    at: new Date().toISOString(),
    acceptance:
      "Emulated phone viewport comparison. NOT the VSC-08 phone gate, which needs a physical phone on an outside network.",
    viewport: PHONE,
    minimumTargetPx: MINIMUM_TARGET,
    method:
      "Touch events only — no mouse and no keyboard — against both surfaces at the same viewport, with the same fixture work. Assertions are made against the durable records and the real child process.",
    surfaces,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      JSON.parse(
        JSON.stringify(receipt)
          .replaceAll(fixture.root, "<disposable-fixture>")
          .replaceAll(editorRoot, "<throwaway-profile>")
          .replaceAll(process.env.HOME || "\0none\0", "<home>"),
      ),
      null,
      2,
    ) + "\n",
  );
  say("\nReceipt: " + outFile);
  if (keep) say("Screenshots: " + path.join(fixture.root, "shots"));
} catch (error) {
  say("Comparison did not complete: " + error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
