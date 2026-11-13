// Settings > Content rules editing: a person reads and writes one set's
// terms file, only under .avoozl/local/content-rules, owner-only; problems
// name a line, never the term; sets are saved into .avoozl.json; sessions
// are refused. Every term is made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkTermsText, describeSets } from "../content-rules.mjs";
import { Operations } from "../operations.mjs";
import { previewPlugin } from "../plugins.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ||= temporaryDirectory("avoozl-xdg-");
process.env.GIT_CONFIG_GLOBAL = path.join(
  process.env.XDG_CONFIG_HOME,
  "gitconfig-terms",
);
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");

function setup(t, sets = [{ id: "made-up" }]) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets } }),
  );
  const ops = new Operations(store, {
    workspaceRoot: root,
    pluginSettingsFile: path.join(root, "machine", "plugins.json"),
  });
  return { root, store, ops };
}

test("terms text problems name the line and never the term", () => {
  const { rules, errors } = checkTermsText(
    "# a note\n\nzebra-falcon: zebra falcon\nno colon here\nopen-group: quartz(\nempty:\n",
  );
  assert.equal(rules, 4);
  assert.deepEqual(
    errors.map((e) => e.line),
    [4, 5, 6],
  );
  for (const e of errors) {
    assert.doesNotMatch(e.message, /quartz|colon here/);
  }
  assert.match(errors[1].message, /does not compile/);
});

test("allow lines are counted apart and their problems name only the line", () => {
  const { rules, allows, errors } = checkTermsText(
    "codename: zorblat\nallow: zorblat-public\nallow codename: quartz\nallow nosuchrule: quartz\nallow: quartz(\n",
  );
  assert.deepEqual([rules, allows], [1, 4]);
  assert.deepEqual(
    errors.map((e) => e.line),
    [4, 5],
  );
  for (const e of errors) assert.doesNotMatch(e.message, /quartz|nosuchrule/);
});

test("a person writes the terms file owner-only; Settings never sees a term", async (t) => {
  const { root, store, ops } = setup(t);
  const empty = await ops.execute("content.terms.get", { id: "made-up" });
  assert.deepEqual(
    [empty.exists, empty.editable, empty.text],
    [false, true, ""],
  );
  assert.equal(empty.file, ".avoozl/local/content-rules/made-up.txt");
  const saved = await ops.execute("content.terms.update", {
    id: "made-up",
    text: "zebra-falcon: zebra\\s+falcon\ncobalt-heron: cobalt heron",
  });
  assert.deepEqual([saved.saved, saved.rules], [true, 2]);
  const file = path.join(
    root,
    ".avoozl",
    "local",
    "content-rules",
    "made-up.txt",
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.match(fs.readFileSync(file, "utf8"), /cobalt heron\n$/);
  const back = await ops.execute("content.terms.get", { id: "made-up" });
  assert.match(back.text, /zebra/);
  // The list, the event log and errors carry counts and lines only.
  const listed = JSON.stringify(await ops.execute("content.rules", {}));
  assert.doesNotMatch(listed, /zebra|cobalt/);
  assert.match(listed, /"ruleCount":2/);
  const events = JSON.stringify(store.db.prepare("SELECT * FROM events").all());
  assert.doesNotMatch(events, /zebra|cobalt/);
  await assert.rejects(
    ops.execute("content.terms.update", {
      id: "made-up",
      text: "ok: fine\nbad: amber(",
    }),
    (error) => {
      assert.equal(error.status, 422);
      assert.match(error.message, /Line 2/);
      assert.doesNotMatch(error.message, /amber/);
      return true;
    },
  );
  assert.match(fs.readFileSync(file, "utf8"), /cobalt/, "nothing was written");
});

test("sessions can neither read nor write terms or sets", async (t) => {
  const { ops } = setup(t);
  for (const [name, input] of [
    ["content.terms.get", { id: "made-up" }],
    ["content.terms.update", { id: "made-up", text: "a: b" }],
    ["content.sets.update", { sets: [], expectedHash: null }],
  ]) {
    await assert.rejects(
      ops.execute(name, input, undefined, { caller: "session-1" }),
      /Only a person/,
    );
    await assert.rejects(
      ops.execute(name, input, undefined, { mcp: true }),
      /Only a person/,
    );
  }
});

test("terms are refused for an unknown set, a plugin set, and a tracked file", async (t) => {
  const { root, ops } = setup(t, [
    { id: "made-up" },
    { id: "from-plugin", plugin: "fake-rules" },
  ]);
  // A plugin set names an undeclared plugin: the policy is invalid.
  await assert.rejects(
    ops.execute("content.terms.get", { id: "made-up" }),
    /invalid/,
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets: [{ id: "made-up" }] } }),
  );
  await assert.rejects(
    ops.execute("content.terms.get", { id: "other" }),
    /not in \.avoozl\.json/,
  );
  await assert.rejects(
    ops.execute("content.terms.get", { id: "../x" }),
    /Name a rule set/,
  );
  // In a Git work tree that does not ignore the folder, nothing is written.
  execFileSync("git", ["init", "-q"], { cwd: root });
  await assert.rejects(
    ops.execute("content.terms.update", { id: "made-up", text: "a: b" }),
    /Nothing was saved: Git could publish/,
  );
  assert.ok(
    !fs.existsSync(
      path.join(root, ".avoozl", "local", "content-rules", "made-up.txt"),
    ),
  );
  fs.writeFileSync(path.join(root, ".gitignore"), ".avoozl/local/\n");
  const saved = await ops.execute("content.terms.update", {
    id: "made-up",
    text: "a: b",
  });
  assert.equal(saved.rules, 1);
});

test("sets are saved into .avoozl.json with the hash check; an unknown plugin is refused", async (t) => {
  const { root, store, ops } = setup(t);
  const listed = await ops.execute("content.rules", {});
  assert.ok(listed.configHash);
  assert.ok(Array.isArray(listed.choices.repositories));
  const next = await ops.execute("content.sets.update", {
    expectedHash: listed.configHash,
    sets: [
      { id: "made-up" },
      { id: "trial-hosts", action: "report", boundaries: ["github", "brief"] },
    ],
  });
  assert.deepEqual(
    next.sets.map((s) => [s.id, s.action]),
    [
      ["made-up", "block"],
      ["trial-hosts", "report"],
    ],
  );
  const file = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  assert.equal(file.contentRules.sets.length, 2);
  await assert.rejects(
    ops.execute("content.sets.update", {
      expectedHash: listed.configHash,
      sets: [],
    }),
    /changed; reload/,
  );
  await assert.rejects(
    ops.execute("content.sets.update", {
      expectedHash: next.configHash,
      sets: [{ id: "x", plugin: "missing-plugin" }],
    }),
    /names no plugins entry/,
  );
  await assert.rejects(
    ops.execute("content.sets.update", {
      expectedHash: next.configHash,
      sets: [{ id: "x", terms: ["leak"] }],
    }),
    /could hold a rule/,
  );
  const cleared = await ops.execute("content.sets.update", {
    expectedHash: next.configHash,
    sets: [],
  });
  assert.equal(cleared.sets.length, 0);
  assert.equal(describeSets(store).sets.length, 0);
});

test("plugin.preview reads a folder's manifest without declaring it", async (t) => {
  const root = temporaryDirectory("avoozl-pv-"),
    folder = path.join(root, "plugin");
  fs.mkdirSync(folder);
  fs.writeFileSync(
    path.join(folder, "avoozl-plugin.json"),
    JSON.stringify({
      id: "made-up-tracker",
      version: "1.2.0",
      contract: 1,
      kinds: ["tracker"],
      entry: "index.mjs",
    }),
  );
  const options = {
    workspaceRoot: root,
    settingsFile: path.join(root, "machine", "plugins.json"),
  };
  const found = await previewPlugin(options, { path: folder });
  assert.deepEqual(
    [found.id, found.version, found.contract, found.supported],
    ["made-up-tracker", "1.2.0", 1, true],
  );
  assert.ok(!fs.existsSync(options.settingsFile), "nothing was declared");
  const missing = await previewPlugin(options, {
    path: path.join(root, "nope"),
  });
  assert.match(missing.error, /No avoozl-plugin\.json/);
  const pkg = await previewPlugin(options, { package: "made-up-pkg" });
  assert.match(pkg.error, /not installed/);
  await assert.rejects(previewPlugin(options, {}), /exactly one/);
  // A git source resolves to a commit and is not fetched.
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "a");
  git("add", ".");
  git(
    "-c",
    "user.email=a@example.com",
    "-c",
    "user.name=a",
    "commit",
    "-qm",
    "a",
  );
  const head = git("rev-parse", "HEAD");
  const pinned = await previewPlugin(options, { git: repo, ref: "main" });
  assert.equal(pinned.commit, head);
});
