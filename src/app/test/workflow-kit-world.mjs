// The world a workflow kit scenario runs in: a bare local git repository as
// origin, and a fake GitHub API over it. Branches, leases and pull requests
// are real refs and commits, so a rejected push is git's own answer. Nothing
// reaches a network or a real GitHub.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const REPOSITORY = "o/r";

// Identity and settings for every git command the world and Avoozl's own
// code run, so a developer's global git configuration changes nothing.
export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Kit",
  GIT_AUTHOR_EMAIL: "kit@example.com",
  GIT_COMMITTER_NAME: "Kit",
  GIT_COMMITTER_EMAIL: "kit@example.com",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
  GIT_TERMINAL_PROMPT: "0",
};

export function gitSync(cwd, args, { env = GIT_ENV } = {}) {
  return execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const refused = (message, status) =>
  Object.assign(new Error(message), { status });

export class World {
  // `files` is the tree of the default branch, by path. Every other name in
  // `branches` starts at the default branch's head.
  constructor({
    files,
    branches = [],
    defaultBranch = "main",
    deleteBranchOnMerge = false,
  }) {
    this.defaultBranch = defaultBranch;
    this.deleteBranchOnMerge = deleteBranchOnMerge;
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-world-"));
    this.origin = path.join(this.dir, "origin.git");
    this.creators = new Map();
    this.signed = new Map();
    this.pulls = [];
    gitSync(this.dir, [
      "init",
      "--bare",
      "-q",
      "-b",
      defaultBranch,
      this.origin,
    ]);
    const seed = path.join(this.dir, "seed");
    gitSync(this.dir, ["clone", "-q", this.origin, seed]);
    gitSync(seed, ["checkout", "-q", "-b", defaultBranch]);
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(seed, file)), { recursive: true });
      fs.writeFileSync(path.join(seed, file), text);
    }
    gitSync(seed, ["add", "-A"]);
    gitSync(seed, ["commit", "-q", "--allow-empty", "-m", "Start"]);
    gitSync(seed, ["push", "-q", "origin", defaultBranch]);
    for (const name of branches)
      if (name !== defaultBranch)
        gitSync(seed, [
          "push",
          "-q",
          "origin",
          `${defaultBranch}:refs/heads/${name}`,
        ]);
  }

  git(args) {
    return gitSync(this.origin, args);
  }

  close() {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  // A checkout of origin for one runner.
  clone(name) {
    const dir = path.join(this.dir, "runners", name);
    gitSync(this.dir, ["clone", "-q", this.origin, dir]);
    return dir;
  }

  has(ref) {
    try {
      this.git(["rev-parse", "--verify", "--quiet", `refs/heads/${ref}`]);
      return true;
    } catch {
      return false;
    }
  }

  head(branch) {
    return this.git(["rev-parse", "--verify", `refs/heads/${branch}`]);
  }

  // Every branch under `prefix` as {ref, object: {sha}}, as GitHub's
  // matching-refs read returns it.
  refs(prefix = "") {
    const out = this.git([
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      `refs/heads/${prefix}`,
    ]);
    return out
      ? out.split("\n").map((line) => {
          const [ref, sha] = line.split(" ");
          return { ref, object: { sha } };
        })
      : [];
  }

  branches() {
    return this.refs().map((item) => item.ref.replace(/^refs\/heads\//, ""));
  }

  // The commit graph, as {commit: [parents]}.
  graph() {
    const out = this.git(["log", "--all", "--format=%H %P"]);
    return Object.fromEntries(
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [commit, ...parents] = line.split(" ").filter(Boolean);
          return [commit, parents];
        }),
    );
  }

  // The file tree under `.kiro/specs` of a branch, by path.
  specFiles(branch) {
    const names = this.git([
      "ls-tree",
      "-r",
      "--name-only",
      `refs/heads/${branch}`,
      ".kiro/specs",
    ]);
    return Object.fromEntries(
      names
        .split("\n")
        .filter(Boolean)
        .map((file) => [
          file,
          this.git(["show", `refs/heads/${branch}:${file}`]),
        ]),
    );
  }

  // The head names of merged pull requests, claim branches GitHub deleted
  // included.
  mergedHeads() {
    return this.pulls.filter((pull) => pull.merged).map((pull) => pull.head);
  }

  // The GitHub API as one actor sees it. `actor` names who made each ref and
  // who merged each pull request.
  github(actor, login = actor) {
    const world = this;
    return {
      async branch(_repository, name) {
        if (!world.has(name)) throw refused("Not Found", 404);
        return { commit: { sha: world.head(name) } };
      },
      async createBranch(_repository, name, sha) {
        if (world.has(name)) throw refused("Reference already exists", 422);
        try {
          world.git(["update-ref", `refs/heads/${name}`, sha, ""]);
        } catch {
          throw refused("Reference update failed", 422);
        }
        world.creators.set(name, actor);
      },
      async deleteBranch(_repository, name) {
        if (!world.has(name)) throw refused("Reference does not exist", 422);
        world.git(["update-ref", "-d", `refs/heads/${name}`]);
      },
      branchesUnder: async (_repository, prefix) => world.refs(prefix),
      // `ahead_by` counts the commits `head` has that `base` lacks.
      async compareCommits(_repository, base, head) {
        return {
          ahead_by: Number(
            world.git([
              "rev-list",
              "--count",
              `refs/heads/${base}..refs/heads/${head}`,
            ]),
          ),
        };
      },
      async mergeBranch() {
        throw refused("The reference world merges no branch", 501);
      },
      // The commit's time and, for a commit GitHub made, its verified
      // signature.
      async commit(_repository, sha) {
        const date = world.git(["show", "-s", "--format=%cI", sha]),
          signer = world.signed.get(sha) ?? null;
        return {
          sha,
          committer: { login: signer ?? login },
          commit: {
            committer: { date },
            verification: { verified: Boolean(signer) },
          },
        };
      },
      async createPullRequest(_repository, { head, base, draft = false }) {
        const number = world.pulls.length + 1;
        world.pulls.push({
          number,
          head,
          base,
          draft,
          merged: false,
          openedBy: login,
        });
        return { number };
      },
      async pullRequest(_repository, number) {
        return world.pull(number);
      },
      // GitHub merges a pull request only at the head the caller names. A
      // merge makes a commit GitHub signs, and the repository can delete the
      // head branch afterward, but never its lease refs.
      async mergePullRequest(_repository, number, { sha }) {
        const pull = world.pulls[number - 1],
          head = world.head(pull.head);
        if (pull.merged) throw refused("Already merged", 405);
        if (sha && sha !== head) throw refused("Head branch was modified", 409);
        const base = world.head(pull.base);
        let merge;
        try {
          world.git(["merge-base", "--is-ancestor", base, head]);
          merge = world.git([
            "commit-tree",
            `${head}^{tree}`,
            "-p",
            base,
            "-p",
            head,
            "-m",
            `Merge pull request #${number}`,
          ]);
        } catch {
          throw refused("Merge conflict", 405);
        }
        world.git(["update-ref", `refs/heads/${pull.base}`, merge, base]);
        world.signed.set(merge, "web-flow");
        Object.assign(pull, {
          merged: true,
          mergedBy: login,
          headSha: head,
          mergeCommit: merge,
        });
        if (world.deleteBranchOnMerge)
          world.git(["update-ref", "-d", `refs/heads/${pull.head}`]);
        return { merged: true, sha: merge };
      },
    };
  }

  pull(number) {
    const pull = this.pulls[number - 1];
    return {
      number,
      state: pull.merged ? "closed" : "open",
      merged: pull.merged,
      merged_by: pull.merged ? { login: pull.mergedBy } : null,
      merge_commit_sha: pull.mergeCommit ?? null,
      head: { ref: pull.head, sha: pull.headSha ?? this.head(pull.head) },
      base: { ref: pull.base },
    };
  }

  openPull(head) {
    return this.pulls.find((pull) => pull.head === head && !pull.merged);
  }
}
