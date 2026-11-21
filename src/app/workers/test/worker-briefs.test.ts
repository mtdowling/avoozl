// The pair table (worker-paths WP3, design D3): every executor and task kind
// has a brief or a stated reason, and every brief runs to a recorded result.
import assert from "node:assert/strict";
import test from "node:test";
import { workerBrief } from "../../delivery/delivery.ts";
import {
  briefCell,
  EXECUTORS,
  KINDS,
  WORKER_BRIEFS,
} from "../worker-briefs.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { fakeExecutor } from "../../test/worker-fakes.ts";

const REPOSITORY = { id: "app", root: "/tmp/app", baseBranch: "main" };
const TASK = { id: "a", title: "Task a", acceptance: ["Works."] };

// The brief each cell builds, as the session would read it, or null when the
// cell is declined.
function build(executor: string, kind: string): string | null {
  const { cell, declined } = briefCell(executor, kind);
  if (declined || kind !== briefCell(executor, kind).kind) return null;
  if (kind === "round") return cell.finish ?? null;
  const cliReport = { worktree: "/tmp/wt", token: "tok", workspace: "/tmp/ws" };
  return workerBrief(TASK, REPOSITORY, {
    attempt: 1,
    steps: cell.steps?.({ task: TASK, repository: REPOSITORY, cliReport }),
  });
}

test("every executor and kind has a brief or a stated reason", () => {
  for (const executor of EXECUTORS) {
    assert.deepEqual(
      Object.keys(WORKER_BRIEFS[executor]).sort(),
      [...KINDS].sort(),
    );
    for (const kind of KINDS) {
      const found = WORKER_BRIEFS[executor][kind];
      if (found.declined) {
        assert.ok(found.declined.length > 10, `${executor} ${kind}: a reason`);
        const fallback = found.fallback ?? "";
        assert.ok(KINDS.includes(fallback), `${executor} ${kind}`);
        assert.ok(!WORKER_BRIEFS[executor][fallback].declined);
      } else
        assert.ok(
          Boolean(found.steps || found.finish),
          `${executor} ${kind}: a builder`,
        );
    }
  }
});

test("a pair missing from the table is an error, not a default", () => {
  assert.throws(() => briefCell("kirocrew", "elsewhere"), /No brief/);
});

test("every cell's brief runs through a fake executor to a recorded result", (t) => {
  const worktree = temporaryDirectory("avoozl-pair-");
  for (const executor of EXECUTORS)
    for (const kind of KINDS) {
      const brief = build(executor, kind);
      if (brief === null) continue;
      const result = fakeExecutor(executor, brief, worktree);
      assert.equal(result.problem, undefined, `${executor} ${kind}`);
      assert.equal(result.state, "done", `${executor} ${kind}`);
    }
  t.diagnostic("ran every cell that is not declined");
});

test("a `process` brief asks for no commit, push or runner report", () => {
  for (const kind of KINDS) {
    const brief = build("process", kind);
    if (brief === null) continue;
    // "Do not commit, push ..." is the boundary; take those sentences out.
    const rest = brief.replace(/Do not [^.]*\./g, "");
    for (const pattern of [
      /\bcommit (every|your|the|it|them|and)\b/i,
      /\bgit (commit|push)\b/i,
      /\bpush (it|the|your|to)\b/i,
      /runner report/,
      /plans_report/,
    ])
      assert.doesNotMatch(rest, pattern, `process ${kind}: ${pattern}`);
  }
});
