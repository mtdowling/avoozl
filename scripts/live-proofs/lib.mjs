// Shared setup for the live radar-coder proofs: a temporary Avoozl workspace
// over a git clone of a scratch repository, with the real GitHub client.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Operations } from "../../src/app/operations.mjs";
import { GitHubClient } from "../../src/app/github.mjs";
import { Store } from "../../src/app/store.mjs";
import { machineIdentity } from "../../src/app/github-sync.mjs";

export const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

// Clone `repo`, write `files` (path -> text) on a branch, open a pull request
// and merge it with --merge. Returns the merge commit. Never pushes main.
export function landFiles(repo, dir, files, name) {
  const branch = `seed/${name}`;
  run("git", ["checkout", "-q", "-b", branch], dir);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  run("git", ["add", "-A"], dir);
  run("git", ["commit", "-q", "-m", `Seed ${name}`], dir);
  run("git", ["push", "-q", "origin", branch], dir);
  const url = run(
    "gh",
    [
      "pr",
      "create",
      "-R",
      repo,
      "--head",
      branch,
      "--base",
      "main",
      "--title",
      `Seed ${name}`,
      "--body",
      "Seed for a live proof.",
    ],
    dir,
  );
  run("gh", ["pr", "merge", url, "--merge"], dir);
  run("git", ["checkout", "-q", "main"], dir);
  run("git", ["pull", "-q", "origin", "main"], dir);
  return run("git", ["rev-parse", "HEAD"], dir);
}

export function emptySnapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    project: {
      name: "live",
      title: "live",
      integration: { revision: "", mainRevision: "", acceptedRevision: "" },
      pollIntervalMs: 10000,
    },
    statuses: [{ id: "planned", label: "Planned", complete: false }],
    epics: [],
    tracks: [{ id: "catalog", label: "Plans" }],
    tasks: [],
    edges: [],
    documents: {},
    changelog: [],
  };
}

// `repoConfig` is merged into the repository's `.avoozl.json` entry. The clone
// of `repo` lives at `<dir>/clone`.
// `github` replaces the whole `github` policy (plans-repo mode).
export function liveWorkspace(
  repo,
  { repoConfig = {}, config = {}, github: policy } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-live-")),
    clone = path.join(dir, "clone");
  run("git", ["clone", "-q", `https://github.com/${repo}.git`, clone], dir);
  const store = new Store(path.join(dir, "workspace.sqlite"));
  store.importSnapshot(emptySnapshot());
  fs.writeFileSync(
    path.join(clone, ".git", "info", "exclude"),
    ".avoozl.json\n.avoozl/\n",
    { flag: "a" },
  );
  fs.writeFileSync(
    path.join(clone, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_livelivelive0001",
      github: policy ?? {
        mode: "single-repo",
        repositories: {
          [repo]: { baseBranch: "main", ...repoConfig },
        },
      },
      ...config,
    }),
  );
  const github = new GitHubClient(),
    ops = new Operations(store, {
      github,
      operator: "mtdowling",
      workspaceRoot: clone,
    });
  const [owner, name] = repo.split("/");
  store.put("projects", {
    id: "code",
    root: clone,
    baseBranch: "main",
    worktreeRoot: path.join(dir, "worktrees"),
    checks: [["true"]],
  });
  return { dir, clone, store, github, ops, owner, name, machineIdentity };
}
