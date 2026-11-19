// A person's actions on spec review findings (R104.5, R104.6, R104.8):
// plan.review.finding.decide and plan.review.dispose are person-only, record
// who and at which revision, and defer stores a follow-up with no task and
// no GitHub call. The CLI and plans_plan_review show severity, state and
// anchor.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { handleMcp } from "../mcp/mcp.mjs";
import { Operations } from "../api/operations.mjs";
import { quoteHash } from "../reviews/review-findings.mjs";
import { Store } from "../store/store.mjs";
import { initializeWorkspace } from "../workspace/workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const quote = "The tick reads the folder once.";
const design = `# Design\n\nIntro.\n\n${quote}\n`;

function workspace() {
  const root = temporaryDirectory("avoozl-finding-actions-");
  const config = initializeWorkspace(root, { name: "t" });
  const dbPath = config.dbPath || `${root}/.avoozl/local/workspace.sqlite`;
  const store = new Store(dbPath);
  store.transaction(() => {
    store.put("plans", {
      id: "p1",
      title: "Demo",
      state: "draft",
      spec: "demo",
      hash: "h2",
      revision: 2,
      files: { "design.md": design },
      history: [
        { revision: 1, hash: "h1", files: { "design.md": `Old.\n${quote}\n` } },
      ],
    });
    store.put("review_rounds", {
      id: "r1",
      spec: "demo",
      planId: "p1",
      revisionHash: "h1",
      pass: 1,
      round: 1,
      state: "done",
      reviewerModel: "fake-reviewer",
    });
    store.put("review_threads", {
      id: "f1",
      source: "plan-review",
      planId: "p1",
      roundId: "r1",
      revisionHash: "h1",
      state: "open",
      kind: "gap",
      severity: "blocking",
      file: "design.md",
      line: 2,
      anchor: {
        file: "design.md",
        lineStart: 2,
        lineEnd: 2,
        quote,
        quoteHash: quoteHash(quote),
      },
      statement: "No task reads the folder.",
      evidence: "tasks.md has none.",
    });
  });
  const writes = [],
    ops = new Operations(store, {
      workspaceRoot: root,
      operator: "Owner",
      github: {
        available: () => false,
        request: (...args) => {
          writes.push(args);
          throw Error("Unexpected GitHub call");
        },
      },
    });
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: { ...process.env, KIROCREW_SPAWNED: "", KIRO_SESSION_ID: "" },
    });
  return { store, ops, writes, run, root };
}

test("MCP and agent sessions are refused decide and dispose, by any route", async (t) => {
  const { store, ops } = workspace();
  t.after(() => store.close());
  const before = store.read().revision;
  for (const [name, input] of [
    ["plan.review.finding.decide", { id: "f1", action: "resolve" }],
    ["plan.review.dispose", { id: "f1", disposition: "resolved" }],
  ])
    for (const context of [{ mcp: true }, { caller: { sessionKey: "s" } }])
      await assert.rejects(
        ops.execute(name, input, undefined, context),
        (error) => error.status === 403 && /^Only a person/.test(error.message),
        name,
      );
  // No MCP tool offers either one.
  const result = (
    await handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "plans_review",
          arguments: { action: "dispose", input: { id: "f1" } },
        },
      },
      ops,
    )
  ).body.result;
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Unknown action/);
  assert.equal(store.read().revision, before);
  assert.equal(store.get("review_threads", "f1").decisions, undefined);
});

test("a person's actions append in order with who and revision; defer stays local", async (t) => {
  const { store, ops, writes } = workspace();
  t.after(() => store.close());
  const tasks = store.read().tasks.length;
  await ops.execute("plan.review.finding.decide", {
    id: "f1",
    action: "accept",
    revisionHash: "h1",
  });
  await assert.rejects(
    ops.execute("plan.review.finding.decide", {
      id: "f1",
      action: "reject",
      revisionHash: "h2",
    }),
    /reason/,
  );
  await assert.rejects(
    ops.execute("plan.review.finding.decide", {
      id: "f1",
      action: "resolve",
      revisionHash: "not-stored",
    }),
    /stored revisions/,
  );
  await ops.execute("plan.review.finding.decide", {
    id: "f1",
    action: "reject",
    revisionHash: "h2",
    note: "Out of scope.",
  });
  await ops.execute("plan.review.finding.decide", {
    id: "f1",
    action: "reopen",
  });
  // The old dispose maps onto a decision at the current revision.
  await ops.execute("plan.review.dispose", {
    id: "f1",
    disposition: "deferred",
    note: "Next phase.",
  });
  const row = store.get("review_threads", "f1");
  assert.deepEqual(
    row.decisions.map((d) => [d.action, d.by, d.revisionHash, d.note]),
    [
      ["accept", "Owner", "h1", ""],
      ["reject", "Owner", "h2", "Out of scope."],
      ["reopen", "Owner", "h2", ""],
      ["defer", "Owner", "h2", "Next phase."],
    ],
  );
  assert.equal(row.state, "closed");
  assert.deepEqual(
    store
      .list("review_followups")
      .map((f) => [f.findingId, f.spec, f.revisionHash, f.note, f.by]),
    [["f1", "demo", "h2", "Next phase.", "Owner"]],
  );
  assert.equal(store.read().tasks.length, tasks, "defer makes no task");
  assert.deepEqual(writes, [], "no GitHub call");
});

test("plans_plan_review returns severity, state and anchor read-only", async (t) => {
  const { store, ops } = workspace();
  t.after(() => store.close());
  const before = store.read().revision;
  const result = (
    await handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "plans_plan_review",
          arguments: { input: { planId: "p1" } },
        },
      },
      ops,
    )
  ).body.result;
  assert.notEqual(result.isError, true, result.content[0].text);
  const [finding] = JSON.parse(result.content[0].text).findings;
  assert.equal(finding.severity, "blocker");
  assert.equal(finding.category, "gap");
  assert.equal(finding.findingState, "for you");
  assert.equal(finding.state, "open", "the stored state is kept");
  // Anchored at the current revision's lines, from the quote.
  assert.deepEqual(finding.anchor, {
    file: "design.md",
    lineStart: 5,
    lineEnd: 5,
  });
  assert.equal(store.read().revision, before);
});

test("the CLI decides a finding and prints severity, state and anchor", () => {
  const { store, run, root } = workspace();
  // `plan review SPEC` lists the current revision's findings.
  const thread = store.get("review_threads", "f1");
  store.put("review_rounds", {
    ...store.get("review_rounds", "r1"),
    revisionHash: "h2",
  });
  store.put("review_threads", {
    ...thread,
    revisionHash: "h2",
    anchor: { ...thread.anchor, lineStart: 5, lineEnd: 5 },
  });
  store.close();
  const shown = run("plan", "review", "demo");
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /^f1 design\.md:5 blocker for you gap: No task/m);
  const refused = run("plan", "finding", "f1", "reject");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /reason/);
  const done = run("plan", "finding", "f1", "reject", "--note", "Not needed.");
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /^f1: reject by .+ at h2$/m);
  const after = run("plan", "review", "demo");
  assert.match(after.stdout, /^f1 design\.md:5 blocker rejected gap:/m);
  const agent = spawnSync(
    process.execPath,
    [cli, "plan", "finding", "f1", "reopen", "--workspace", root],
    {
      encoding: "utf8",
      env: { ...process.env, AVOOZL_CHILD: "1" },
    },
  );
  assert.notEqual(agent.status, 0);
  assert.match(agent.stderr, /supervisor started/);
});
