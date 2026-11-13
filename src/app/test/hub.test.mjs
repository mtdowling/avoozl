import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { createPlan } from "../plans.mjs";
test("deleting conversations and drafts preserves audit history, can restore, and refuses active or approved work", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("runs", {
    id: "chat",
    taskId: "conversation:chat",
    mode: "ask",
    state: "completed",
    prompt: "Question",
  });
  store.event("chat", "message", { text: "An answer" });
  await ops.execute("run.delete", { id: "chat" });
  assert.equal((await ops.execute("run.list")).total, 0);
  assert.equal(
    (await ops.execute("run.get", { id: "chat" })).events[0].text,
    "An answer",
  );
  await ops.execute("run.restore", { id: "chat" });
  assert.equal((await ops.execute("run.list")).total, 1);
  store.put("runs", {
    id: "active-chat",
    taskId: "sample-task",
    state: "running",
  });
  await assert.rejects(
    ops.execute("run.delete", { id: "active-chat" }),
    /Stop this session/,
  );
  const plan = createPlan(store, { prompt: "A draft" });
  await ops.execute("plan.delete", { id: plan.id });
  assert.equal((await ops.execute("plan.list")).total, 0);
  await ops.execute("plan.restore", { id: plan.id });
  assert.equal((await ops.execute("plan.list")).total, 1);
  store.put("plans", { ...plan, state: "approved" });
  await assert.rejects(
    ops.execute("plan.delete", { id: plan.id }),
    /approved revision.*retire: true/,
  );
});
test("chat Markdown renders formatting and safe links without interpreting embedded HTML", async () => {
  const { renderMarkdown, renderInline } = await import("../../markdown.mjs");
  const html = renderMarkdown(
    "**Result** and `a < b`\n\n1. [View](https://example.com/?q=a&b=c)\n2. *Next*\n\n<script>alert(1)</script>\n\n```nupp\nreturn true\n```",
    renderInline,
  );
  assert.match(html, /<strong>Result<\/strong>/);
  assert.match(html, /<code>a &lt; b<\/code>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<em>Next<\/em>/);
  assert.match(html, /href="https:\/\/example.com\/\?q=a&amp;b=c"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /syntax-literal/);
  assert.doesNotMatch(renderInline("[bad](javascript:evil)"), /href=/);
});

test("document Markdown keeps wrapped lists, nesting, union table cells and task checkboxes", async () => {
  const { renderMarkdown } = await import("../../markdown.mjs");
  const html = renderMarkdown(
    "- First line\n  continues **bold**\n  - Nested\n\n| Call | Type |\n| --- | --- |\n| `a | b` | value |\n\n- [x] Done\n- [ ] Later",
  );
  assert.match(html, /<li>First line\ncontinues <strong>bold<\/strong><ul>/);
  assert.match(html, /<td><code>a \| b<\/code><\/td>/);
  assert.match(html, /<thead>/);
  assert.match(
    html,
    /<input(?=[^>]*type="checkbox")(?=[^>]*checked="")(?=[^>]*disabled="")[^>]*>/,
  );
  assert.doesNotMatch(renderMarkdown("<img src=x onerror=evil()>"), /<img /);
});
test("agent pins stay anchored and spread nearby workers into separate clickable pointers", async () => {
  const { agentPins } = await import("../../agent-pins.mjs");
  const items = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      task: { id: "task-" + i },
    })),
    pins = agentPins(items, { start: 0, end: 1000, width: 800 });
  assert.equal(pins.length, 8);
  assert(pins.every((p) => p.anchor < 7));
  const positions = [...pins].sort((a, b) => a.x - b.x);
  assert(positions.every((p, i) => !i || p.x - positions[i - 1].x >= 38));
  assert.equal(
    agentPins(items, { start: 100, end: 200, width: 800 }).length,
    0,
  );
});
test("very large active-agent collections keep a bounded set of pins and account for every worker", async () => {
  const { agentPins } = await import("../../agent-pins.mjs");
  const pins = agentPins(
    Array.from({ length: 100000 }, (_, i) => ({
      index: i,
      task: { id: "task-" + i },
    })),
    { start: 0, end: 100000, width: 900 },
  );
  assert(pins.length <= 120);
  assert.equal(
    pins.reduce((sum, p) => sum + (p.items?.length || 1), 0),
    100000,
  );
});
