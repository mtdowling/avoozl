import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { workspaceConfig } from "../settings/config.ts";
import { groupedCall, GROUPED_TOOLS } from "../mcp/mcp-tools.ts";
import { Operations } from "../api/operations.ts";
import { Store } from "../store/store.ts";
import { fixture, loopOn, snapshot } from "./fixtures.ts";
import { temporaryDirectory } from "./temporary.ts";

// The machine file the tick reads, in this file's own folder, with the
// server loop on.
loopOn();
const XDG = process.env.XDG_CONFIG_HOME;
assert.ok(XDG, "loopOn sets XDG_CONFIG_HOME");
const MACHINE = path.join(XDG, "avoozl", "config.json");

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  planId: "p1",
  planHash: "h1",
  ...extra,
});

function workspace(
  t: TestContext,
  tasks: ReturnType<typeof leaf>[],
  tracked: Record<string, unknown> = {},
) {
  const root = temporaryDirectory("avoozl-retired-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks, edges: [] });
  store.put("approvals", { id: "approval-1", planId: "p1", hash: "h1" });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  const file = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      lanes: { local: 5 },
      roles: { worker: { model: "model-d" } },
      delivery: { retries: 1 },
      ...tracked,
    }),
  );
  return {
    root,
    file,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

test("the relay tool and relay.forget are gone", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  // plans_relay and its relay.call operation were removed (R56.3).
  assert.equal(Object.hasOwn(GROUPED_TOOLS, "plans_relay"), false);
  assert.equal(groupedCall("plans_relay", { action: "register" }), null);
  await assert.rejects(ops.execute("relay.forget", {}), /Unknown operation/);
});

test("an unknown machine file key is refused, naming it", async (t) => {
  fs.mkdirSync(path.dirname(MACHINE), { recursive: true });
  fs.writeFileSync(
    MACHINE,
    JSON.stringify({ version: 1, oldKey: { enabled: true } }),
  );
  t.after(() => fs.rmSync(MACHINE, { force: true }));
  const { root } = fixture(t);
  assert.throws(
    () => workspaceConfig({ workspace: root }),
    /Unknown setting "oldKey" in global Avoozl configuration/,
  );
  fs.writeFileSync(
    MACHINE,
    JSON.stringify({ version: 1, loop: { run: ["specs"] } }),
  );
  const env = workspace(t, [leaf("a"), leaf("b")]);
  const result = await env.ops.execute<{
      dispatch: {
        role: string;
        task: string;
        model?: string;
        crew?: unknown;
      }[];
    }>("workspace.tick", { sessions: [] }),
    workers = Object.fromEntries(
      result.dispatch
        .filter((d) => d.role === "worker")
        .map((d) => [d.task, d]),
    );
  assert.deepEqual(Object.keys(workers).sort(), ["a", "b"]);
  assert.ok(result.dispatch.every((d) => d.role !== "router" && !d.crew));
  assert.equal(workers.a.model, "model-d");
  assert.equal(workers.b.model, "model-d");
});
