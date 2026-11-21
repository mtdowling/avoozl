// The role table (without-kirocrew nk-1.1, NK1): one row per role, an
// executor from settings for every dispatch, and no default to `kirocrew`
// outside the Kiro Crew executor.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ROLES,
  ROLE_TABLE,
  validateRoles,
  processRow,
  roleRun,
  rowFor,
} from "../role-table.ts";
import { processBrief } from "../../executors/process.ts";
import { kirocrewRequest } from "../../executors/kirocrew.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "..", "..");

const sources = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === "test"
          ? []
          : sources(path.join(directory, entry.name))
        : /\.(mjs|ts)$/.test(entry.name)
          ? [path.join(directory, entry.name)]
          : [],
    );

test("the table holds the five roles Avoozl starts, and every row's role is read by a dispatch", () => {
  assert.deepEqual(ROLES, [
    "worker",
    "reviewer",
    "responder",
    "checkDecide",
    "assist",
  ]);
  for (const cut of ["verifier", "planner", "retro", "falsifier"])
    assert.throws(
      () => validateRoles({ roles: { [cut]: {} } }),
      new RegExp(`roles\\.${cut} is not a role`),
    );
  const code = sources(app)
    .filter((file) => !file.endsWith("role-table.ts"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const setting of ROLES)
    assert.ok(
      new RegExp(`roleRun\\([^;]{0,80}"${setting}"`).test(code),
      `no dispatch reads ${setting}`,
    );
});

test("no module outside the Kiro Crew executor defaults a request to kirocrew", () => {
  // Readers of stored bindings, and messages to a bound session, from
  // before bindings named an executor. Neither starts a session.
  const reading = new Set([
    "landing-conflicts.ts",
    "tick.ts",
    "session-bindings.ts",
    "page-views.ts",
    "retro-chat.mjs",
  ]);
  for (const file of sources(app)) {
    if (file.endsWith(path.join("executors", "kirocrew.ts"))) continue;
    if (reading.has(path.basename(file))) continue;
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /(\?\?|\|\|)\s*"kirocrew"/,
      `${path.relative(app, file)} defaults to kirocrew`,
    );
  }
  assert.throws(
    () => kirocrewRequest(null, { task: "t", role: "x", brief: "b" }),
    /names no executor/,
  );
});

test("the saved harness wins over the repository", () => {
  const config = {
    roles: {
      reviewer: { harness: "codex" },
      assist: { harness: "claude-code" },
    },
  };
  const repository = { executor: "process" };
  assert.deepEqual(roleRun("reviewer", { config, repository }), {
    executor: "process",
    harness: "codex",
  });
  assert.deepEqual(roleRun("reviewer", { repository }), {
    executor: "process",
  });
  assert.deepEqual(roleRun("reviewer", {}), { executor: "kirocrew" });
  assert.deepEqual(
    roleRun("reviewer", {
      config: { roles: { reviewer: { harness: "kirocrew" } } },
    }),
    {
      executor: "kirocrew",
    },
  );
  // The assistant names the harness saved for it.
  assert.deepEqual(roleRun("assist", { config }), {
    executor: "process",
    harness: "claude-code",
  });
  // With every role able to run as a child, the repository's executor applies.
  assert.deepEqual(roleRun("assist", { repository }), {
    executor: "process",
  });
});

test("the roles on process keep their briefs and rows", () => {
  for (const role of ["review:security", "responder", "check-decide", "assist"])
    assert.ok(processRow(role), role);
  assert.equal(rowFor("review:x"), ROLE_TABLE.reviewer);
  // A chat that is not in the table (the conflict fix R91.6 removes).
  assert.equal(processRow("conflict-fix"), null);
  assert.equal(processRow("worker")?.folder, "worktree");
  assert.match(
    processBrief("review:x", "BRIEF", { allowCommands: [["npm", "test"]] }),
    /`npm test`[\s\S]*result\.json/,
  );
  assert.equal(processBrief("worker", "BRIEF"), "BRIEF");
  assert.equal(processBrief("conflict-fix", "BRIEF"), "BRIEF");
});
