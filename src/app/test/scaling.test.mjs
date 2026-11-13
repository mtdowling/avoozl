import test from "node:test";
import assert from "node:assert/strict";
import { documentPages } from "../../document-pages.mjs";
import { opacityPrefix, paintBand } from "../../band-paint.mjs";
import { queryTasks } from "../../query.mjs";
import { browseRows } from "../../browse-model.mjs";

test("dense chart drawing blends pixels instead of drawing every task", () => {
  const data = {
      statuses: [{ id: "done", complete: true }, { id: "planned" }],
      tasks: [],
      edges: [],
    },
    tasks = Array.from({ length: 100000 }, (_, i) => ({
      id: "task-" + i,
      status: i % 2 ? "done" : "planned",
    })),
    prefix = opacityPrefix(data, tasks, new Set(tasks.map((t) => t.id)));
  let calls = 0;
  const ctx = {
    fillRect() {
      calls++;
      assert(this.globalAlpha >= 0 && this.globalAlpha <= 1);
    },
  };
  paintBand(ctx, prefix, {
    width: 800,
    unit: 0.008,
    y: 0,
    height: 80,
    color: "#99ccaa",
  });
  assert(calls <= 400);
  assert(Math.abs(prefix.at(-1) / tasks.length - 0.68) < 1e-8);
});
test("document pages preserve code fences and heading identity across large documents", () => {
  const source =
      "# Plan\n\n" +
      Array.from(
        { length: 100 },
        (_, i) =>
          "## Section " +
          i +
          "\n\n```nupp\n" +
          Array.from({ length: 8 }, () => "local value = 'hello'").join("\n") +
          "\n```\n\nParagraph.\n",
      ).join("\n"),
    pages = documentPages(source, 40);
  assert(pages.length > 10);
  assert.equal(pages.map((p) => p.text).join("\n"), source);
  assert.equal(pages.flatMap((p) => p.headings).length, 101);
  for (const page of pages)
    assert.equal((page.text.match(/^```/gm) || []).length % 2, 0);
});
test("historical browsing is opt-in without losing the status of prerequisites", () => {
  const data = {
    statuses: [
      { id: "planned" },
      { id: "done", complete: true },
      { id: "blocked" },
    ],
    documents: {},
    edges: [{ from: "old", to: "new", kind: "requires" }],
    tasks: [
      {
        id: "old",
        scope: "runtime",
        title: "Old",
        tags: ["historical"],
        status: "done",
      },
      {
        id: "new",
        scope: "runtime",
        title: "New",
        tags: [],
        status: "planned",
      },
      {
        id: "wait",
        scope: "runtime",
        title: "Wait",
        tags: ["ffi"],
        status: "blocked",
      },
    ],
  };
  assert.deepEqual(
    browseRows(data, data.tasks).map((t) => t.id),
    ["new", "wait"],
  );
  assert.equal(browseRows(data, data.tasks, { historical: true }).length, 3);
  assert.deepEqual(
    queryTasks(data, { scope: "all", historical: false, q: "ready:true" }).map(
      (t) => t.id,
    ),
    ["new"],
  );
  assert.equal(
    queryTasks(data, { scope: "all", q: "status:planned|blocked" }).length,
    2,
  );
  assert.equal(
    queryTasks(data, { scope: "all", q: "historical:false" }).length,
    2,
  );
});
