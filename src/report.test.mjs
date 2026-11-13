import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { blocks, digest, queryTasks, validate } from "./model.mjs";
import { syncPlans } from "./catalog.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const minimal = () => ({
  schemaVersion: 1,
  revision: 1,
  updatedAt: new Date().toISOString(),
  project: { pollIntervalMs: 10000 },
  statuses: [
    { id: "planned", complete: false },
    { id: "partial", complete: false },
    { id: "implemented", complete: true },
    { id: "review", complete: false },
  ],
  epics: [
    { id: "W1", title: "Execution" },
    { id: "W2", title: "Storage" },
  ],
  tracks: [{ id: "frontend" }, { id: "storage" }, { id: "catalog" }],
  documents: {},
  tasks: [],
  edges: [],
  changelog: [],
});
// Epics span plans (Requirement 59): each fixture epic becomes an approved
// epic over one plan, and each task with an epic joins that plan.
function crossPlan(d) {
  for (const task of d.tasks)
    if (task.epic) {
      task.planId = "plan-" + task.epic;
      delete task.epic;
    }
  d.epics = d.epics.map((e) => ({
    ...e,
    planId: "epic-" + e.id,
    listed: ["plan-" + e.id],
    plans: ["plan-" + e.id],
  }));
  return d;
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nupp-plan-report-"));
  fs.mkdirSync(path.join(root, "todo"));
  fs.mkdirSync(path.join(root, "native-runtime"));
  fs.writeFileSync(
    path.join(root, "todo/nupp-native-runtime.md"),
    "# Runtime\n\n### W1. Execution\n\n- [ ] Make compiler work\n  Exact context with posix_spawn.\n",
  );
  const d = minimal();
  syncPlans(d, root, { initial: true });
  const t = d.tasks[0];
  t.id = "compiler";
  t.status = "partial";
  t.scope = "runtime";
  t.epic = "W1";
  t.track = "frontend";
  return { root, data: d };
}
test("stable checklist keys distinguish repeated headings and survive inserted prose", () => {
  const original =
    "# Plan\n## First\n- [ ] Same task\n## Second\n- [ ] Same task";
  const a = blocks(original),
    b = blocks("Intro\n" + original);
  assert.equal(new Set(a.map((x) => x.key)).size, 2);
  assert.deepEqual(
    a.map((x) => x.key),
    b.map((x) => x.key),
  );
});
test("plan sync preserves authored status, refreshes context and imports new runtime work for review", () => {
  const f = fixture();
  try {
    const p = path.join(f.root, "todo/nupp-native-runtime.md");
    fs.appendFileSync(
      p,
      "  New design context.\n\n- [ ] New runtime requirement\n",
    );
    const stats = syncPlans(f.data, f.root);
    assert.equal(stats.newTasks, 1);
    assert.equal(f.data.tasks[0].status, "partial");
    assert.equal(f.data.tasks[0].needsReview, true);
    assert.equal(f.data.tasks[1].scope, "runtime");
    assert.equal(f.data.tasks[1].status, "review");
    assert.ok(
      f.data.documents["todo/nupp-native-runtime.md"].text.includes(
        "New design context",
      ),
    );
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
test("new documents restore previously dangling cross-links; removed sources keep records", () => {
  const f = fixture();
  try {
    fs.appendFileSync(
      path.join(f.root, "todo/nupp-native-runtime.md"),
      "\n[Later](later.md)\n",
    );
    syncPlans(f.data, f.root);
    assert.equal(
      f.data.documents["todo/nupp-native-runtime.md"].links.length,
      0,
    );
    fs.writeFileSync(path.join(f.root, "todo/later.md"), "# Later\n");
    syncPlans(f.data, f.root);
    assert.deepEqual(f.data.documents["todo/nupp-native-runtime.md"].links, [
      "todo/later.md",
    ]);
    fs.unlinkSync(path.join(f.root, "todo/nupp-native-runtime.md"));
    syncPlans(f.data, f.root);
    assert.equal(f.data.tasks[0].source.removed, true);
    assert.equal(f.data.tasks[0].status, "partial");
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
test("queries search full context and follow only prerequisite directions", () => {
  const f = fixture();
  try {
    const d = f.data;
    d.tasks.push({
      id: "release",
      title: "Delivery",
      scope: "runtime",
      status: "planned",
      epic: "W2",
      track: "storage",
      tags: ["ship"],
    });
    d.edges.push({ from: "compiler", to: "release", kind: "requires" });
    assert.deepEqual(
      queryTasks(d, { q: "posix_spawn" }).map((t) => t.id),
      ["compiler"],
    );
    assert.deepEqual(
      queryTasks(d, { q: "depends:release" })
        .map((t) => t.id)
        .sort(),
      ["compiler", "release"],
    );
    assert.equal(queryTasks(d, { q: "tag:ship ready:true" }).length, 0);
    d.tasks[0].status = "implemented";
    assert.equal(queryTasks(d, { q: "tag:ship ready:true" }).length, 1);
    assert.equal(validate(d).length, 0);
    d.edges.push({ from: "release", to: "compiler", kind: "requires" });
    assert.ok(validate(d).some((e) => e.includes("cycle")));
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
async function waitFor(fn) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Update not observed");
}
import {
  epicProgress,
  taskProgress,
  chronologicalTasks,
} from "./progress-model.mjs";
import { dispatchMcp } from "./mcp.mjs";
test("epic filters retain scope, completion counts and stable task positions", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "a",
      title: "First",
      epic: "W1",
      status: "implemented",
      scope: "runtime",
      track: "frontend",
      source: { document: "plan", lineStart: 2 },
    },
    {
      id: "b",
      title: "Second",
      epic: "W1",
      status: "partial",
      scope: "runtime",
      track: "frontend",
      source: { document: "plan", lineStart: 8 },
    },
    {
      id: "c",
      title: "Third",
      epic: "W2",
      status: "planned",
      scope: "runtime",
      track: "storage",
    },
  ];
  crossPlan(d);
  const all = epicProgress(d, { scope: "runtime" }),
    filtered = epicProgress(d, {
      scope: "runtime",
      matchingIds: new Set(["b"]),
    });
  assert.deepEqual(
    filtered.map((r) => r.tasks.map((t) => t.id)),
    all.map((r) => r.tasks.map((t) => t.id)),
  );
  assert.equal(filtered[0].percent, 50);
  assert.equal(filtered[0].matches, 1);
  assert.equal(filtered[1].matches, 0);
  assert.equal(
    taskProgress(d, d.tasks[1]),
    0,
    "partial status is not invented 50% progress",
  );
  assert.equal(taskProgress(d, { ...d.tasks[1], progressPercent: 35 }), 0.35);
});
test("chronology honors authored order and dates without moving edited tasks", () => {
  const tasks = [
    { id: "later", timeline: { at: "2026-11-02" } },
    { id: "earlier", timeline: { at: "2026-11-01" } },
    { id: "undated", updatedAt: "2030-01-01" },
  ];
  assert.deepEqual(
    chronologicalTasks(tasks).map((t) => t.id),
    ["earlier", "later", "undated"],
  );
  assert.deepEqual(
    chronologicalTasks([
      { id: "b", timeline: { order: 2 } },
      { id: "a", timeline: { order: 1 } },
    ]).map((t) => t.id),
    ["a", "b"],
  );
});
test("MCP visualization changes presentation only and rejects stale replacements", () => {
  let d = minimal();
  d.tasks = [
    {
      id: "compiler",
      title: "Compiler",
      epic: "W1",
      status: "partial",
      scope: "runtime",
      track: "frontend",
    },
  ];
  const original = structuredClone(d.tasks),
    ctx = {
      base: "http://127.0.0.1:9417",
      read: () => d,
      commit(next) {
        next.revision = d.revision + 1;
        d = next;
      },
    };
  const call = (name, args) =>
    dispatchMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      ctx,
    ).body.result;
  let result = call("plans_visualize", {
    id: "compiler-view",
    title: "Compiler work",
    view: "epics",
    filters: { scope: "runtime" },
    taskIds: ["compiler"],
  });
  assert.equal(result.isError, false);
  assert.match(result.structuredContent.url, /visualization=compiler-view/);
  assert.deepEqual(d.tasks, original);
  assert.equal(d.presentation.activeVisualization.id, "compiler-view");
  assert.equal(
    call("plans_visualize", {
      id: "compiler-view",
      title: "Overwrite",
      view: "graph",
    }).isError,
    true,
  );
  assert.equal(
    call("plans_visualize", {
      title: "Bad",
      view: "epics",
      taskIds: ["missing"],
    }).isError,
    true,
  );
  assert.equal(call("plans_query", { scope: "all", limit: 0 }).isError, true);
  assert.equal(
    call("plans_visualize", {
      id: "compiler-view",
      title: "Updated",
      view: "graph",
      expectedRevision: d.revision,
    }).isError,
    false,
  );
  assert.deepEqual(d.tasks, original);
});
import {
  stripLayout,
  cameraRange,
  zoomCamera,
  focusCamera,
} from "./strip-model.mjs";
test("single strip contains every task exactly once and filters preserve world positions", () => {
  const d = minimal();
  d.tasks = Array.from({ length: 4100 }, (_, i) => ({
    id: "t" + i,
    title: "Task " + i,
    epic: i < 20 ? "W1" : "W2",
    scope: "runtime",
    status: i % 2 ? "planned" : "implemented",
    track: "frontend",
  }));
  crossPlan(d);
  const a = stripLayout(d, { scope: "runtime" }),
    b = stripLayout(d, { scope: "runtime", matchingIds: new Set(["t42"]) });
  assert.equal(a.total, 4100);
  assert.equal(new Set(a.tasks.map((t) => t.task.id)).size, 4100);
  assert.deepEqual(
    a.tasks.map((t) => t.index),
    b.tasks.map((t) => t.index),
  );
  assert.equal(b.groups[1].matches, 1);
});
test("map camera keeps the pointer anchored and can reveal details in a large inventory", () => {
  const total = 4100,
    old = cameraRange(total, 2, 0.5),
    anchor = 0.3,
    next = zoomCamera(total, 2, 0.5, 8, anchor);
  assert.ok(
    Math.abs(old.start + old.span * anchor - next.start - next.span * anchor) <
      1e-8,
  );
  const focused = focusCamera(total, [2000, 2001, 2002]),
    range = cameraRange(total, focused.scale, focused.center);
  assert.ok(range.start <= 2000 && range.end >= 2003);
  assert.ok(900 / range.span > 110);
  assert.equal(cameraRange(total, 1, 0.1).start, 0);
  assert.equal(cameraRange(total, 1, 0.9).end, total);
  assert.equal(cameraRange(0).center, 0.5);
});
test("MCP saves strip focus and narrated breakouts without changing tasks", () => {
  let d = minimal();
  d.tasks = [
    {
      id: "a",
      title: "One",
      epic: "W1",
      scope: "runtime",
      status: "planned",
      track: "frontend",
    },
  ];
  const original = structuredClone(d.tasks),
    ctx = {
      base: "http://127.0.0.1:9417",
      read: () => d,
      commit(n) {
        n.revision = d.revision + 1;
        d = n;
      },
    };
  const call = (name, args) =>
    dispatchMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      ctx,
    ).body.result;
  assert.equal(
    call("plans_visualize", {
      id: "strip-one",
      title: "Everything",
      view: "strip",
      focus: "matches",
      filters: { scope: "runtime" },
      stripZoom: 20,
      stripAt: 0.4,
      activate: false,
    }).isError,
    false,
  );
  assert.equal(d.presentation.views[0].focus, "matches");
  assert.equal(
    call("plans_present", { title: "Bad", steps: [] }).isError,
    true,
  );
  assert.equal(
    call("plans_present", { title: "Bad", steps: [{ viewId: "missing" }] })
      .isError,
    true,
  );
  let r = call("plans_present", {
    id: "first-tour",
    title: "One breakout",
    steps: [{ viewId: "strip-one", caption: "Start here.", durationMs: 1500 }],
  });
  assert.equal(r.isError, false);
  assert.match(r.structuredContent.url, /tour=first-tour/);
  assert.equal(d.presentation.activeTour.autoplay, false);
  assert.equal(
    call("plans_present", {
      id: "first-tour",
      title: "Stale",
      steps: [{ viewId: "strip-one" }],
    }).isError,
    true,
  );
  assert.equal(
    call("plans_activate_visualization", { id: "strip-one" }).isError,
    false,
  );
  assert.equal(d.presentation.activeTour, undefined);
  assert.deepEqual(d.tasks, original);
});

import { captureTask } from "./capture.mjs";
import { planSummaries, applyPlanMetadata } from "./plan-model.mjs";
test("prompt capture inherits view context without inventing dependencies or completion", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "io-task",
      title: "Existing I/O",
      scope: "runtime",
      status: "implemented",
      epic: "W2",
      track: "storage",
      tags: ["io"],
    },
  ];
  const before = structuredClone(d.edges),
    input = {
      submissionId: "capture-one",
      prompt: "Make file reads cooperative\nPreserve cancellation cleanup.",
      context: {
        revision: 1,
        view: "graph",
        filters: {
          scope: "runtime",
          status: "implemented",
          epic: "W2",
          tag: "cleanup",
        },
        selected: "io-task",
        taskIds: ["io-task", "missing"],
        url: "/?view=graph&node=io-task",
      },
    };
  const result = captureTask(d, input);
  // A captured task has no plan, so no epic (Requirement 59.6).
  assert.equal(result.task.epic, undefined);
  assert.equal(result.task.scope, "runtime");
  assert.equal(result.task.track, "storage");
  assert.equal(result.task.status, "planned");
  assert.ok(result.task.tags.includes("cleanup"));
  assert.equal(result.task.prompt, input.prompt);
  assert.deepEqual(result.task.capture.context.taskIds, ["io-task"]);
  assert.deepEqual(d.edges, before);
  assert.equal(captureTask(d, input).task.id, result.task.id);
  assert.equal(d.tasks.length, 2);
  assert.throws(
    () => captureTask(d, { ...input, prompt: "Different request" }),
    /another prompt/,
  );
  const unscoped = captureTask(d, {
    submissionId: "capture-two",
    prompt: "Plan a new graphics library",
    context: { view: "strip", filters: { scope: "all" } },
  }).task;
  assert.equal(unscoped.scope, "catalog");
  assert.equal(unscoped.epic, undefined);
  assert.equal(validate(d).length, 0);
});
test("plan progress distinguishes owned tasks, supporting context, archives and authored estimates", () => {
  const d = minimal();
  d.documents = {
    "todo/io.md": { id: "todo/io.md", title: "File APIs", text: "" },
    "abandoned/old.md": { id: "abandoned/old.md", title: "Old", text: "" },
    "done/design.md": { id: "done/design.md", title: "Design", text: "" },
    "todo/empty.md": {
      id: "todo/empty.md",
      title: "New plan",
      text: "---\ncategory: Runtime\n---\n# New plan\n",
    },
  };
  d.tasks = [
    {
      id: "done",
      scope: "catalog",
      title: "First",
      status: "implemented",
      epic: "doc:todo/io.md",
      source: { document: "todo/io.md" },
    },
    {
      id: "partial",
      scope: "catalog",
      title: "Second",
      status: "partial",
      progressPercent: 20,
      epic: "doc:todo/io.md",
      source: { document: "todo/io.md" },
    },
    {
      id: "context",
      scope: "runtime",
      title: "Supporting work",
      status: "implemented",
      epic: "W1",
      contextDocuments: ["todo/io.md"],
    },
  ];
  let p = planSummaries(d).find((p) => p.doc.id === "todo/io.md");
  assert.equal(p.total, 2);
  assert.equal(p.percent, 60);
  assert.equal(p.status, "started");
  // No authored category: none is guessed from the title ("File APIs").
  assert.equal(p.category, null);
  assert.equal(
    planSummaries(d).find((p) => p.doc.id === "todo/empty.md").category,
    "Runtime",
  );
  assert.equal(
    planSummaries(d).find((p) => p.doc.id === "abandoned/old.md").status,
    "abandoned",
  );
  assert.equal(
    planSummaries(d).find((p) => p.doc.id === "done/design.md").percent,
    100,
  );
  assert.equal(
    planSummaries(d).find((p) => p.doc.id === "todo/empty.md").status,
    "not-started",
  );
  applyPlanMetadata(d, "todo/io.md", {
    category: "Concurrency & I/O",
    targetBranch: "main",
    progressPercent: 42,
    status: "started",
  });
  p = planSummaries(d)[0];
  assert.equal(p.percent, 42);
  assert.equal(p.branch, "main");
  assert.equal(p.basis, "Authored estimate");
  assert.throws(() =>
    applyPlanMetadata(d, "todo/io.md", { progressPercent: 101 }),
  );
  const f = fixture();
  try {
    applyPlanMetadata(f.data, "todo/nupp-native-runtime.md", {
      category: "Core rewrite",
      targetBranch: "runtime",
      status: "started",
    });
    fs.appendFileSync(
      path.join(f.root, "todo/nupp-native-runtime.md"),
      "\nUpdated prose.\n",
    );
    syncPlans(f.data, f.root);
    assert.equal(
      f.data.documents["todo/nupp-native-runtime.md"].plan.targetBranch,
      "runtime",
    );
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
test("MCP document queries share plan summaries and explicit plan ownership", () => {
  const d = minimal();
  d.documents = {
    "todo/runtime.md": {
      id: "todo/runtime.md",
      title: "Runtime",
      text: "Context",
      hash: "hash",
      plan: {
        taskQuery: { scope: "runtime" },
        category: "Core rewrite",
        targetBranch: "runtime",
      },
    },
    "abandoned/old.md": {
      id: "abandoned/old.md",
      title: "Old plan",
      text: "Context",
    },
  };
  d.tasks = [
    {
      id: "a",
      title: "First",
      scope: "runtime",
      status: "implemented",
      epic: "W1",
      track: "frontend",
    },
    {
      id: "b",
      title: "Second",
      scope: "runtime",
      status: "planned",
      epic: "W1",
      track: "frontend",
    },
  ];
  const ctx = { read: () => d };
  const call = (name, args) =>
    dispatchMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      ctx,
    ).body.result;
  const response = call("plans_documents", { branch: "runtime" });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.total, 1);
  assert.equal(response.structuredContent.plans[0].percent, 50);
  assert.equal(response.structuredContent.plans[0].status, "started");
  assert.equal(call("plans_documents", {}).structuredContent.total, 1);
  assert.equal(
    call("plans_documents", { includeAbandoned: true }).structuredContent.total,
    2,
  );
  assert.equal(
    call("plans_get_document", { id: "todo/runtime.md" }).structuredContent
      .progress.percent,
    50,
  );
});

import { highlightNupp, codeBlock } from "./highlight.mjs";
import { renderMarkdown, documentHeadings } from "./markdown.mjs";
const unhighlight = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_, name) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[name],
    );
test("Nupp highlighting preserves text and recognizes ownership, directives, short functions and numbers", () => {
  const code =
    "@!internal\nmodule example\nrecord File\n    handle: owned Handle\nend\nconst read = (f: borrowed File) -> do\n    -- preserve the source bytes\n    local n = 0x1.fp+3 + 1_000ULL\n    return `name: ${f.handle}`\nend\n";
  const html = highlightNupp(code);
  assert.equal(unhighlight(html), code);
  for (const style of [
    "meta",
    "keyword",
    "type",
    "operator",
    "comment",
    "number",
    "string",
  ])
    assert.ok(html.includes("syntax-" + style), style);
  assert.match(html, />owned<\/span>/);
  assert.match(html, />0x1.fp\+3<\/span>/);
  assert.match(html, />1_000ULL<\/span>/);
  assert.match(
    highlightNupp("associated type Item\nlocal type = value\nio.open(path)"),
    />associated<\/span>/,
  );
  assert.match(highlightNupp("io.open(path)"), /syntax-function">open/);
});
test("Nupp strings and long comments do not expose markup or color keywords inside them", () => {
  const source =
    '--[==[ <img src=x onerror=alert(1)> local end ]==]\nconst text = [=[<script>return "&"</script>]=]\nlocal escaped = "a\\\" -- end"';
  const html = highlightNupp(source);
  assert.equal(unhighlight(html), source);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.equal((html.match(/syntax-keyword/g) || []).length, 2);
  assert.match(html, /syntax-comment">--\[==\[/);
  const incomplete = "--[=[unfinished\nreturn 1";
  assert.equal(unhighlight(highlightNupp(incomplete)), incomplete);
});
test("Markdown preserves language fences, literal shorter fences and unfinished code blocks", () => {
  const text =
    "# Example\n\n````nupp\nconst code = [=[\n```\n]=]\nreturn 42\n````\n\n~~~nupp:fragment\n@nosuspend\nlocal n: integer = 1\n~~~\n\n```html\n<script>bad()</script>\n```";
  const html = renderMarkdown(text);
  assert.equal((html.match(/class="language-nupp"/g) || []).length, 2);
  assert.match(html, /data-language="nupp:fragment"/);
  assert.match(html, /syntax-number">42/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.equal((html.match(/<pre /g) || []).length, 3);
  assert.match(
    renderMarkdown("  ```nupp\n  return true\n"),
    /syntax-literal">true/,
  );
  assert.match(codeBlock("local x = 1", "lua"), /syntax-keyword/);
  assert.ok(!codeBlock("local x = 1", "text").includes("syntax-keyword"));
});
test("document TOC ignores code headings and shares unique rendered anchors", () => {
  const text =
    "# One\n## `Two`\n```nupp\n# not a heading\n```\n## Two\n### [Linked](plan.md)\n~~~text\n# also ignored\n~~~";
  const headings = documentHeadings(text),
    html = renderMarkdown(text);
  assert.deepEqual(
    headings.map((h) => h.id),
    ["one", "two", "two-1", "linked"],
  );
  for (const h of headings) assert.ok(html.includes('id="' + h.id + '"'));
  assert.equal(headings[2].level, 2);
});
test("Done first groups complete, partial and remaining tasks without changing filtered positions", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "later",
      title: "Later",
      epic: "W1",
      status: "planned",
      scope: "runtime",
      track: "frontend",
    },
    {
      id: "done",
      title: "Done",
      epic: "W2",
      status: "implemented",
      scope: "runtime",
      track: "storage",
    },
    {
      id: "partial",
      title: "Partial",
      epic: "W1",
      status: "partial",
      scope: "runtime",
      track: "frontend",
    },
    {
      id: "some",
      title: "Some",
      epic: "W2",
      status: "planned",
      progressPercent: 20,
      scope: "runtime",
      track: "storage",
    },
    {
      id: "blocked",
      title: "Blocked",
      epic: "W1",
      status: "planned",
      scope: "runtime",
      track: "frontend",
    },
  ];
  const chronological = stripLayout(d, { scope: "runtime" }),
    sorted = stripLayout(d, { scope: "runtime", order: "progress" }),
    filtered = stripLayout(d, {
      scope: "runtime",
      order: "progress",
      matchingIds: new Set(["later"]),
    });
  assert.notDeepEqual(
    sorted.tasks.map((t) => t.task.id),
    chronological.tasks.map((t) => t.task.id),
  );
  assert.deepEqual(
    sorted.tasks.map((t) => t.task.id),
    ["done", "partial", "some", "later", "blocked"],
  );
  assert.deepEqual(
    sorted.sections.map((s) => [s.title, s.total]),
    [
      ["Done", 1],
      ["Partly done", 2],
      ["Not started", 2],
    ],
  );
  assert.equal(
    new Set(sorted.tasks.map((t) => t.task.id)).size,
    d.tasks.length,
  );
  assert.deepEqual(
    filtered.tasks.map((t) => t.task.id),
    sorted.tasks.map((t) => t.task.id),
  );
  assert.equal(chronological.sections.length, 0);
  const ctx = {
    read: () => d,
    base: "http://127.0.0.1:9417",
    commit(n) {
      Object.assign(d, n);
    },
  };
  const result = dispatchMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plans_visualize",
        arguments: {
          title: "Done first",
          view: "strip",
          stripOrder: "progress",
          activate: false,
        },
      },
    },
    ctx,
  ).body.result;
  assert.equal(result.isError, false);
  assert.equal(d.presentation.views[0].stripOrder, "progress");
  const read = (uri) =>
    dispatchMcp(
      { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri } },
      ctx,
    ).body;
  const listed = dispatchMcp(
    { jsonrpc: "2.0", id: 3, method: "resources/list" },
    ctx,
  ).body.result.resources.map((r) => r.uri);
  assert.deepEqual(listed, ["avoozl://status", "avoozl://visualizations"]);
  // A client from before the rename still reads with its old scheme.
  assert.equal(
    read("old-scheme://visualizations").result.contents[0].text,
    read("avoozl://visualizations").result.contents[0].text,
  );
  assert.equal(read("avoozl://missing").error.code, -32602);
});

import { applyActivity, activityState } from "./activity.mjs";
test("activity reports work independently of progress, expires, and prevents stale worker writes", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "work",
      title: "Work",
      scope: "runtime",
      status: "partial",
      epic: "W1",
      track: "frontend",
      owner: "Historical owner",
    },
  ];
  const now = Date.parse("2026-11-08T12:00:00Z"),
    original = structuredClone(d.tasks[0]);
  assert.equal(
    queryTasks(d, { scope: "all", q: "inflight:true", now }).length,
    0,
  );
  const first = applyActivity(
    d,
    {
      id: "work",
      action: "start",
      owner: "Agent A",
      sessionId: "session-a",
      branch: "feature",
      summary: "Checking ownership",
      leaseMinutes: 5,
    },
    now,
  );
  assert.equal(first.state, "active");
  assert.equal(d.tasks[0].status, original.status);
  assert.equal(d.tasks[0].owner, original.owner);
  assert.equal(
    queryTasks(d, { scope: "all", q: "inflight:true", now }).length,
    1,
  );
  assert.equal(
    queryTasks(d, { scope: "all", activity: "active", now }).length,
    1,
  );
  assert.throws(
    () =>
      applyActivity(
        d,
        {
          id: "work",
          action: "start",
          owner: "Agent B",
          sessionId: "session-b",
        },
        now + 1000,
      ),
    /Already in flight/,
  );
  assert.equal(activityState(d.tasks[0], now + 300000), "stale");
  assert.equal(
    queryTasks(d, { scope: "all", q: "activity:stale", now: now + 300000 })
      .length,
    1,
  );
  const second = applyActivity(
    d,
    { id: "work", action: "start", owner: "Agent B", sessionId: "session-b" },
    now + 300001,
  );
  assert.notEqual(first.activity.leaseId, second.activity.leaseId);
  assert.throws(
    () =>
      applyActivity(
        d,
        { id: "work", action: "heartbeat", leaseId: first.activity.leaseId },
        now + 300002,
      ),
    /lease changed/,
  );
  assert.equal(d.tasks[0].activityHistory[0].owner, "Agent A");
  applyActivity(
    d,
    { id: "work", action: "pause", leaseId: second.activity.leaseId },
    now + 300003,
  );
  assert.equal(activityState(d.tasks[0], now + 300003), "paused");
  applyActivity(
    d,
    {
      id: "work",
      action: "heartbeat",
      leaseId: second.activity.leaseId,
      summary: "Back to validation",
    },
    now + 300004,
  );
  assert.equal(activityState(d.tasks[0], now + 300004), "active");
  applyActivity(
    d,
    { id: "work", action: "finish", leaseId: second.activity.leaseId },
    now + 300005,
  );
  assert.equal(activityState(d.tasks[0], now + 300005), "finished");
  assert.equal(d.tasks[0].status, "partial");
  assert.equal(validate(d).length, 0);
});
test("MCP work sessions return lease ownership and live query fields", () => {
  let d = minimal();
  d.tasks = [
    {
      id: "work",
      title: "Work",
      scope: "catalog",
      status: "planned",
      epic: "W1",
      track: "frontend",
    },
  ];
  const ctx = {
      read: () => d,
      commit(n) {
        n.revision = d.revision + 1;
        d = n;
      },
    },
    call = (name, args) =>
      dispatchMcp(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
        ctx,
      ).body.result;
  const started = call("plans_activity", {
    id: "work",
    action: "start",
    owner: "Agent",
    sessionId: "thread-id",
    branch: "branch",
    summary: "Writing the implementation",
  });
  assert.equal(started.isError, false);
  const query = call("plans_query", { q: "inflight:true" });
  assert.equal(query.structuredContent.total, 1);
  assert.equal(query.structuredContent.tasks[0].activity.owner, "Agent");
  assert.equal(query.structuredContent.tasks[0].activityState, "active");
  assert.equal(
    call("plans_activity", {
      id: "work",
      action: "finish",
      leaseId: "incorrect",
    }).isError,
    true,
  );
  assert.equal(
    call("plans_activity", {
      id: "work",
      action: "finish",
      leaseId: started.structuredContent.activity.leaseId,
    }).isError,
    false,
  );
  assert.equal(d.tasks[0].status, "planned");
});
