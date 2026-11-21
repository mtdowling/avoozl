// Epic lifecycle rows and approval evidence (Requirement 59.1, 102.18,
// design §4.32.6). Temporary workspaces and fakes only.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Operations } from "../../api/operations.ts";
import {
  epicMembers,
  lintSpec,
  readSpecFolder,
} from "../../specs/spec-plans.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const leaf = {
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  completion: "integrated",
};

function plan(root: string, name: string, summary = "Do it.") {
  writeSpec(root, name, {
    "requirements.md": `---\nepic: launch\n---\n# Plan ${name}\n\nThe goal.\n`,
    "tasks.md": "# Tasks\n\n- [ ] 1 Build it\n",
    "avoozl/manifest.json": JSON.stringify({
      tasks: { 1: { ...leaf, summary } },
    }),
  });
}

// An epic folder with one row per [plan, step]; `checked` rows carry [x].
function epic(
  root: string,
  rows: [string, string?][],
  { checked = false } = {},
) {
  writeSpec(root, "launch", {
    "requirements.md": "# Epic launch\n\nShip it.\n",
    "design.md": "# Design\n",
    "tasks.md": `# Plans\n\n${rows.map((_, i) => `- [${checked ? "x" : " "}] ${i + 1} Row ${i + 1}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: Object.fromEntries(
        rows.map(([plan, step], i) => [
          String(i + 1),
          { plan, ...(step ? { step } : {}) },
        ]),
      ),
    }),
  });
}

function workspace(t: TestContext) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}
const lint = (ops: Operations, name: string) =>
  lintSpec({
    spec: readSpecFolder(ops.workspaceRoot, name),
    plan: { id: name },
    namespace: ops.specNamespace(),
  });

const SHA = "0123456789abcdef0123456789abcdef01234567";
