// The role table (without-kirocrew nk-1.1, NK1): one row per role, an
// executor from settings for every dispatch, and no default to `kirocrew`
// outside the Kiro Crew executor.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HARNESS_ROLES, ROLES } from "../chat-models.mjs";
import {
  ROLE_SETTINGS,
  ROLE_TABLE,
  processRow,
  roleRun,
  rowFor,
} from "../role-table.mjs";
import { processBrief } from "../executors/process.mjs";
import { kirocrewRequest } from "../executors/kirocrew.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "..");

const sources = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === "test"
          ? []
          : sources(path.join(directory, entry.name))
        : entry.name.endsWith(".mjs")
          ? [path.join(directory, entry.name)]
          : [],
    );

test("every harness role has a row, and every row's role is read by a dispatch", () => {
  assert.deepEqual([...ROLE_SETTINGS].sort(), [...ROLES].sort());
  // The older `harnesses` key names only roles of the table.
  for (const role of HARNESS_ROLES) assert.ok(ROLES.includes(role), role);
  const code = sources(app)
    .filter((file) => !file.endsWith("role-table.mjs"))
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
    "landing-conflicts.mjs",
    "tick.mjs",
    "session-bindings.mjs",
    "page-views.mjs",
    "retro-chat.mjs",
    "remote-runner.mjs",
  ]);
  for (const file of sources(app)) {
    if (file.endsWith(path.join("executors", "kirocrew.mjs"))) continue;
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

test("a pin wins over the saved harness, which wins over the repository", () => {
  const config = {
    roles: {
      verifier: { harness: "codex" },
      planReviewer: { harness: "claude-code" },
    },
  };
  const repository = { executor: "process" };
  assert.deepEqual(
    roleRun("verifier", {
      config,
      task: { session: { harness: "pinned" } },
      repository,
    }),
    { executor: "process", harness: "pinned" },
  );
  assert.deepEqual(roleRun("verifier", { config, repository }), {
    executor: "process",
    harness: "codex",
  });
  assert.deepEqual(roleRun("verifier", { repository }), {
    executor: "process",
  });
  assert.deepEqual(roleRun("verifier", {}), { executor: "kirocrew" });
  assert.deepEqual(
    roleRun("verifier", {
      config: { roles: { verifier: { harness: "kirocrew" } } },
    }),
    {
      executor: "kirocrew",
    },
  );
  // The plan reviewer and review drafts name the harness saved for them.
  assert.deepEqual(roleRun("planReviewer", { config }), {
    executor: "process",
    harness: "claude-code",
  });
  assert.deepEqual(
    roleRun("triage", {
      config: { roles: { triage: { harness: "codex" } } },
    }),
    { executor: "process", harness: "codex" },
  );
  // With every role able to run as a child, the repository's executor applies.
  assert.deepEqual(roleRun("prReview", { repository }), {
    executor: "process",
  });
});

test("the four roles already on process keep their briefs and rows", () => {
  for (const role of ["verifier", "review:security", "retro", "planner"])
    assert.ok(processRow(role), role);
  assert.equal(rowFor("review:x"), ROLE_TABLE.reviewer);
  // A chat that is not in the table (the conflict fix R91.6 removes).
  assert.equal(processRow("conflict-fix"), null);
  assert.equal(processRow("worker").folder, "worktree");
  assert.match(
    processBrief("verifier", "BRIEF", { allowCommands: [["npm", "test"]] }),
    /`npm test`[\s\S]*result\.json/,
  );
  assert.equal(processBrief("worker", "BRIEF"), "BRIEF");
  assert.equal(processBrief("conflict-fix", "BRIEF"), "BRIEF");
});
