// Stranger input and the routing it gets (vm-harness vm-3.1, vm-3.2, D7):
// who is a stranger, which repositories count as public, and where each
// session and check of such work runs.
import assert from "node:assert/strict";
import test from "node:test";
import {
  inheritStranger,
  repositoryPublic,
  sessionIsolation,
  strangerFromItem,
  strangerRule,
  withStrangerChecks,
} from "../stranger-input.mjs";
import {
  clearStrangerWait,
  preflightNeedsYou,
  recordStrangerWait,
  runStrangerOn,
  strangerNeedsYou,
} from "../stranger-holds.mjs";
import {
  STRANGER_ON_HOST,
  isolatedCheck,
} from "../../workspace/check-isolation.mjs";
import { enqueueSessionRequests } from "../../sessions/session-requests.mjs";
import { deliveryWorkspace } from "../../test/delivery-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const permissions = (table) => async (login) => table[login] ?? null;

test("an author or comment author without write access, a bot, or an unread permission is a stranger", async () => {
  const detail = {
    author: "owner",
    timeline: [
      { kind: "IssueComment", by: "maintainer" },
      { kind: "IssueComment", by: "drive-by" },
    ],
  };
  assert.deepEqual(
    await strangerFromItem(
      detail,
      permissions({
        owner: "admin",
        maintainer: "maintain",
        "drive-by": "read",
      }),
      "o/app#5",
    ),
    {
      reason: "comment author drive-by is not a collaborator (read)",
      source: "o/app#5",
    },
  );
  assert.equal(
    await strangerFromItem(
      {
        author: "owner",
        timeline: [{ kind: "IssueComment", by: "maintainer" }],
      },
      permissions({ owner: "admin", maintainer: "write" }),
      "o/app#5",
    ),
    null,
  );
  assert.match(
    (
      await strangerFromItem(
        { author: "dependabot[bot]" },
        permissions({}),
        "s",
      )
    ).reason,
    /author dependabot\[bot\] is not a collaborator \(permission unread\)/,
  );
  // A task made from a stranger-input task carries it; one with none adds nothing.
  assert.deepEqual(
    inheritStranger({ strangerInput: { reason: "r", source: "s" } }),
    {
      strangerInput: { reason: "r", source: "s" },
    },
  );
  assert.deepEqual(inheritStranger({}), {});
});

function workspace(t, isolation = {}) {
  const w = deliveryWorkspace(t, {
    prefix: "avoozl-stranger-",
    repository: { isolation },
  });
  const repository = { ...w.store.get("repositories", "app"), github: "o/app" };
  return { ...w, repository };
}
const stranger = {
  strangerInput: {
    reason: "author x is not a collaborator",
    source: "o/app#5",
  },
};
const seenPrivate = (store, value) =>
  store.put("incoming_items", {
    id: "github:o/app#1",
    source: "github",
    itemId: "o/app#1",
    search: { number: 1, private: value },
  });

test("visibility: public unless the open-items read saw it private; no GitHub remote has no strangers", (t) => {
  const { store, repository } = workspace(t);
  assert.equal(
    repositoryPublic(store, "o/app"),
    true,
    "never read counts as public",
  );
  assert.deepEqual(strangerRule(store, repository, stranger, "worker"), {
    mode: "container",
    reason: "author x is not a collaborator",
  });
  seenPrivate(store, true);
  assert.equal(repositoryPublic(store, "o/app"), false);
  assert.equal(strangerRule(store, repository, stranger, "worker"), null);
  seenPrivate(store, false);
  assert.ok(strangerRule(store, repository, stranger, "worker"));
  const local = {
    ...repository,
    github: undefined,
    root: temporaryDirectory("avoozl-nogit-"),
  };
  assert.equal(strangerRule(store, local, stranger, "worker"), null);
  // An approved spec's task has no stranger input.
  assert.equal(strangerRule(store, repository, { id: "a" }, "worker"), null);
});

test("on a public repository a stranger's session is contained whatever worker says, for every role", (t) => {
  const { store, repository } = workspace(t, {
    worker: "sandbox",
    image: "node:22",
  });
  const ready = { boxProblem: () => null };
  for (const role of [
    "worker",
    "verifier",
    "review:security",
    "triage",
    "responder",
    "falsifier",
  ])
    assert.equal(
      sessionIsolation(store, repository, stranger, role, ready).kind,
      "contained",
      role,
    );
  // With no box, it waits, and never runs in the host sandbox alone.
  assert.deepEqual(
    sessionIsolation(store, repository, stranger, "worker", {
      boxProblem: () => "no container runtime works on this machine for a box",
    }),
    {
      wait: "stranger input waits: no container runtime works on this machine for a box",
      stranger: { mode: "container", reason: "author x is not a collaborator" },
    },
  );
  // No stranger input: isolation.worker decides.
  assert.equal(
    sessionIsolation(store, repository, { id: "a" }, "worker", ready).kind,
    "sandbox",
  );
  const boxed = {
    ...repository,
    isolation: { worker: "container", image: "node:22" },
  };
  assert.equal(
    sessionIsolation(store, boxed, { id: "a" }, "worker", ready).kind,
    "contained",
  );
});

test("strangers hold waits, host runs in the sandbox and says so, and strangerRoles limits the rule", (t) => {
  const { store, repository } = workspace(t);
  const held = { ...repository, isolation: { strangers: "hold" } };
  assert.match(
    sessionIsolation(store, held, stranger, "worker").wait,
    /isolation\.strangers is hold/,
  );
  const host = { ...repository, isolation: { strangers: "host" } };
  assert.deepEqual(sessionIsolation(store, host, stranger, "worker"), {
    kind: "sandbox",
    note: STRANGER_ON_HOST,
    stranger: { mode: "host", reason: "author x is not a collaborator" },
  });
  const some = {
    ...repository,
    isolation: { strangers: "hold", strangerRoles: ["triage", "checks"] },
  };
  assert.ok(sessionIsolation(store, some, stranger, "triage").wait);
  assert.equal(
    sessionIsolation(store, some, stranger, "worker").kind,
    "sandbox",
  );
  assert.ok(strangerRule(store, some, stranger, "checks"));
  const noChecks = { ...repository, isolation: { strangerRoles: ["worker"] } };
  assert.equal(strangerRule(store, noChecks, stranger, "checks"), null);
});

test("a stranger's checks run in a container with the network off and no writable, or wait, or say they ran on the host", {
  skip:
    process.platform === "win32" ? "Windows runs no contained session" : false,
}, (t) => {
  const { store, repository } = workspace(t, {
    run: "sandbox",
    network: "on",
    image: "node:22",
    writable: ["/opt/shared-cache"],
  });
  // A temp folder inside the Kiro Crew home (a chat that runs this test) is
  // a secret path; point the rule at a home of its own.
  const kept = process.env.KIROCREW_HOME;
  process.env.KIROCREW_HOME =
    temporaryDirectory("avoozl-stranger-kc-") + "/none";
  t.after(() => {
    if (kept === undefined) delete process.env.KIROCREW_HOME;
    else process.env.KIROCREW_HOME = kept;
  });
  const marked = withStrangerChecks(store, repository, [stranger, { id: "a" }]);
  assert.equal(marked.strangerChecks.mode, "container");
  assert.equal(
    withStrangerChecks(store, repository, [{ id: "a" }]),
    repository,
  );
  const dir = temporaryDirectory("avoozl-stranger-check-");
  const check = isolatedCheck(
    marked,
    dir,
    ["npm", "test"],
    {},
    {
      stranger: marked.strangerChecks,
      pick: () => ({ runtime: "podman" }),
    },
  );
  try {
    assert.equal(check.isolation, "container");
    const argv = check.argv.join(" ");
    assert.match(
      argv,
      /--network none/,
      "network off whatever the setting says",
    );
    assert.doesNotMatch(argv, /shared-cache/, "no isolation.writable");
    assert.match(argv, /--cap-drop ALL/);
    assert.match(
      argv,
      /avoozl-check-own-[^ ]*\/cache:[^ ]*:rw/,
      "an empty cache of its own",
    );
  } finally {
    check.cleanup();
  }
  assert.match(
    isolatedCheck(
      marked,
      dir,
      ["true"],
      {},
      { stranger: { mode: "hold", reason: "r" } },
    ).refused,
    /waits in Needs you/,
  );
  const host = isolatedCheck(
    { id: "app", isolation: { run: "unconfined" } },
    dir,
    ["true"],
    {},
    {
      stranger: { mode: "host", reason: "r" },
      kind: null,
    },
  );
  // Unconfined needs this machine's opt-in, which a test machine lacks.
  assert.ok(host.refused || host.note === STRANGER_ON_HOST);
  const sandboxed = isolatedCheck(
    { id: "app" },
    dir,
    ["true"],
    {},
    {
      stranger: { mode: "host", reason: "r" },
      kind: null,
    },
  );
  assert.equal(sandboxed.note, STRANGER_ON_HOST);
  sandboxed.cleanup?.();
});

test("waits make one Needs you item per repository, and Run on moves a Kiro Crew start to a boxed harness", (t) => {
  const { store } = workspace(t);
  const [queued] = enqueueSessionRequests(store, {
    starts: [
      {
        executor: "kirocrew",
        role: "worker",
        task: "a",
        brief: "Fix it.",
        permissionClass: "write",
      },
    ],
  }).starts;
  recordStrangerWait(store, {
    repository: "app",
    kind: "kirocrew",
    reason: "worker has stranger input",
    requestId: queued.id,
  });
  recordStrangerWait(store, {
    repository: "app",
    kind: "box",
    reason: "stranger input waits: isolation.image is not set",
    requestId: "other",
  });
  const items = strangerNeedsYou(store, ["claude-code"]);
  assert.deepEqual(
    items.map((item) => [item.id, item.choices ?? null]),
    [
      ["stranger:app:kirocrew", ["claude-code"]],
      ["stranger:app:box", null],
    ],
  );
  assert.match(items[0].detail, /a Kiro Crew chat/);
  assert.throws(
    () =>
      runStrangerOn(
        store,
        { repository: "app", harness: "codex" },
        { boxed: ["claude-code"] },
      ),
    /not an approved harness with a box/,
  );
  const moved = runStrangerOn(
    store,
    { repository: "app", harness: "claude-code" },
    { boxed: ["claude-code"] },
  );
  assert.equal(moved.moved, 1);
  const rows = store.list("session_requests");
  assert.equal(rows.find((row) => row.id === queued.id).state, "canceled");
  const process = rows.find((row) => row.executor === "process");
  assert.equal(process.request.harness, "claude-code");
  assert.equal(process.request.task, "a");
  clearStrangerWait(store, "other");
  assert.deepEqual(strangerNeedsYou(store), []);
  // A failed preflight names its step.
  assert.match(
    preflightNeedsYou([
      {
        repository: "app",
        failed: { name: "no route", output: "tcp-open" },
        at: "t",
      },
    ])[0].title,
    /preflight failed at "no route"/,
  );
});
