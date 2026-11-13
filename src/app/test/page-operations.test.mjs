// Every operation the app page can send must be one the dashboard owner may
// run through the backend, so no page or Settings tab shows "This caller may
// not run that operation." The list is read from the page source itself: each
// operation-shaped string passed to a call, set as `operation:`, or listed in
// an array (ONBOARD_READS and the like).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAst } from "rolldown/parseAst";
import { principalAllows, startAppBackend } from "../app-backend.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { createHash, createHmac, randomBytes } from "node:crypto";

const UI = fileURLToPath(
  new URL("../../../kirocrew-app/ui/src", import.meta.url),
);
const OPERATION = /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/;
// Operation-shaped strings in arrays that name files, not operations.
const NOT_OPERATIONS = /\.md$/;

function strings(node) {
  if (node?.type === "Literal" && typeof node.value === "string")
    return OPERATION.test(node.value) && !NOT_OPERATIONS.test(node.value)
      ? [node.value]
      : [];
  if (node?.type === "ConditionalExpression")
    return [...strings(node.consequent), ...strings(node.alternate)];
  return [];
}

// Map of operation -> the page files that send it.
export function pageOperations() {
  const found = new Map();
  const add = (file) => (operation) =>
    found.set(operation, [...(found.get(operation) || []), file]);
  for (const file of fs.readdirSync(UI, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const text = fs.readFileSync(path.join(UI, file), "utf8");
    const ast = parseAst(text, { lang: file.endsWith(".tsx") ? "tsx" : "ts" });
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.type === "CallExpression")
        node.arguments.forEach((arg) => strings(arg).forEach(add(file)));
      if (
        node.type === "Property" &&
        (node.key?.name === "operation" || node.key?.value === "operation")
      )
        strings(node.value).forEach(add(file));
      if (node.type === "ArrayExpression")
        node.elements.forEach((item) => strings(item).forEach(add(file)));
      for (const key in node) if (key !== "type") walk(node[key]);
    };
    walk(ast);
  }
  return found;
}

test("the owner may run every operation the app page sends", () => {
  const found = pageOperations();
  // The pages and Settings tabs this walk must reach.
  for (const operation of [
    "routing.view",
    "routing.update",
    "crews.update",
    "delivery.settings.get",
    "delivery.settings.update",
    "github.settings.get",
    "github.settings.update",
    "flow.settings.get",
    "flow.settings.update",
    "content.terms.get",
    "plugins.list",
    "intake.sources",
    "repositories.list",
    "workspaces.list",
  ])
    assert.ok(found.has(operation), `the walk missed ${operation}`);
  const refused = [...found]
    .filter(
      ([operation]) => !principalAllows({ kind: "owner-session" }, operation),
    )
    .map(([operation, files]) => `${operation} (${files.join(", ")})`);
  assert.deepEqual(
    refused,
    [],
    "the page sends operations the owner may not run",
  );
});

test("app tokens and agent tools still may not run the page's writes", () => {
  for (const operation of pageOperations().keys()) {
    const kind = classifyOperation(operation);
    if (!kind || kind === "observe") continue;
    for (const caller of ["app-token", "agent-tool"])
      assert.equal(
        principalAllows({ kind: caller }, operation),
        false,
        `${caller} ${operation}`,
      );
  }
});

function sign(body, kind = "owner-session") {
  const claim = {
      issuedAt: Math.floor(Date.now() / 1000),
      kind,
      ownerId: kind === "owner-session" ? "owner" : "",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signature = createHmac("sha256", "secret")
    .update(
      [
        "kirocrew-proxy-principal-v1",
        String(claim.issuedAt),
        "POST",
        "/api/command",
        createHash("sha256").update(body).digest("hex"),
        encoded,
      ].join("\n"),
    )
    .digest("hex");
  return `${encoded}.${signature}`;
}

// The Routing page and Settings > Delivery showed the caller error because
// the installed backend was built before routing.view and delivery.settings.*
// existed, while the page was new. An operation this backend does not offer
// says so and names the rebuild, instead of blaming the caller.
test("an operation the backend does not offer names the stale build", async (t) => {
  const root = temporaryDirectory();
  initializeWorkspace(root);
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  const server = startAppBackend({
    config: workspaceConfig({ workspace: root, env }),
    secret: "secret",
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const post = async (operation, kind) => {
    const body = JSON.stringify({ operation, input: {} });
    const reply = await fetch(
      `http://127.0.0.1:${server.address().port}/api/command`,
      {
        method: "POST",
        headers: { "X-KiroCrew-Principal": sign(body, kind) },
        body,
      },
    );
    return { status: reply.status, ...(await reply.json()) };
  };
  const unknown = await post("routing.someNewView");
  assert.equal(unknown.status, 403);
  assert.match(unknown.error, /does not offer routing\.someNewView/);
  assert.match(unknown.error, /npm run build:kirocrew-app/);
  assert.match(unknown.error, /kirocrew app update avoozl/);
  const write = await post("routing.update", "app-token");
  assert.equal(write.status, 403);
  assert.equal(write.error, "This caller may not run that operation.");
});
