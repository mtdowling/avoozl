// `avoozl plan delete` and `plan restore`: a person's CLI path to the same
// operations the page uses. Preview changes nothing; --yes soft-deletes; a
// spec name finds the plan; an ambiguous name is refused; MCP is still refused.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const cli = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));

function workspaceWith(plans) {
  const workspace = temporaryDirectory("avoozl-plan-delete-cli-");
  const config = initializeWorkspace(workspace, { name: "t" });
  const dbPath = config.dbPath || `${workspace}/.avoozl/local/workspace.sqlite`;
  const store = new Store(dbPath);
  store.transaction(() => plans.forEach((plan) => store.put("plans", plan)));
  store.close();
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", workspace], {
      encoding: "utf8",
      env: { ...process.env, KIROCREW_SPAWNED: "", KIRO_SESSION_ID: "" },
    });
  const plan = (id) => {
    const s = new Store(dbPath);
    try {
      return s.get("plans", id);
    } finally {
      s.close();
    }
  };
  return { run, plan, dbPath };
}

const draft = (id, spec) => ({ id, title: id, state: "draft", spec });

test("preview changes nothing; --yes soft-deletes; restore brings it back", () => {
  const { run, plan } = workspaceWith([draft("d1", "demo-spec")]);
  const preview = run("plan", "delete", "d1");
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).id, "d1");
  assert.match(preview.stderr, /--yes/);
  assert.equal(plan("d1").deletedAt, undefined);
  const deleted = run("plan", "delete", "d1", "--yes");
  assert.equal(deleted.status, 0, deleted.stderr);
  assert.ok(plan("d1").deletedAt);
  const restored = run("plan", "restore", "d1");
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(plan("d1").deletedAt, undefined);
});

test("a spec name finds the plan, and an ambiguous name is refused", () => {
  const { run, plan } = workspaceWith([
    draft("a1", "one-spec"),
    draft("b1", "twin"),
    draft("b2", "twin"),
  ]);
  const byName = run("plan", "delete", "one-spec", "--yes");
  assert.equal(byName.status, 0, byName.stderr);
  assert.ok(plan("a1").deletedAt);
  const twin = run("plan", "delete", "twin", "--yes");
  assert.notEqual(twin.status, 0);
  assert.match(twin.stderr, /More than one plan/);
  assert.equal(plan("b1").deletedAt, undefined);
  assert.equal(plan("b2").deletedAt, undefined);
});

test("MCP and chat callers are still refused, by id or spec name", async () => {
  const { dbPath } = workspaceWith([draft("m1", "mcp-spec")]);
  const store = new Store(dbPath);
  try {
    const ops = new Operations(store, { workspaceRoot: temporaryDirectory() });
    for (const id of ["m1", "mcp-spec"])
      for (const context of [{ mcp: true }, { caller: "session-1" }])
        await assert.rejects(
          ops.execute("plan.delete", { id }, undefined, context),
          /Only a person deletes a plan/,
        );
    assert.equal(store.get("plans", "m1").deletedAt, undefined);
  } finally {
    store.close();
  }
});
