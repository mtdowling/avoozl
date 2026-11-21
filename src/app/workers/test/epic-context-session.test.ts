// What a session gets (epic-context ec-2.1): the sources that name the
// task's repository, merged; a conflicting alias, an unsafe read and a
// missing read left out with a reason; Needs you rows.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  contextBrief,
  contextNeedsYou,
  copySkills,
  loadSources,
  recordContext,
  sessionContext,
} from "../epic-context.ts";
import { writeEpicContext } from "../../context/epic-context-config.ts";
import { bindContentRules } from "../../content/content-rules.ts";
import { contextMachine } from "../../context/test/context-fixture.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import type { ContextSource } from "../epic-context.ts";

const places = (home: string, extra = {}) => ({
  home,
  env: {},
  configDirectory: path.join(home, ".config", "avoozl"),
  stateDirectory: path.join(home, ".local", "state", "avoozl"),
  ...extra,
});

const source = (
  name: string,
  extra: Partial<ContextSource> = {},
): ContextSource => ({
  kind: "machine",
  name,
  repos: ["acme/*"],
  reads: [],
  skills: [],
  servers: {},
  contentSets: [],
  ...extra,
});

const server = (command = ["a"]) => ({ about: "About", command, env: [] });

test("sources that name the repository are merged without repeats, others give nothing", () => {
  const home = temporaryDirectory("avoozl-home-"),
    notes = path.join(home, "notes");
  fs.mkdirSync(notes);
  const read = { id: "r1", about: "Notes", path: notes };
  const given = sessionContext(
    [
      source("one", { reads: [read], contentSets: ["acme-terms"] }),
      source("two", {
        reads: [{ ...read, id: "r2" }],
        contentSets: ["acme-terms", "b"],
      }),
      source("other", {
        repos: ["acme/tools"],
        reads: [{ ...read, id: "r3", path: home }],
      }),
      source("nobody", { repos: ["zeta/*"] }),
    ],
    { id: "widgets", github: "Acme/Widgets" },
    places(home),
  );
  assert.deepEqual(given.sources, ["one", "two"]);
  assert.deepEqual(
    given.reads.map((r) => r.id),
    ["r1"],
  );
  assert.deepEqual(given.contentSets, ["acme-terms", "b"]);
  assert.deepEqual(
    sessionContext(
      [source("nobody", { repos: ["zeta/*"] })],
      { id: "widgets", github: "acme/widgets" },
      places(home),
    ).sources,
    [],
  );
});

test("a repository with no GitHub remote matches only by its ID", () => {
  const home = temporaryDirectory("avoozl-home-");
  const sources = [
    source("byId", { repos: ["scratch"] }),
    source("byName", { repos: ["acme/*"] }),
  ];
  assert.deepEqual(
    sessionContext(sources, { id: "scratch", github: null }, places(home))
      .sources,
    ["byId"],
  );
  assert.deepEqual(
    sessionContext(sources, { id: "other", github: null }, places(home))
      .sources,
    [],
  );
});

test("one alias from two sources is dropped from both and named", () => {
  const home = temporaryDirectory("avoozl-home-");
  const given = sessionContext(
    [
      source("one", {
        servers: { research: server(["a"]), docs: server(["d"]) },
      }),
      source("two", { servers: { research: server(["b"]) } }),
    ],
    { id: "w", github: "acme/w" },
    places(home),
  );
  assert.deepEqual(Object.keys(given.servers), ["docs"]);
  assert.deepEqual(given.conflicts, [
    { alias: "research", sources: ["one", "two"] },
  ]);
  assert.ok(given.left.some((l) => l.item === "mcp research"));
});

test("a read that is, holds or is inside a denied path, a config or state folder, or home is left out", () => {
  const home = temporaryDirectory("avoozl-home-"),
    ssh = path.join(home, ".ssh"),
    config = path.join(home, ".config", "avoozl"),
    state = path.join(home, ".local", "state", "avoozl"),
    inside = path.join(ssh, "keys"),
    fine = path.join(home, "fine");
  for (const dir of [ssh, config, state, inside, fine])
    fs.mkdirSync(dir, { recursive: true });
  const reads = [
    ["ssh", ssh],
    ["inside", inside],
    ["config", config],
    ["state", state],
    ["home", home],
    ["holds", path.join(home, ".config")],
    ["fine", fine],
    ["missing", path.join(home, "missing")],
  ].map(([id, folder]) => ({ id, about: id, path: folder }));
  const given = sessionContext(
    [source("s", { reads })],
    { id: "w", github: "acme/w" },
    places(home),
  );
  assert.deepEqual(
    given.reads.map((r) => r.id),
    ["fine"],
  );
  const why = Object.fromEntries(given.left.map((l) => [l.item, l.why]));
  for (const id of ["ssh", "inside", "config", "state", "holds"])
    assert.match(why[`read ${id}`], /denies/, id);
  assert.match(why["read home"], /home folder itself/);
  assert.match(why["read missing"], /missing/);
  assert.equal(Object.keys(why).length, 7);
});

test("a skill is copied only when each file's hash matches the approval", () => {
  const machine = contextMachine({ approve: true }),
    [src] = loadSources({ pluginOptions: machine.options }),
    target = temporaryDirectory("avoozl-skills-");
  const ok = copySkills(src.skills, target);
  assert.deepEqual(
    ok.skills.map((s) => s.name),
    ["error-messages", "module-layout"],
  );
  assert.ok(fs.existsSync(path.join(target, "module-layout", "SKILL.md")));
  assert.equal(ok.left.length, 0);
  fs.appendFileSync(
    path.join(machine.folder, "skills", "module-layout", "SKILL.md"),
    "\nchanged\n",
  );
  const second = temporaryDirectory("avoozl-skills-");
  const changed = copySkills(src.skills, second);
  assert.deepEqual(
    changed.skills.map((s) => s.name),
    ["error-messages"],
  );
  assert.match(changed.left[0].why, /changed after it was approved/);
  assert.ok(!fs.existsSync(path.join(second, "module-layout")));
});

test("the brief names each skill and read, and says it is the person's context", () => {
  const text = contextBrief({
    skills: [
      {
        name: "module-layout",
        description: "How",
        path: "/s/module-layout/SKILL.md",
      },
    ],
    reads: [{ id: "n", about: "Design notes", path: "/n" }],
    servers: { research: { about: "Answers questions" } },
  });
  assert.match(text, /^## Epic context/);
  assert.match(text, /module-layout: How \(\/s\/module-layout\/SKILL\.md\)/);
  assert.match(text, /Design notes \(\/n\)/);
  assert.match(text, /research: Answers questions/);
  assert.equal(contextBrief({ skills: [], reads: [], servers: {} }), "");
});

test("the machine block and an approved plugin both load as sources", () => {
  const machine = contextMachine({ approve: true });
  writeEpicContext(path.dirname(machine.settingsFile), {
    repos: ["acme/*"],
    reads: [machine.notes],
    mcp: {
      docs: { about: "Docs", command: ["docs-mcp"], env: ["DOCS_TOKEN"] },
    },
  });
  const sources = loadSources({
    configDirectory: path.dirname(machine.settingsFile),
    pluginOptions: machine.options,
  });
  assert.deepEqual(
    sources.map((s) => s.name),
    ["this machine", "team-context"],
  );
});

test("an unanswered ask and a doubled alias each raise one Needs you row", (t) => {
  const machine = contextMachine({ approve: true, answer: false }),
    { store } = fixture(t);
  bindContentRules(store, {
    workspaceRoot: machine.workspaceRoot,
    pluginSettingsFile: machine.settingsFile,
    configFile: path.join(machine.root, "config.json"),
  });
  const rows = contextNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "epic-context-asks:team-context");
  assert.match(rows[0].title, /team-context/);
  assert.match(rows[0].detail, /notesRoot: The folder of your clone/);
  store.put("repositories", { id: "w", github: "acme/w" });
  const data = store.read();
  data.tasks.push({
    id: "t",
    title: "t",
    scope: "catalog",
    status: "planned",
    track: "catalog",
    tags: [],
    acceptance: ["x"],
    repository: "w",
  });
  store.commit(data, "seed", data.revision);
  recordContext(store, {
    taskId: "t",
    gate: { given: true, tests: [] },
    given: {
      sources: ["a", "b"],
      skills: [],
      reads: [],
      servers: {},
      contentSets: [],
      left: [],
      conflicts: [{ alias: "research", sources: ["a", "b"] }],
    },
    hasSources: true,
  });
  const alias = contextNeedsYou(store).filter(
    (r) => r.reason === "epic-context-alias",
  );
  assert.equal(alias.length, 1);
  assert.match(alias[0].title, /a and b both give MCP server research for w/);
});
