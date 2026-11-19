import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectCheckout } from "../git/git.mjs";
import {
  detectRepository,
  folderFacts,
  guessKind,
} from "../workspace/repository-kind.mjs";

function checkout(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-detect-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, name);
  fs.mkdirSync(root);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q", "-b", "trunk");
  git(
    "-c",
    "user.email=a@b",
    "-c",
    "user.name=a",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "x",
  );
  return { root: fs.realpathSync.native(root), git };
}

test("detect reads a checkout's root, branch, GitHub remote and ID without changing it", async (t) => {
  const { root, git } = checkout(t, "My_Service");
  git("remote", "add", "origin", "git@github.com:octo/my-service.git");
  fs.mkdirSync(path.join(root, "sub"));
  const found = await detectCheckout(path.join(root, "sub"));
  assert.deepEqual(found, {
    root,
    baseBranch: "trunk",
    currentBranch: "trunk",
    remote: "origin",
    github: "octo/my-service",
    id: "my-service",
  });
});

test("detect without a remote, and refusals for bad folders", async (t) => {
  const { root } = checkout(t, "local");
  const found = await detectCheckout(root);
  assert.equal(found.github, null);
  assert.equal(found.remote, null);
  await assert.rejects(detectCheckout("relative/path"), /absolute path/);
  await assert.rejects(
    detectCheckout(path.join(root, "missing")),
    /does not exist/,
  );
  await assert.rejects(detectCheckout(os.tmpdir()), /not a Git checkout/);
});

test("detect reads a leading ~ as the home folder", async (t) => {
  const { root } = checkout(t, "homed");
  const home = path.dirname(root);
  assert.equal((await detectCheckout("~/homed", home)).root, root);
  assert.equal((await detectCheckout("~", root)).root, root);
  await assert.rejects(detectCheckout("~other/x", home), /starts with ~\//);
});

test("folder facts: the upstream remote, the file that shows code, and specs", async (t) => {
  const { root, git } = checkout(t, "facts");
  git("remote", "add", "origin", "git@github.com:octo/facts.git");
  git("remote", "add", "fork", "git@github.com:octo/facts.git");
  git("remote", "add", "upstream", "https://github.com/acme/facts.git");
  let facts = await folderFacts(root, "octo/facts");
  assert.deepEqual(facts, {
    upstream: { remote: "upstream", github: "acme/facts" },
    code: null,
    specs: 0,
  });
  fs.mkdirSync(path.join(root, ".kiro", "specs", "login"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "build.py"), "");
  git("add", "-A");
  facts = await folderFacts(root, "octo/facts");
  assert.equal(facts.code, null, "a script under docs/ is not the code");
  assert.equal(facts.specs, 1);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "main.rs"), "");
  fs.writeFileSync(path.join(root, "Cargo.toml"), "");
  git("add", "-A");
  assert.equal((await folderFacts(root, "octo/facts")).code, "Cargo.toml");
});

test("the guessed kind", () => {
  const facts = (extra = {}) => ({
    upstream: null,
    code: "package.json",
    specs: 0,
    ...extra,
  });
  const workspace = (others = [], extra = {}) => ({
    own: null,
    mirrorOf: null,
    others,
    ...extra,
  });
  const role = (input) =>
    guessKind({ github: "octo/app", name: "app", facts: facts(), ...input })
      .role;
  // No GitHub remote: local, whatever else it has.
  assert.deepEqual(guessKind({ github: null, remote: null, facts: facts() }), {
    role: "local",
    source: "",
    reasons: ["It has no GitHub remote."],
  });
  // Settings already name it.
  assert.equal(role({ workspace: workspace([], { own: "code" }) }), "code");
  const mirrored = guessKind({
    github: "octo/app",
    facts: facts(),
    workspace: workspace([], { mirrorOf: "acme/app" }),
  });
  assert.deepEqual([mirrored.role, mirrored.source], ["mirror", "acme/app"]);
  // An upstream remote on another repository: a private mirror, unless it is public.
  const upstream = { remote: "upstream", github: "acme/app" };
  const mirror = guessKind({
    github: "octo/app",
    facts: facts({ upstream }),
    visibility: "private",
  });
  assert.deepEqual([mirror.role, mirror.source], ["mirror", "acme/app"]);
  assert.match(mirror.reasons.join(" "), /octo\/app is private/);
  assert.equal(
    role({ facts: facts({ upstream }), visibility: "public" }),
    "both",
  );
  assert.equal(
    role({ facts: facts({ upstream }), upstreamVisibility: "private" }),
    "both",
  );
  // Alone on GitHub: code and planning, or planning when it has specs and no code.
  assert.equal(role({}), "both");
  assert.equal(role({ facts: facts({ code: null, specs: 2 }) }), "planning");
  assert.equal(
    role({ name: "team-plans", facts: facts({ code: null }) }),
    "planning",
  );
  assert.equal(role({ name: "team-plans" }), "both");
  // The roles already in the workspace decide what fits.
  assert.equal(
    role({ workspace: workspace([{ name: "octo/plans", role: "planning" }]) }),
    "code",
  );
  assert.equal(
    role({
      workspace: workspace([{ name: "octo/lib", role: "both" }]),
      facts: facts({ code: null, specs: 1 }),
    }),
    "both",
  );
  assert.equal(
    role({ workspace: workspace([{ name: "octo/lib", role: "code" }]) }),
    "code",
  );
  assert.equal(
    role({
      workspace: workspace([{ name: "octo/lib", role: "code" }]),
      facts: facts({ code: null, specs: 1 }),
    }),
    "planning",
  );
  assert.equal(
    role({ workspace: workspace([{ name: "octo/lib", role: "local" }]) }),
    "local",
  );
});

test("detectRepository adds the kind, from the folder and the workspace's settings", async (t) => {
  const { root, git } = checkout(t, "kind");
  git("remote", "add", "origin", "git@github.com:octo/kind.git");
  const store = { list: () => [], get: () => null };
  const found = await detectRepository({
    store,
    github: null,
    settings: () => ({
      mode: "plans-repo",
      planningRepository: "octo/plans",
      repositories: {},
    }),
    folder: root,
  });
  assert.equal(found.github, "octo/kind");
  assert.equal(found.kind.role, "code");
  assert.match(
    found.kind.reasons[0],
    /octo\/plans is this workspace's planning repository/,
  );
  // A settings file that can't be read leaves the folder to decide.
  const alone = await detectRepository({
    store,
    settings: () => {
      throw Error("no file");
    },
    folder: root,
  });
  assert.equal(alone.kind.role, "both");
});
