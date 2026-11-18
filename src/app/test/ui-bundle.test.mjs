import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startAppBackend } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import {
  UPDATE_COMMAND,
  uiBundleProblem,
  writeUiStamp,
} from "../ui-bundle.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SECRET = "test-proxy-secret",
  repoUi = fileURLToPath(new URL("../../../kirocrew-app/ui", import.meta.url));

// A ui folder with one source file and a built page.
function uiFolder() {
  const ui = path.join(temporaryDirectory(), "ui");
  fs.mkdirSync(path.join(ui, "src", "views"), { recursive: true });
  fs.mkdirSync(path.join(ui, "dist"));
  fs.writeFileSync(path.join(ui, "src", "views", "Home.tsx"), "export {}\n");
  fs.writeFileSync(path.join(ui, "dist", "index.mjs"), "export {}\n");
  return ui;
}

test("a page built from the ui/src beside it passes; a stale or missing one names the fix", () => {
  const ui = uiFolder();
  assert.match(uiBundleProblem(ui), /no built page/);
  writeUiStamp(ui);
  assert.equal(uiBundleProblem(ui), null);
  // The install does not copy Finder's files, so they do not count.
  fs.writeFileSync(path.join(ui, "src", ".DS_Store"), "x");
  assert.equal(uiBundleProblem(ui), null);
  // A pull changed the source after the last build.
  fs.writeFileSync(path.join(ui, "src", "views", "Lanes.tsx"), "export {}\n");
  const stale = uiBundleProblem(ui);
  assert.match(stale, /out of date/);
  assert.ok(stale.endsWith(UPDATE_COMMAND));
  writeUiStamp(ui);
  assert.equal(uiBundleProblem(ui), null);
  fs.rmSync(path.join(ui, "dist", "index.mjs"));
  assert.match(uiBundleProblem(ui), /no built page/);
});

test("the build stamps the page it wrote", () => {
  assert.equal(uiBundleProblem(repoUi), null);
});

// Mirrors kiro_crew/apps/proxy_auth.py `sign_proxy_principal_claim`.
function sign(body) {
  const issuedAt = Math.floor(Date.now() / 1000),
    encoded = Buffer.from(
      JSON.stringify({
        issuedAt,
        kind: "owner-session",
        ownerId: "owner",
        requestId: randomBytes(16).toString("hex"),
        version: 1,
      }),
    ).toString("base64url"),
    signature = createHmac("sha256", SECRET)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

test("the backend answers a stale page's requests with the update command", async (t) => {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    ui = uiFolder();
  initializeWorkspace(served);
  writeUiStamp(ui);
  fs.writeFileSync(
    path.join(ui, "src", "views", "Home.tsx"),
    "export {} // new\n",
  );
  const server = startAppBackend({
    config: workspaceConfig({
      workspace: served,
      env: { XDG_CONFIG_HOME: path.join(root, "config") },
    }),
    secret: SECRET,
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
    uiDir: ui,
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`,
    body = JSON.stringify({ operation: "workspaces.list", input: {} }),
    response = await fetch(base + "/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KiroCrew-Principal": sign(body),
      },
      body,
    });
  assert.equal(response.status, 409);
  assert.match(
    (await response.json()).error,
    /out of date.*npm run build && kirocrew app update avoozl/,
  );
  // Health stays up, so Kiro Crew keeps the backend running to say so.
  assert.equal((await fetch(base + "/health")).status, 200);
});
