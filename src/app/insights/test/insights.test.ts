// The Insights operations (simplify §D13): telemetry numbers from a fixture
// store, burndown from a fixture git repository, saved retros, and the
// `avoozl insights` text.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { OPERATIONS } from "../../api/operation-table.ts";
import { Operations } from "../../api/operations.ts";
import { insightsText } from "../../commands/insights.ts";
import { GROUPED_TOOLS } from "../../mcp/mcp-tools.ts";
import { finishTask, span } from "../../telemetry/record.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { telemetryInsights } from "../insights.ts";
import { retrosFolder, saveRetro } from "../retros.ts";
import type { Store } from "../../store/store.ts";
import { found } from "../../test/view-shapes.ts";

// telemetryInsights, for the fields these tests read. Its rows come from
// SQLite untyped.
interface Insights {
  finished: { day: string; count: number }[];
  leadTime: {
    tasks: { taskId: string; seconds: number }[];
    median: number | null;
    p85: number | null;
  };
  stages: ({
    stage: string;
    seconds: number;
    spans: number;
    tasks: number;
  } | null)[];
  review: {
    tasks: number;
    average: number | null;
    rounds: { label: string; tasks: number }[];
  };
  rework: {
    finished: number;
    reworked: number;
    firstPass: number;
    judged: number;
  };
}
const insights = (
  store: Store,
  filter: Parameters<typeof telemetryInsights>[1],
): Insights => telemetryInsights(store.db, filter);
// insights.view, for the fields these tests read.
interface InsightsView {
  burndown: { spec: string; points: { open: number; done: number }[] }[];
  filters: { specs: string[] };
  range: { days: number };
  strip: {
    needsYou: number;
    inFlight: number;
    loop: boolean;
    main: { state: string };
  };
  rework: { finished: number };
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

// One task's stage spans, then its root span and points.
function task(
  store: Store,
  id: string,
  start: number,
  stages: [string, number, number, number][],
  fields: Record<string, unknown>,
) {
  for (const [stage, from, to, attempt] of stages)
    span(store, {
      key: `${id}:${stage}:${attempt}:${from}`,
      taskId: id,
      stage,
      attempt,
      source: "runner",
      startedAt: iso(start + from * HOUR),
      endedAt: iso(start + to * HOUR),
      ...fields,
    });
  const end = Math.max(...stages.map((s) => s[2]));
  finishTask(store, {
    taskId: id,
    ...fields,
    finishedAt: iso(start + end * HOUR),
    outcome: "landed",
    firstPass: !stages.some((s) => s[0] === "rework"),
  });
}

function timed(t: TestContext) {
  const { store } = fixture(t);
  // a: two review rounds with rework between; b: one round; c: 40 days ago.
  task(
    store,
    "a",
    NOW - 3 * DAY,
    [
      ["coding", 0, 2, 1],
      ["review", 2, 2.5, 1],
      ["rework", 2.5, 3, 2],
      ["review", 3, 3.5, 2],
      ["merge", 3.5, 4, 2],
    ],
    { repo: "web", spec: "parser" },
  );
  task(
    store,
    "b",
    NOW - 1 * DAY,
    [
      ["coding", 0, 1, 1],
      ["review", 1, 1.5, 1],
    ],
    { repo: "api", spec: "other" },
  );
  task(store, "c", NOW - 40 * DAY, [["coding", 0, 1, 1]], {
    repo: "web",
    spec: "parser",
  });
  return store;
}

test("telemetry insights count finished tasks, lead time, stages, review rounds and rework in range", (t) => {
  const store = timed(t),
    view = insights(store, { days: 30, now: NOW });
  assert.equal(view.finished.length, 30);
  assert.equal(view.finished.at(-1)?.day, "2026-11-20");
  assert.equal(
    view.finished.reduce((n, d) => n + d.count, 0),
    2,
  );
  assert.equal(view.finished.find((d) => d.day === "2026-11-17")?.count, 1);
  assert.deepEqual(
    view.leadTime.tasks.map((x) => [x.taskId, x.seconds]),
    [
      ["a", 4 * 3600],
      ["b", 1.5 * 3600],
    ],
  );
  assert.equal(view.leadTime.median, 1.5 * 3600);
  assert.equal(view.leadTime.p85, 4 * 3600);
  assert.deepEqual(
    view.stages.map((s) => [s?.stage, s?.seconds, s?.spans, s?.tasks]),
    [
      ["coding", 3 * 3600, 2, 2],
      ["review", 1.5 * 3600, 3, 2],
      ["rework", 1800, 1, 1],
      ["merge", 1800, 1, 1],
    ],
  );
  assert.deepEqual(view.review, {
    tasks: 2,
    average: 1.5,
    rounds: [
      { label: "1", tasks: 1 },
      { label: "2", tasks: 1 },
      { label: "3+", tasks: 0 },
    ],
  });
  assert.deepEqual(view.rework, {
    finished: 2,
    reworked: 1,
    firstPass: 1,
    judged: 2,
  });
});

test("telemetry insights narrow by spec, repository and range", (t) => {
  const store = timed(t);
  const parser = insights(store, {
    days: 30,
    spec: "parser",
    now: NOW,
  });
  assert.deepEqual(
    parser.leadTime.tasks.map((x) => x.taskId),
    ["a"],
  );
  const api = insights(store, { days: 30, repo: "api", now: NOW });
  assert.deepEqual(
    api.leadTime.tasks.map((x) => x.taskId),
    ["b"],
  );
  const wide = insights(store, { days: 90, now: NOW });
  assert.equal(wide.rework.finished, 3);
  const week = insights(store, {
    days: 7,
    spec: "parser",
    repo: "api",
    now: NOW,
  });
  assert.equal(week.rework.finished, 0);
  assert.deepEqual(week.stages, []);
  assert.equal(week.leadTime.median, null);
  assert.equal(week.review.average, null);
});

const TASKS = (marks: Record<string, string>) =>
  [
    "## Phase 1: Tokens",
    "",
    `- [${marks["p-1"] ?? " "}] \`p-1\` Read the token table`,
    "  - Done",
    "- [ ] `p-2` Report and recover (**PARALLEL**)",
    `  - [${marks["p-2.1"] ?? " "}] \`p-2.1\` Report unknown tokens`,
    "    - Done",
    "  - [ ] `p-2.2` Recover after an unknown token",
    "    - Done",
    `- [${marks["p-3"] ?? " "}] \`p-3\` Report the recovery count`,
    "  - Done",
    "",
  ].join("\n");

// A git repository at `root` whose spec task lists change at given times.
function history(root: string) {
  const run = (args: string[], at = Date.now()) =>
    execFileSync("git", args, {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Owner",
        GIT_AUTHOR_EMAIL: "owner@example.test",
        GIT_COMMITTER_NAME: "Owner",
        GIT_COMMITTER_EMAIL: "owner@example.test",
        GIT_AUTHOR_DATE: iso(at),
        GIT_COMMITTER_DATE: iso(at),
      },
      stdio: "pipe",
    });
  run(["init", "-q", "-b", "main"]);
  const commit = (name: string, marks: Record<string, string>, ago: number) => {
    writeSpec(root, name, { "tasks.md": TASKS(marks) });
    run(["add", ".kiro"]);
    run(["commit", "-q", "-m", `${name} ${ago}`], Date.now() - ago * DAY);
  };
  commit("parser", {}, 20);
  commit("quiet", {}, 20);
  commit("parser", { "p-2.1": "x" }, 10);
  commit("parser", { "p-2.1": "x", "p-1": "x", "p-3": "x" }, 2);
}

test("insights.view draws each spec's burndown from its tick commits", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, {
      workspaceRoot: root,
      configDirectory: path.join(root, "machine"),
    });
  history(root);
  const month = await ops.execute<InsightsView>("insights.view", { days: 30 });
  assert.deepEqual(
    month.burndown.map((b) => b.spec),
    ["parser", "quiet"],
  );
  const parser = found(month.burndown[0]).points.map((p) => [p.open, p.done]);
  assert.deepEqual(parser, [
    [4, 0],
    [3, 1],
    [1, 3],
    [1, 3],
  ]);
  // A week starts from the list as it stood a week ago, and leaves out a
  // spec whose list did not change.
  const week = await ops.execute<InsightsView>("insights.view", { days: 7 });
  assert.deepEqual(
    week.burndown.map((b) => [b.spec, b.points.map((p) => [p.open, p.done])]),
    [
      [
        "parser",
        [
          [3, 1],
          [1, 3],
          [1, 3],
        ],
      ],
    ],
  );
  const quiet = await ops.execute<InsightsView>("insights.view", {
    days: 7,
    spec: "quiet",
  });
  assert.deepEqual(
    quiet.burndown.map((b) => [b.spec, b.points.map((p) => [p.open, p.done])]),
    [
      [
        "quiet",
        [
          [4, 0],
          [4, 0],
        ],
      ],
    ],
  );
  assert.ok(month.filters.specs.includes("parser"));
});

test("insights.view has the top strip, and refuses another range", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, {
      workspaceRoot: root,
      configDirectory: path.join(root, "machine"),
    });
  const view = await ops.execute<InsightsView>("insights.view", {});
  assert.equal(view.range.days, 30);
  assert.equal(typeof view.strip.needsYou, "number");
  assert.deepEqual(
    [view.strip.inFlight, view.strip.loop, view.strip.main.state],
    [0, false, "unknown"],
  );
  assert.deepEqual(view.burndown, []);
  assert.equal(view.rework.finished, 0);
  await assert.rejects(
    ops.execute<InsightsView>("insights.view", { days: 14 }),
    /7, 30 or 90/,
  );
});

test("the main check state reads the line watch: passing, stopped or unknown", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, {
      workspaceRoot: root,
      configDirectory: path.join(root, "machine"),
    });
  store.put("repositories", { id: "web", root });
  store.put("flow_records", {
    id: "landing:web",
    kind: "landing",
    repositoryId: "web",
    head: "abc",
    green: { test: "abc" },
  });
  assert.equal(
    (await ops.execute<InsightsView>("insights.view", {})).strip.main.state,
    "passing",
  );
  store.put("flow_stops", {
    id: "s1",
    repositoryId: "web",
    check: "test",
    openedAt: iso(NOW),
  });
  assert.equal(
    (await ops.execute<InsightsView>("insights.view", {})).strip.main.state,
    "stopped",
  );
});

test("retro.save writes Markdown under .avoozl/local/retros, and list and read show it", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  assert.deepEqual(await ops.execute("retro.list", {}), { items: [] });
  // A session saves through MCP: the operation is routed there.
  const first = await ops.execute<{ name: string; title: string }>(
    "retro.save",
    { scope: "Parser spec", text: "# Retro: parser\n\nReview waits most." },
    undefined,
    { mcp: true },
  );
  assert.match(first.name, /^\d{4}-\d{2}-\d{2}-\d{4}-parser-spec\.md$/);
  assert.equal(first.title, "Retro: parser");
  assert.equal(
    fs.readFileSync(path.join(retrosFolder(root), first.name), "utf8"),
    "# Retro: parser\n\nReview waits most.\n",
  );
  const at = new Date("2026-11-21T09:30:00Z");
  const a = saveRetro(root, { scope: "workspace", text: "# One" }, at),
    b = saveRetro(root, { scope: "workspace", text: "# Two" }, at);
  assert.deepEqual(
    [a.name, b.name],
    ["2026-11-21-0930-workspace.md", "2026-11-21-0930-workspace-2.md"],
  );
  const list = await ops.execute<{ items: { at: string }[] }>("retro.list", {});
  assert.equal(list.items.length, 3);
  assert.deepEqual(
    list.items
      .map((item) => item.at)
      .toSorted()
      .reverse(),
    list.items.map((item) => item.at),
  );
  const read = await ops.execute<{ text: string }>("retro.read", {
    name: a.name,
  });
  assert.equal(read.text, "# One\n");
  for (const name of [
    "../workspace.sqlite",
    "x.md",
    "2026-11-21-0930-workspace.txt",
  ])
    await assert.rejects(
      ops.execute("retro.read", { name }),
      /Name a saved retro/,
    );
  await assert.rejects(
    ops.execute("retro.read", { name: "2026-01-01-0000-none.md" }),
    /No saved retro/,
  );
  await assert.rejects(
    ops.execute("retro.save", { scope: "x", text: "  " }),
    /Markdown text/,
  );
  await assert.rejects(
    ops.execute("retro.save", { scope: "---", text: "# x" }),
    /scope/,
  );
});

test("the insights and retro operations are on MCP, and retro.save is the only write", () => {
  for (const name of [
    "insights.view",
    "retro.save",
    "retro.list",
    "retro.read",
  ])
    assert.equal(found(OPERATIONS.get(name)).policy.kind, "routed");
  assert.equal(found(OPERATIONS.get("retro.save")).class, "draft");
  for (const name of ["insights.view", "retro.list", "retro.read"])
    assert.equal(found(OPERATIONS.get(name)).class, "observe");
  const routes = Object.values(GROUPED_TOOLS).flatMap((tool) =>
    Object.values(tool.actions).map((action) => action[0]),
  );
  for (const name of [
    "insights.view",
    "retro.save",
    "retro.list",
    "retro.read",
  ])
    assert.ok(routes.includes(name), name);
});

test("avoozl insights prints the strip, the charts' numbers and each burndown", (t) => {
  const store = timed(t),
    lines = insightsText({
      range: { days: 30, spec: null, repo: null },
      strip: {
        needsYou: 2,
        inFlight: 1,
        ready: 3,
        main: { state: "passing" },
        loop: true,
      },
      burndown: [
        {
          spec: "parser",
          points: [
            { open: 4, done: 0 },
            { open: 1, done: 3 },
          ],
        },
      ],
      ...insights(store, { days: 30, now: NOW }),
    });
  assert.equal(
    lines[0],
    "Needs you 2 · In flight 1 · Ready 3 · Main passing · Autopilot on",
  );
  assert.ok(lines.includes("Finished tasks: 2"));
  assert.ok(
    lines.includes("Lead time: median 1.5 h, 85th percentile 4 h over 2 tasks"),
  );
  assert.ok(
    lines.includes(
      "Review rounds: 1.5 on average over 2 tasks (1: 1, 2: 1, 3+: 0)",
    ),
  );
  assert.ok(lines.includes("  parser: 4 / 0 → 1 / 3"));
  const empty = insightsText({
    range: { days: 7, spec: "x", repo: null },
    strip: {
      needsYou: 0,
      inFlight: 0,
      ready: 0,
      main: { state: "unknown" },
      loop: false,
    },
    burndown: [],
    ...insights(fixture(t).store, { days: 7, now: NOW }),
  });
  assert.ok(empty.includes("Rework: no finished tasks"));
  assert.ok(empty.includes("  No task list changed in this range."));
});
