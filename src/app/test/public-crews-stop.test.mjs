// Stop public crews (task 39.4, design §6.14, R85.9): one action pulls the
// cord for every public repository and lists the crews to pause in Kiro
// Crew. It stops no crew itself, and only a person resumes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { linePausedTaskIds } from "../flow.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const PUBLIC = "octo/pub",
  UNREAD = "octo/unread",
  PRIVATE = "octo/priv";

const leaf = (id, repository) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository,
});

function setup(t) {
  const root = temporaryDirectory("avoozl-pcs-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("p1", "pub"), leaf("u1", UNREAD), leaf("q1", "priv")],
    edges: [],
  });
  for (const id of ["pub", "priv", UNREAD]) store.put("projects", { id });
  const repo = () => ({ baseBranch: "main" });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          [PUBLIC]: repo(),
          [UNREAD]: repo(),
          [PRIVATE]: repo(),
        },
      },
    }),
  );
  // A public repository's tasks live in its local project.
  store.put("github_repositories", {
    id: PUBLIC,
    private: false,
    projectId: "pub",
  });
  store.put("github_repositories", {
    id: PRIVATE,
    private: true,
    projectId: "priv",
  });
  const read = [];
  const ops = new Operations(store, {
    workspaceRoot: root,
    crewReader: async (repository) => {
      read.push(repository);
      return repository === PUBLIC
        ? {
            status: 200,
            body: { crews: [{ id: "c1", name: "Fixer", labels: [] }] },
          }
        : { status: 403, body: {} };
    },
  });
  return { store, ops, read };
}

test("Stop public crews stops every public repository, lists its crews, and only a person resumes", async (t) => {
  const { store, ops, read } = setup(t);
  const result = await ops.execute("publiccrews.stop", {});
  assert.deepEqual(read.sort(), [UNREAD, PUBLIC].sort());
  assert.deepEqual(
    result.stops.map((s) => [s.repository, s.changed]).sort(),
    [
      [PUBLIC, true],
      [UNREAD, true],
    ].sort(),
  );
  // The public repository's own tasks and the unread one stop; the private
  // one runs on.
  assert.deepEqual([...linePausedTaskIds(store)].sort(), ["p1", "u1"]);
  const pub = result.pause.find((p) => p.repository === PUBLIC);
  assert.equal(pub.available, true);
  assert.deepEqual(
    pub.crews.map((c) => [c.name, c.link]),
    [["Fixer", "/issue-radar"]],
  );
  const unread = result.pause.find((p) => p.repository === UNREAD);
  assert.equal(unread.available, false);
  assert.ok(unread.reason);
  assert.match(result.note, /cannot pause a crew/);
  assert.equal(store.list("app_notifications").length, 1);

  // Pressed again: the stops stay as they are, and no second notice.
  const again = await ops.execute("publiccrews.stop", {});
  assert.ok(again.stops.every((s) => !s.changed));
  assert.equal(store.list("flow_stops").length, 2);
  assert.equal(store.list("app_notifications").length, 1);

  // An agent may stop; it may not resume.
  const stopId = result.stops[0].stopId;
  await assert.rejects(
    ops.execute("flow.resume", { stopId }, undefined, { mcp: true }),
    /Only a person/,
  );
  await ops.execute("flow.resume", { stopId });
  assert.ok(store.get("flow_stops", stopId).closedAt);
});

test("an agent's Stop public crews names the agent on the stop", async (t) => {
  const { store, ops } = setup(t);
  await ops.execute("publiccrews.stop", {}, undefined, { mcp: true });
  const stops = store.list("flow_stops");
  assert.equal(stops.length, 2);
  assert.ok(stops.every((s) => s.by.kind === "agent" && s.manual));
});

test("avoozl public-crews stop runs the same operation from the CLI", () => {
  const config = temporaryDirectory("avoozl-pcs-cli-config-"),
    root = temporaryDirectory("avoozl-pcs-cli-"),
    cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
    env = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)|^PORT$/.test(name))
      delete env[name];
  delete env.KIRO_SESSION_ID;
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env });
  assert.equal(run(["init", root]).status, 0);
  const result = run(["public-crews", "stop", "--workspace", root]);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.deepEqual(out.stops, []);
  assert.match(out.note, /cannot pause a crew/);
});
