// Repository files by git: a nupp-sized plans branch (41 specs) costs no REST
// or GraphQL call with git, a few with the GraphQL fallback, and none when
// the head has not moved. The old path's count is measured in the same test.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { BLOB_CHUNK, GitHubClient } from "../github.mjs";
import { RepoFiles } from "../repo-files.mjs";
import { readPrivateSpecs } from "../spec-homes.mjs";
import { CRITIQUE } from "../spec-plans.mjs";
import { Store } from "../store.mjs";
import { specFiles } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SPECS = 41,
  BRANCH = "avoozl-plans",
  mirror = {
    source: "acme/app",
    mirror: "acme/app-private",
    plansBranch: BRANCH,
  };

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// A remote with one orphan plans branch: SPECS folders of the fixture files
// plus a bugfix and a critique each (6 files, 246 in all), and one stray file outside any spec folder.
function remote(dir) {
  const work = path.join(dir, "work"),
    texts = new Map();
  fs.mkdirSync(work, { recursive: true });
  git(work, "init", "-q", "-b", BRANCH);
  git(work, "config", "user.email", "t@example.test");
  git(work, "config", "user.name", "t");
  const put = (file, text) => {
    texts.set(file, text);
    fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    fs.writeFileSync(path.join(work, file), text);
  };
  for (let i = 0; i < SPECS; i += 1) {
    for (const [file, text] of Object.entries(specFiles()))
      put(`.kiro/specs/spec-${i}/${file}`, text);
    put(`.kiro/specs/spec-${i}/bugfix.md`, `Bugfix ${i}\n`);
    put(`.kiro/specs/spec-${i}/${CRITIQUE}`, `Critique ${i}\n`);
  }
  put("README.md", "not a spec\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "Plans");
  const bare = path.join(dir, "remote", "acme", "app-private.git");
  fs.mkdirSync(path.dirname(bare), { recursive: true });
  git(dir, "clone", "-q", "--bare", work, bare);
  return {
    work,
    bare,
    texts,
    base: pathToFileURL(path.join(dir, "remote")).href,
  };
}

// An API that answers from the remote and counts every request it gets.
function api(remoteRepo) {
  const seen = { count: 0, graphql: 0, tree: 0, contents: 0, branch: 0 },
    sha = () => git(remoteRepo.work, "rev-parse", BRANCH),
    json = (value) => new Response(JSON.stringify(value), { status: 200 });
  const fetch = async (url, options) => {
    const { pathname } = new URL(url);
    seen.count += 1;
    if (pathname === "/graphql") {
      seen.graphql += 1;
      const { variables } = JSON.parse(options.body),
        repository = {};
      for (const [key, expression] of Object.entries(variables))
        if (/^e\d+$/.test(key)) {
          const text = remoteRepo.texts.get(
            expression.slice(expression.indexOf(":") + 1),
          );
          repository["f" + key.slice(1)] =
            text === undefined ? null : { isBinary: false, text };
        }
      return json({ data: { repository } });
    }
    if (pathname.includes("/branches/")) {
      seen.branch += 1;
      return json({ name: BRANCH, commit: { sha: sha() } });
    }
    if (pathname.includes("/git/trees/")) {
      seen.tree += 1;
      return json({
        truncated: false,
        tree: [...remoteRepo.texts.keys()].map((file) => ({
          path: file,
          type: "blob",
          sha: "0".repeat(40),
        })),
      });
    }
    if (pathname.includes("/contents/")) {
      seen.contents += 1;
      const file = decodeURIComponent(pathname.split("/contents/")[1]),
        text = remoteRepo.texts.get(file);
      if (text !== undefined)
        return json({
          type: "file",
          encoding: "base64",
          content: Buffer.from(text).toString("base64"),
        });
      const prefix = file + "/",
        names = new Map();
      for (const key of remoteRepo.texts.keys())
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          names.set(rest.split("/")[0], rest.includes("/") ? "dir" : "file");
        }
      return names.size
        ? json([...names].map(([name, type]) => ({ name, type })))
        : new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
          });
    }
    return new Response("{}", { status: 404 });
  };
  return Object.assign(seen, { fetch });
}

function setup(t) {
  const dir = temporaryDirectory("avoozl-repofiles-"),
    repo = remote(dir),
    server = api(repo),
    store = new Store(path.join(dir, "workspace.sqlite"));
  t.after(() => store.close());
  const github = new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    gitUrl: repo.base,
    fetch: server.fetch,
  }).bind(store, { cacheSeconds: () => 0 });
  const gitCalls = () => {
    let n = 0;
    for (const row of Object.values(github.rate.usage))
      n += row.git?.calls ?? 0;
    return n;
  };
  return {
    dir,
    repo,
    server,
    github,
    gitCalls,
    root: path.join(dir, "ws", ".avoozl", "local", "git-cache"),
  };
}

// What every plan read did before: list the folder, then one contents read per
// spec file, each one a REST call.
async function oldPathCalls(github, server) {
  const before = server.count,
    listing = await github.contents(mirror.mirror, ".kiro/specs", BRANCH);
  for (const entry of listing)
    for (const file of [...Object.keys(specFiles()), "bugfix.md", CRITIQUE])
      await github
        .contents(mirror.mirror, `.kiro/specs/${entry.name}/${file}`, BRANCH)
        .catch(() => null);
  return server.count - before;
}

const names = (specs) => specs.map((spec) => spec.name);

test("a cold load by git makes no API call, and a warm one with the same head makes none either", async (t) => {
  const { github, server, root, gitCalls } = setup(t),
    files = new RepoFiles({ github, root }),
    old = await oldPathCalls(github, server);
  assert.ok(old > SPECS, `the old path made ${old} calls`);
  server.count = 0;

  const head = await files.head(mirror.mirror, BRANCH),
    specs = await readPrivateSpecs(files, mirror, head);
  assert.equal(specs.length, SPECS);
  assert.equal(server.count, 0, "git reads cost no REST or GraphQL call");
  assert.ok(server.count < old);
  assert.ok(gitCalls() >= 2, "the head check and the fetch are counted as git");
  assert.equal(specs[0].files["tasks.md"], specFiles()["tasks.md"]);
  assert.equal(specs[0].critique, "Critique 0\n");

  const counted = gitCalls();
  assert.equal(await files.head(mirror.mirror, BRANCH), head);
  await readPrivateSpecs(files, mirror, head);
  assert.equal(server.count, 0);
  assert.equal(
    gitCalls(),
    counted + 1,
    "a warm load is one ls-remote, no fetch",
  );
});

test("a moved head costs one fetch and no API call", async (t) => {
  const { github, repo, server, root, gitCalls } = setup(t),
    files = new RepoFiles({ github, root }),
    first = await files.head(mirror.mirror, BRANCH);
  await readPrivateSpecs(files, mirror, first);
  fs.writeFileSync(
    path.join(repo.work, ".kiro/specs/spec-0/design.md"),
    "Changed\n",
  );
  git(repo.work, "commit", "-q", "-am", "Change");
  git(repo.bare, "fetch", "-q", repo.work, `+${BRANCH}:${BRANCH}`);
  const before = gitCalls(),
    second = await files.head(mirror.mirror, BRANCH);
  assert.notEqual(second, first);
  const specs = await readPrivateSpecs(files, mirror, second);
  assert.equal(specs[0].files["design.md"], "Changed\n");
  assert.equal(gitCalls() - before, 2, "one ls-remote and one fetch");
  assert.equal(server.count, 0);
});

test("the cache is owner-only and lives under the given folder", async (t) => {
  const { github, root } = setup(t),
    files = new RepoFiles({ github, root }),
    head = await files.head(mirror.mirror, BRANCH);
  await readPrivateSpecs(files, mirror, head);
  const cache = path.join(root, "acme__app-private.git");
  assert.ok(fs.existsSync(path.join(cache, "HEAD")));
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(root).mode & 0o077, 0);
    assert.equal(fs.statSync(cache).mode & 0o077, 0);
  }
});

test("without git the same read is one head call, one tree and a few batched queries", async (t) => {
  const { github, server, root } = setup(t),
    byGit = await readPrivateSpecs(
      new RepoFiles({ github, root }),
      mirror,
      await new RepoFiles({ github, root }).head(mirror.mirror, BRANCH),
    ),
    old = await oldPathCalls(github, server);
  for (const files of [
    new RepoFiles({ github, root: null }),
    new RepoFiles({ github, root, git: "no-such-git-binary" }),
  ]) {
    server.count = server.graphql = server.tree = server.branch = 0;
    const specs = await readPrivateSpecs(files, mirror);
    assert.deepEqual(names(specs), names(byGit));
    assert.deepEqual(
      specs.map((spec) => spec.hash),
      byGit.map((spec) => spec.hash),
    );
    // Only the files a spec reads are fetched, not the stray README.
    const wanted = SPECS * (Object.keys(specFiles()).length + 2);
    assert.equal(server.branch, 1);
    assert.equal(server.tree, 1);
    assert.equal(server.graphql, Math.ceil(wanted / BLOB_CHUNK));
    assert.ok(
      server.count <= 2 + Math.ceil(wanted / BLOB_CHUNK),
      `${server.count} calls`,
    );
    assert.ok(server.count < old, `${server.count} against ${old}`);
  }
});

test("a missing branch reads as no specs", async (t) => {
  const { github, root } = setup(t),
    files = new RepoFiles({ github, root });
  assert.equal(await files.head(mirror.mirror, "no-such-branch"), null);
  assert.deepEqual(
    await readPrivateSpecs(files, { ...mirror, plansBranch: "no-such-branch" }),
    [],
  );
});
