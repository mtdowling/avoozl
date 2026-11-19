// A task pinned to the `kirocrew` executor, with no Kiro Crew beside the
// server, waits with one Needs you item that names the pin (SW10.4).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  deliveryPolicy,
  planReadyDispatches,
} from "../../delivery/delivery.mjs";
import { Operations } from "../../api/operations.mjs";
import { enqueueSessionRequests } from "../../sessions/session-requests.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "r1",
  ...extra,
});

function pinned(t) {
  const root = temporaryDirectory("avoozl-pin-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("chat", { session: { harness: "kirocrew" } }), leaf("plain")],
    edges: [],
  });
  store.put("repositories", {
    id: "r1",
    root: temporaryDirectory("avoozl-r1-"),
  });
  return { store, root };
}

// What each tick does: ask for the sessions of the ready tasks.
const tick = (store) =>
  enqueueSessionRequests(
    store,
    {
      starts: planReadyDispatches(
        store,
        deliveryPolicy({ lanes: { local: 5 }, delivery: {} }),
        {},
      ),
    },
    { source: "tick" },
  );

const names = (view) =>
  view.items.filter((item) => item.reason === "needs-kirocrew");

test("a task pinned to kirocrew opens one Needs you item across three ticks, and starts nothing else", async (t) => {
  const { store, root } = pinned(t);
  const ops = new Operations(store, {
    workspaceRoot: root,
    kirocrewAbsent: true,
  });
  for (let i = 0; i < 3; i++) {
    tick(store);
    const found = names(await ops.execute("conflicts.view", {}));
    assert.equal(found.length, 1, `tick ${i + 1}`);
    assert.equal(found[0].taskId, "chat");
    assert.match(found[0].title, /pinned to Kiro Crew/);
    assert.match(found[0].detail, /kirocrew executor/);
  }
  // No fallback: every start request stays on the kirocrew executor.
  assert.deepEqual(
    [...new Set(store.list("session_requests").map((row) => row.executor))],
    ["kirocrew"],
  );
});

test("with Kiro Crew beside the server the item is not made", async (t) => {
  const { store, root } = pinned(t);
  tick(store);
  const ops = new Operations(store, { workspaceRoot: root });
  assert.deepEqual(names(await ops.execute("conflicts.view", {})), []);
});
