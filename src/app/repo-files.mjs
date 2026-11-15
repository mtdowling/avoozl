// Repository files read through git, not the contents API. A bare cache per
// repository lives under the workspace's git-ignored state folder
// (`.avoozl/local/git-cache`), owner-only. A branch head is found with
// `git ls-remote`, the branch is fetched only when that head is not cached,
// and files are read with `git ls-tree` and `git cat-file --batch`. Git
// transport is not REST or GraphQL, so none of it spends the hourly quota;
// each git call that reaches the remote is counted as source `git`.
//
// When git cannot be used (no git binary, no remote URL, fetch refused) the
// same read goes over the API: one tree listing, then one GraphQL query per
// chunk of files, each file an aliased blob.
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseRepository } from "./github.mjs";

const SHA = /^[0-9a-f]{40}$/;
// A branch name safe to put in a ref path and an argument list.
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const MAX_BUFFER = 256 * 1024 * 1024;

const safeBranch = (name) =>
  BRANCH.test(name) &&
  !name.includes("..") &&
  !name.includes("//") &&
  !name.endsWith("/") &&
  !name.endsWith(".lock") &&
  !name.includes("/.");

export class RepoFiles {
  // `root`: the cache folder, or null to read over the API only.
  constructor({ github, root = null, git = "git" } = {}) {
    this.github = github;
    this.root = root;
    this.git = git;
    // One job at a time per cache folder.
    this.queues = new Map();
  }

  #gitReady(repository) {
    return Boolean(
      this.root &&
      typeof this.github?.gitRemote === "function" &&
      this.github.gitRemote(repository),
    );
  }

  #run(args, { cwd, input, env } = {}) {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.git,
        args,
        {
          cwd,
          env,
          encoding: "buffer",
          maxBuffer: MAX_BUFFER,
          timeout: 120_000,
          windowsHide: true,
        },
        (error, stdout, stderr) =>
          error
            ? reject(
                Object.assign(Error(`git ${args[0]} failed`), {
                  cause: error,
                  stderr: stderr?.toString("utf8"),
                }),
              )
            : resolve(stdout),
      );
      if (input !== undefined) child.stdin.end(input);
    });
  }

  async #env(repository) {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      url = this.github.gitRemote(repository);
    // The same token the API calls use, sent only to an https host and kept
    // out of the argument list.
    if (url.startsWith("https://")) {
      const header = await this.github.gitHeader?.();
      if (header) {
        env.GIT_CONFIG_COUNT = "1";
        env.GIT_CONFIG_KEY_0 = `http.${new URL(url).origin}/.extraheader`;
        env.GIT_CONFIG_VALUE_0 = header;
      }
    }
    return { env, url };
  }

  async #cacheDir(repository) {
    const dir = path.join(
      this.root,
      `${repository.owner}__${repository.repo}.git`.toLowerCase(),
    );
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    try {
      await this.#run(["--git-dir", dir, "rev-parse", "--git-dir"]);
    } catch {
      await this.#run(["init", "--bare", "-q", dir]);
    }
    return dir;
  }

  #serial(key, job) {
    const run = (this.queues.get(key) ?? Promise.resolve()).then(job, job);
    this.queues.set(
      key,
      run.catch(() => {}),
    );
    return run;
  }

  // The head commit of `branch`, or null when there is no such branch. A
  // read that fails for another reason throws.
  async head(value, branch) {
    const repository =
      typeof value === "string" ? parseRepository(value) : value;
    if (this.#gitReady(repository) && safeBranch(branch))
      try {
        const { env, url } = await this.#env(repository),
          out = await this.#run(["ls-remote", url, `refs/heads/${branch}`], {
            env,
          });
        this.github.countGit?.();
        const sha = out.toString("utf8").split(/\s/)[0];
        return SHA.test(sha) ? sha : null;
      } catch {
        // Git cannot reach it: ask the API.
      }
    try {
      return (
        (await this.github.branch(repository, branch))?.commit?.sha ?? null
      );
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  // Files of `ref` (a branch name or a 40-character commit): everything
  // under `prefix` that `want(path)` accepts, or exactly `paths`. Returns
  // { sha, files: Map(path -> text), blobs: Map(path -> blob sha) }. A
  // missing branch, folder or file reads as nothing.
  async readAt(
    value,
    ref,
    { prefix, paths, want = () => true, text = want } = {},
  ) {
    const repository =
        typeof value === "string" ? parseRepository(value) : value,
      sha = SHA.test(ref) ? ref : await this.head(repository, ref);
    if (!sha) return { sha: null, files: new Map(), blobs: new Map() };
    if (this.#gitReady(repository) && (SHA.test(ref) || safeBranch(ref)))
      try {
        return await this.#serial(
          `${repository.owner}/${repository.repo}`.toLowerCase(),
          () =>
            this.#viaGit(repository, ref, sha, { prefix, paths, want, text }),
        );
      } catch {
        // Fall through to the API.
      }
    return this.#viaApi(repository, sha, { prefix, paths, want, text });
  }

  async #viaGit(repository, ref, sha, { prefix, paths, want, text }) {
    const dir = await this.#cacheDir(repository),
      git = (args, options) => this.#run(["--git-dir", dir, ...args], options),
      { env, url } = await this.#env(repository);
    let have = true;
    try {
      await git(["cat-file", "-e", `${sha}^{commit}`]);
    } catch {
      have = false;
    }
    if (!have) {
      const refname = SHA.test(ref)
        ? `refs/avoozl/commits/${sha}`
        : `refs/avoozl/heads/${ref}`;
      // A folder read wants every file under it; a few named files are read
      // lazily, so the rest of a large repository is never downloaded.
      await git(
        [
          "fetch",
          "-q",
          "--no-tags",
          "--depth=1",
          ...(paths ? ["--filter=blob:none"] : []),
          url,
          `+${sha}:${refname}`,
        ],
        { env },
      );
      this.github.countGit?.();
    }
    const listing = (
      await git(
        paths
          ? ["ls-tree", "-z", sha, "--", ...paths]
          : ["ls-tree", "-r", "-z", sha, "--", prefix],
        { env },
      )
    )
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    const blobs = new Map();
    for (const line of listing) {
      const tab = line.indexOf("\t"),
        [, type, id] = line.slice(0, tab).split(" "),
        file = line.slice(tab + 1);
      if (type === "blob" && want(file)) blobs.set(file, id);
    }
    const files = new Map();
    const entries = [...blobs].filter(([file]) => text(file));
    if (entries.length) {
      const out = await git(["cat-file", "--batch"], {
        env,
        input: entries.map(([, id]) => id).join("\n") + "\n",
      });
      let at = 0;
      for (const [file] of entries) {
        const end = out.indexOf(10, at),
          [, type, size] = out.toString("utf8", at, end).split(" ");
        if (type !== "blob") {
          at = end + 1;
          continue;
        }
        files.set(file, out.toString("utf8", end + 1, end + 1 + Number(size)));
        at = end + 1 + Number(size) + 1;
      }
    }
    return { sha, files, blobs };
  }

  async #viaApi(repository, sha, { prefix, paths, want, text }) {
    let names = paths;
    const blobs = new Map();
    if (!names) {
      const entries = await this.github.treeEntries(repository, sha);
      names = [];
      for (const entry of entries)
        if (
          entry.type === "blob" &&
          entry.path.startsWith(prefix) &&
          want(entry.path)
        ) {
          names.push(entry.path);
          blobs.set(entry.path, entry.sha);
        }
    }
    const wanted = names.filter((file) => text(file)),
      files = wanted.length
        ? await this.github.blobTexts(repository, sha, wanted)
        : new Map();
    for (const file of [...files.keys()])
      if (files.get(file) === null) {
        files.delete(file);
        blobs.delete(file);
      }
    return { sha, files, blobs };
  }
}

// A RepoFiles as given, or an API-only one around a GitHub client.
export const repoFilesOf = (source) =>
  source instanceof RepoFiles ? source : new RepoFiles({ github: source });
