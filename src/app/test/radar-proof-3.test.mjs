// Proof 3 (rc-p3): each bad issue is refused by name. Run on a fake GitHub in
// an isolated temporary workspace. A person's or a crew's reading of the
// prompt is not run here: `crewDecision` applies the prompt's rule (build only
// when verify-issue exits 0, else skip as needs-decision naming the check).
import assert from "node:assert/strict";
import test from "node:test";
import { CREW_PROMPT } from "../radar-crew-prompt.mjs";
import { parseProvenance, renderProvenance } from "../github-provenance.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import {
  BATCH_SPEC,
  COMMIT,
  approvedSpec,
  reader,
  workspace,
} from "./radar-fixture.mjs";

const OTHER = "f".repeat(40);
const bodyWith = (body, changes) =>
  body.replace(
    /<!-- avoozl v=1 .* -->/,
    renderProvenance({ ...parseProvenance(body).marker, ...changes }),
  );
// The crew's rule from the one-line prompt.
const crewDecision = (result) =>
  result.exitCode === 0
    ? { action: "build" }
    : {
        action: "skip",
        scope: "needs-decision",
        failed: result.checks
          .filter((c) => c.status === "fail")
          .map((c) => c.name),
      };

for (const mode of ["single-repo", "plans-repo"])
  test(`Proof 3 (${mode}): the good issue builds, each bad one is skipped and names its check`, async (t) => {
    const context = await workspace(t, { mode, coder: "issue-radar" }),
      { github, ops } = context,
      { plan } = await approvedSpec(context, { overrides: BATCH_SPEC });
    await ops.execute("github.project", { planId: plan.id });
    const home = mode === "plans-repo" ? "example/planning" : "example/code",
      source = github.created.find((issue) =>
        issue.body.includes('"taskId":"config.1.1"'),
      );
    assert.match(CREW_PROMPT, /skip it with scope needs-decision/);
    const base = reader(github, source, home, BATCH_SPEC);
    // `answers` replaces what GitHub says for one path.
    const run = (issueChanges, answers = {}) => {
      const issue = {
        number: 900,
        body: issueChanges.body ?? source.body,
        user: { login: issueChanges.author ?? "maintainer" },
      };
      const read = async (path) => {
        if (path === "repos/example/code/issues/900")
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({ body: issue.body, user: issue.user }),
          };
        const hit = Object.entries(answers).find(([key]) =>
          path.startsWith(key),
        );
        if (hit)
          return {
            status: hit[1].status ?? 200,
            headers: {},
            text: JSON.stringify(hit[1].body ?? {}),
          };
        return base(path);
      };
      return verifyIssue("example/code#900", { read });
    };
    const cases = [
      ["good", {}, {}, null],
      [
        "approver without permission",
        { body: bodyWith(source.body, { approvedBy: "reader" }) },
        {
          [`repos/${home}/collaborators/reader/permission`]: {
            body: { permission: "read" },
          },
        },
        ["approver"],
      ],
      [
        "task not in the spec",
        { body: bodyWith(source.body, { tasks: ["config.9.9"] }) },
        {},
        ["spec"],
      ],
      [
        "commit not on the default branch",
        {},
        { [`repos/${home}/compare/`]: { body: { status: "diverged" } } },
        ["commit"],
      ],
      [
        "author without permission, owner's login in the marker",
        { author: "stranger" },
        {
          "repos/example/code/collaborators/stranger/permission": {
            body: { permission: "read" },
          },
        },
        ["author"],
      ],
      [
        "marker edited after approval",
        { body: bodyWith(source.body, { commit: OTHER }) },
        {},
        ["spec", "commit"],
      ],
    ];
    for (const [name, changes, answers, failing] of cases) {
      const result = await run(changes, answers),
        decision = crewDecision(result);
      if (!failing) {
        assert.equal(result.ok, true, name);
        assert.deepEqual(decision, { action: "build" });
        continue;
      }
      assert.equal(result.ok, false, name);
      assert.equal(decision.action, "skip", name);
      assert.equal(decision.scope, "needs-decision", name);
      assert.deepEqual(decision.failed, failing, name);
      // No issue text is quoted back.
      assert.doesNotMatch(JSON.stringify(result), /Acceptance criteria/);
    }
  });
