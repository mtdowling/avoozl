// rc-17.2 and rc-17.3: a cross-repository proposal is a parent spec (an epic
// folder) with one sub-spec per repository. Local files and fake data only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { Operations } from "../../api/operations.ts";
import { lintSpec, readSpecFolder, taskToken } from "../spec-plans.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import type { PlanDraft } from "../../test/view-shapes.ts";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const leaf = (extra: Record<string, unknown> = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["It works."],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});

function workspace(t: TestContext) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

// A sub-spec for one repository, a member of `parent`.
function sub(
  root: string,
  name: string,
  repository: string,
  entries: Record<string, ReturnType<typeof leaf>> = {
    "sub-1": leaf({ repository }),
  },
) {
  writeSpec(root, name, {
    "requirements.md": `---\nepic: parent\n---\n# ${name}\n\nThe goal.\n`,
    "tasks.md": `# Tasks\n\n${Object.keys(entries)
      .map((id) => `- [ ] ${taskToken(id)} Task ${id}\n`)
      .join("")}`,
    "avoozl/manifest.json": JSON.stringify({ tasks: entries }, null, 2),
  });
}
function parent(root: string, members: string[], entryExtra = {}) {
  writeSpec(root, "parent", {
    "requirements.md": "# Parent\n\nShared requirements: R1 and R2.\n",
    "design.md": "# Design\n\nOne sub-spec per repository.\n",
    "tasks.md": `# Sub-specs\n\n${members.map((m, i) => `- [ ] \`${i + 1}\` Sub-spec ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [
            String(i + 1),
            { plan: m, summary: `Sub-spec ${m}.`, ...entryExtra },
          ]),
        ),
      },
      null,
      2,
    ),
  });
}
const errors = (quality: ReturnType<typeof lintSpec>) =>
  quality.diagnostics.filter((d) => d.severity === "error");

test("two sub-specs approve separately", async (t) => {
  const { root, store, ops } = workspace(t);
  for (const id of ["code", "repo-a", "repo-b"])
    store.put("repositories", {
      id,
      root,
      baseBranch: "main",
      checks: [["npm", "test"]],
    });
  sub(root, "repo-a", "repo-a");
  sub(root, "repo-b", "repo-b", { "b-1": leaf({ repository: "repo-b" }) });
  const approvals = [];
  for (const spec of ["repo-a", "repo-b"]) {
    const plan = await ops.execute<PlanDraft>("plan.create", {
      spec,
      context: { repositoryId: "code" },
    });
    await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
    approvals.push(plan.id);
  }
  assert.equal(store.list("approvals").length, 2);
  assert.deepEqual(
    store
      .list("approvals")
      .map((a) => a.planId)
      .sort(),
    approvals.sort(),
  );
});
