// The assignee rule (workflow v1 rule 8.3): a spec runs here only when its
// spec issue, and every parent spec's, names this runner's login alone.
// Every name is made up.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedTo,
  assigneeHolds,
  readSpecAssignees,
} from "../spec-assignee.ts";
import { fixture } from "../../test/fixtures.ts";

// Why the rule holds a spec, or "" when it passes.
const reason = (assigned: ReturnType<typeof assignedTo>) =>
  assigned.pass ? "" : assigned.reason;

test("one assignee that is this login passes; nobody, another or two hold", () => {
  assert.deepEqual(assignedTo({ assignees: [{ login: "Mona" }] }, "mona"), {
    pass: true,
  });
  assert.match(reason(assignedTo({ assignees: [] }, "mona")), /no assignee/);
  assert.match(
    reason(assignedTo({ assignees: [{ login: "octo" }] }, "mona")),
    /assigned to octo/,
  );
  assert.equal(assignedTo({ assignees: ["mona", "octo"] }, "mona").pass, false);
});

test("a spec runs only when its own and its parent's spec issues name this login alone", async (t) => {
  const { store } = fixture(t);
  const plan = (id: string, tasks: string) =>
    store.put("plans", {
      id,
      spec: id,
      state: "approved",
      files: { "tasks.md": tasks },
    });
  plan("parent", "- [ ] `p-1` Build [child](../child/tasks.md)\n");
  plan("child", "- [ ] `c-1` Do it\n  - Done\n");
  plan("mine", "- [ ] `m-1` Do it\n  - Done\n");
  plan("local", "- [ ] `l-1` Do it\n  - Done\n");
  plan("solo", "- [ ] `s-1` Do it\n  - Done\n");
  store.put("repositories", { id: "app", github: "o/app" });
  store.put("repositories", { id: "scratch" });
  const data = store.read(),
    sample = data.tasks[0];
  for (const [id, repository] of [
    ["local", "app"],
    ["solo", "scratch"],
  ])
    data.tasks.push({ ...sample, id: `${id}-1`, planId: id, repository });
  store.write(data);
  const issues: Record<number, string[]> = {
    1: ["octo"],
    2: ["mona"],
    3: ["mona"],
  };
  for (const [id, number] of [
    ["parent", 1],
    ["child", 2],
    ["mine", 3],
  ])
    store.put("receipts", {
      id: `github-parent:plan:${id}`,
      repository: "o/app",
      number,
    });
  const github = {
    personLogin: async () => "mona",
    issue: async (_repository: string, number: number) => ({
      assignees: issues[number],
    }),
  };
  assert.deepEqual(await readSpecAssignees(store, github), []);
  const holds = assigneeHolds(store);
  assert.match(holds.get("parent") ?? "", /assigned to octo/);
  // The child's own issue is mine, but its parent's is not.
  assert.match(
    holds.get("child") ?? "",
    /parent spec parent: .*assigned to octo/,
  );
  assert.equal(holds.has("mine"), false);
  // A spec in a GitHub-backed repository with no spec issue waits for it.
  assert.equal(holds.get("local"), "assignee: spec issue not published yet");
  // A repository with no GitHub name is local-only, so its spec runs here.
  assert.equal(holds.has("solo"), false);
  // A failed read keeps the last result and says so.
  github.issue = async () => {
    throw new Error("offline");
  };
  assert.equal((await readSpecAssignees(store, github)).length, 3);
  assert.match(assigneeHolds(store).get("parent") ?? "", /assigned to octo/);
});
