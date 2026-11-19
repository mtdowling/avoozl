// A workspace with the triage agent on, for the triage tests: a real git
// checkout with a bare "origin", a fake GitHub behind the real client, and
// a fake session for each run (its result goes in as the session would
// send it). Every value is fake; nothing reaches the network.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../store.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { runRows, submitTriage, triageStep } from "../triage.mjs";
import { snapshot } from "./fixtures.mjs";
import { FakeGitHubApi } from "./fake-github-api.mjs";
import { temporaryDirectory } from "./temporary.mjs";

export const REPO = "o/app";
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// The repository's one check: every file in tests/ is loaded, and one that
// throws fails it.
export const CHECK = [
  process.execPath,
  "-e",
  "const fs=require('fs');for(const f of fs.existsSync('tests')?fs.readdirSync('tests'):[])require(require('path').resolve('tests',f))",
];

export function triageWorkspace(
  t,
  {
    triage = { agent: "on", existing: "take" },
    remaining = 4000,
    landing = "direct",
  } = {},
) {
  const root = temporaryDirectory("avoozl-triage-"),
    origin = path.join(root, "origin.git"),
    checkout = path.join(root, "app");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.mkdirSync(path.join(checkout, "docs"));
  fs.writeFileSync(
    path.join(checkout, "docs", "guide.md"),
    "# Guide\n\nRun `app start`.\n",
  );
  fs.writeFileSync(
    path.join(checkout, "greet.js"),
    "module.exports = () => 'hi ';\n",
  );
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  git(checkout, "fetch", "-q", "origin");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    github: REPO,
    baseBranch: "main",
    landing,
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  const policy = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: { [REPO]: { baseBranch: "main", triage } },
  });
  const fake = new FakeGitHubApi({ repository: REPO, remaining }),
    github = fake.client().bind(store, { sleep: async () => {} });
  let slots = 0;
  // Bind a session to each queued run, as the drain does.
  const bind = () => {
    for (const run of runRows(store).filter(
      (entry) => entry.state === "queued",
    )) {
      slots += 1;
      store.put("session_bindings", {
        id: `slot-${slots}`,
        slot: `slot-${slots}`,
        taskId: run.id,
        role: "triage",
        attempt: 1,
        status: "working",
      });
    }
  };
  const runOf = (number) =>
    runRows(store)
      .filter((run) => run.number === number)
      .sort((a, b) => b.attempt - a.attempt)[0];
  // The run's session sends its result.
  const answer = (number, result) => {
    bind();
    const run = runOf(number),
      binding = store
        .list("session_bindings")
        .find((entry) => entry.taskId === run.id);
    return submitTriage(store, result, {
      sessionKey: `dashboard:${binding.slot}`,
    });
  };
  const tick = (extra = {}) =>
    triageStep(store, github, {
      policy,
      workspaceRoot: root,
      config: {},
      ...extra,
    });
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    policy,
    fake,
    github,
    bind,
    runOf,
    answer,
    tick,
    item: (number) => store.get("github_items", `${REPO}#${number}`),
  };
}
