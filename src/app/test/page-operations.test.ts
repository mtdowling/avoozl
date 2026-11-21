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
import {
  principalAllows,
  startAppBackend,
} from "../executors/kirocrew/app-backend.ts";
import { classifyOperation } from "../api/operation-table.ts";
import { workspaceConfig } from "../settings/config.ts";
import { initializeWorkspace } from "../workspace/workspace.ts";
import { isolatedEnv, SECRET, sign } from "./signed-principal.ts";
import { temporaryDirectory } from "./temporary.ts";

const UI = fileURLToPath(
  new URL("../../../hosts/kirocrew/ui/src", import.meta.url),
);
const OPERATION = /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/;
// Operation-shaped strings in arrays that name files, not operations.
const NOT_OPERATIONS = /\.md$/;

// An ESTree node, read only for the fields this walk names.
interface AstNode {
  type?: string;
  value?: unknown;
  key?: { name?: string; value?: unknown };
  arguments?: unknown[];
  elements?: unknown[];
  consequent?: unknown;
  alternate?: unknown;
}

function strings(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node: AstNode = value;
  if (node.type === "Literal" && typeof node.value === "string")
    return OPERATION.test(node.value) && !NOT_OPERATIONS.test(node.value)
      ? [node.value]
      : [];
  if (node.type === "ConditionalExpression")
    return [...strings(node.consequent), ...strings(node.alternate)];
  return [];
}

// Map of operation -> the page files that send it.
export function pageOperations() {
  const found = new Map<string, string[]>();
  const add = (file: string) => (operation: string) =>
    found.set(operation, [...(found.get(operation) || []), file]);
  for (const file of fs.readdirSync(UI, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!/\.tsx?$/.test(file)) continue;
    const text = fs.readFileSync(path.join(UI, file), "utf8");
    const ast = parseAst(text, { lang: file.endsWith(".tsx") ? "tsx" : "ts" });
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(walk);
      const node: AstNode = value;
      if (node.type === "CallExpression")
        node.arguments?.forEach((arg) => strings(arg).forEach(add(file)));
      if (
        node.type === "Property" &&
        (node.key?.name === "operation" || node.key?.value === "operation")
      )
        strings(node.value).forEach(add(file));
      if (node.type === "ArrayExpression")
        node.elements?.forEach((item) => strings(item).forEach(add(file)));
      for (const child of Object.values(value)) walk(child);
    };
    walk(ast);
  }
  return found;
}

test("the owner may run every operation the app page sends", () => {
  const found = pageOperations();
  // The pages and Settings tabs this walk must reach.
  for (const operation of [
    "delivery.settings.get",
    "delivery.settings.update",
    "github.settings.get",
    "github.settings.update",
    "flow.settings.get",
    "flow.settings.update",
    "content.terms.get",
    "plugins.list",
    "claims.view",
    "lanes.view",
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

// A page can be newer than the installed backend. An operation this backend
// does not offer says so and names the rebuild, instead of blaming the caller.
test("an operation the backend does not offer names the stale build", async (t) => {
  const root = temporaryDirectory();
  initializeWorkspace(root);
  const server = startAppBackend({
    config: workspaceConfig({ workspace: root, env: isolatedEnv(root) }),
    secret: SECRET,
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const post = async (operation: string, kind?: string) => {
    const body = JSON.stringify({ operation, input: {} });
    const reply = await fetch(`http://127.0.0.1:${address.port}/api/command`, {
      method: "POST",
      headers: { "X-KiroCrew-Principal": sign(body, kind) },
      body,
    });
    const answer = (await reply.json()) as { error: string };
    return { status: reply.status, ...answer };
  };
  const unknown = await post("page.someNewView");
  assert.equal(unknown.status, 403);
  assert.match(unknown.error, /does not offer page\.someNewView/);
  assert.match(unknown.error, /npm run build:kirocrew-app/);
  assert.match(unknown.error, /kirocrew app update avoozl/);
  const write = await post("flow.settings.update", "app-token");
  assert.equal(write.status, 403);
  assert.equal(write.error, "This caller may not run that operation.");
});
