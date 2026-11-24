// Labeled issues' authorization (workflow v1 rule 11): this login as the
// only assignee, the label event kept on the task, no edit after it, a long
// body held, and the check again before Avoozl closes the issue. Every name
// is made up; no network.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  closeLanded,
  labeledIssueRefusal,
  readLabeledIssues,
} from "../labeled-issues.ts";
import { fixture } from "../../test/fixtures.ts";
import type { Store } from "../../store/store.ts";
import type { Task } from "../../../types.ts";

const LABELED_AT = "2026-11-20T10:00:00Z";
const BEFORE = "2026-11-20T09:00:00Z";
const AFTER = "2026-11-20T11:00:00Z";

// One issue on the fake, as a test sets it.
interface State {
  state: string;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  // Who added each label, and when the require label went on.
  by: Record<string, string>;
  labeledAt: string;
  eventId: number;
  renamedAt?: string;
  // lastEditedAt: null when never edited; undefined leaves it out.
  edited?: string | null;
}

// A fake GitHub for o/app: issue 12, the reads labeled issues make, and the
// writes recorded. `graphql: false` takes the edit read away.
function fake(given: Partial<State> = {}, { graphql = true } = {}) {
  const issue: State = {
      state: "open",
      title: "Fix the crash",
      body: "Empty input no longer crashes.",
      labels: ["agent-ok"],
      assignees: ["mona"],
      by: { "agent-ok": "mona" },
      labeledAt: LABELED_AT,
      eventId: 501,
      edited: null,
      ...given,
    },
    writes: unknown[][] = [],
    roles: Record<string, string> = {
      mona: "write",
      tri: "triage",
      stranger: "read",
    };
  const rest = () => ({
    number: 12,
    state: issue.state,
    title: issue.title,
    body: issue.body,
    labels: issue.labels.map((name) => ({ name })),
    assignees: issue.assignees.map((login) => ({ login })),
  });
  return {
    writes,
    personLogin: async () => "mona",
    listIssues: async () => [rest()],
    issue: async () => rest(),
    issueEvents: async () => [
      ...issue.labels.map((name) => ({
        id: name === "agent-ok" ? issue.eventId : 900,
        event: "labeled",
        created_at: issue.labeledAt,
        label: { name },
        actor: { login: issue.by[name] ?? "mona" },
      })),
      ...(issue.renamedAt
        ? [{ id: 700, event: "renamed", created_at: issue.renamedAt }]
        : []),
    ],
    permission: async (_repository: string, login: string | undefined) => ({
      permission: roles[login ?? ""] ?? "none",
    }),
    ...(graphql
      ? {
          graphql: async <T>() =>
            ({
              repository: {
                i12:
                  issue.edited === undefined
                    ? {}
                    : { lastEditedAt: issue.edited },
              },
            }) as T,
        }
      : {}),
    createIssueComment: async (...args: unknown[]) => {
      writes.push(["comment", ...args]);
    },
    updateIssue: async (...args: unknown[]) => {
      writes.push(["update", ...args]);
    },
  };
}

function workspace(t: TestContext, exclude: string[] = []) {
  const { store } = fixture(t);
  store.put("repositories", {
    id: "app",
    github: "o/app",
    labels: { require: ["agent-ok"], exclude },
  });
  return store;
}

const issueTask = (store: Store) =>
  store.read().tasks.find((task: Task) => task.id === "issue-12");

test("an issue counts with this login as its only assignee, and its task keeps the label event", async (t) => {
  const store = workspace(t);
  await readLabeledIssues(store, fake({ assignees: ["mona", "octo"] }));
  assert.equal(issueTask(store), undefined, "two assignees");
  await readLabeledIssues(store, fake());
  const task = issueTask(store);
  assert.deepEqual(task?.labeledIssue, {
    repository: "o/app",
    number: 12,
    event: { id: "501", createdAt: LABELED_AT },
  });
  assert.deepEqual(task?.acceptance, ["Empty input no longer crashes."]);
});

test("an issue edited or renamed after its label, or whose edit time GitHub does not give, is refused", async (t) => {
  // Nearby input: the same issue edited before the label is taken.
  const cases: [string, Partial<State>, { graphql?: boolean }, boolean][] = [
    ["edited before", { edited: BEFORE }, {}, true],
    ["edited after", { edited: AFTER }, {}, false],
    ["renamed after", { renamedAt: AFTER }, {}, false],
    ["edit time missing", { edited: undefined }, {}, false],
    ["no edit read", {}, { graphql: false }, false],
  ];
  for (const [name, given, options, taken] of cases) {
    const store = workspace(t);
    await readLabeledIssues(store, fake(given, options));
    assert.equal(Boolean(issueTask(store)), taken, name);
  }
});

test("an exclude label holds the issue whoever added it", async (t) => {
  const store = workspace(t, ["needs-design"]);
  await readLabeledIssues(
    store,
    fake({
      labels: ["agent-ok", "needs-design"],
      by: { "agent-ok": "mona", "needs-design": "tri" },
    }),
  );
  assert.equal(issueTask(store), undefined);
});

test("a body over the cap is held whole with a reason, never cut", async (t) => {
  const store = workspace(t),
    body = "x".repeat(4001);
  await readLabeledIssues(store, fake({ body }));
  const task = issueTask(store);
  assert.deepEqual(task?.acceptance, [body]);
  assert.match(String(task?.decision), /over 4000 characters/);
});

test("a label added again before the work starts replaces the task's event", async (t) => {
  const store = workspace(t);
  await readLabeledIssues(store, fake());
  await readLabeledIssues(
    store,
    fake({ eventId: 502, labeledAt: AFTER, edited: LABELED_AT }),
  );
  assert.equal(issueTask(store)?.labeledIssue?.event?.id, "502");
});

test("the check before closing refuses an issue edited, relabeled or reassigned since its task was made", async (t) => {
  const store = workspace(t);
  await readLabeledIssues(store, fake());
  const task = issueTask(store),
    refusal = (given: Partial<State>) =>
      labeledIssueRefusal(store, fake(given), task);
  assert.equal(await refusal({}), null);
  assert.match(String(await refusal({ edited: AFTER })), /changed after/);
  assert.match(
    String(await refusal({ eventId: 502, labeledAt: AFTER })),
    /labeled again/,
  );
  assert.match(
    String(await refusal({ assignees: ["octo"] })),
    /not assigned to mona alone/,
  );
  assert.match(
    String(await refusal({ by: { "agent-ok": "stranger" } })),
    /not added by a writer/,
  );
});

test("direct mode closes a checked issue, and leaves a refused one open with one Needs you row", async (t) => {
  const store = workspace(t);
  await readLabeledIssues(store, fake());
  const edited = fake({ edited: AFTER });
  assert.equal(await closeLanded(store, edited, issueTask(store), "abc"), true);
  assert.deepEqual(edited.writes, [], "nothing written to the issue");
  const decision = String(issueTask(store)?.decision);
  assert.match(decision, /issue #12 stays open: its text changed/);
  await closeLanded(store, edited, issueTask(store), "abc");
  assert.equal(issueTask(store)?.decision, decision, "one row, set once");
  // A clean issue closes with its commit named.
  const other = workspace(t),
    clean = fake();
  await readLabeledIssues(other, clean);
  assert.equal(await closeLanded(other, clean, issueTask(other), "abc"), true);
  assert.deepEqual(
    clean.writes.map((write) => write[0]),
    ["comment", "update"],
  );
});
