// The context plugin part (epic-context ec-1.3, ec-1.4): manifest checks,
// who may declare it, the answers and mappings the approval binds, and the
// approval view.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { validateManifest } from "../../plugins/plugins.mjs";
import { contextSources, contextView, setAnswer } from "../plugin-context.mjs";
import { setMapping } from "../../plugins/plugin-checks.mjs";
import { OPERATIONS } from "../../api/operation-table.mjs";
import { mcpRefusal } from "../../mcp/mcp-policy.mjs";
import { contextMachine, EXAMPLE } from "./context-fixture.mjs";

const manifestOf = () =>
  JSON.parse(fs.readFileSync(path.join(EXAMPLE, "avoozl-plugin.json"), "utf8"));
const refused = (edit, pattern, files = {}) => {
  const machine = contextMachine({
    edit: (m) => {
      edit(m);
      return m;
    },
  });
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(machine.folder, file)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(machine.folder, file), text);
  }
  assert.throws(
    () =>
      validateManifest(
        JSON.parse(
          fs.readFileSync(
            path.join(machine.folder, "avoozl-plugin.json"),
            "utf8",
          ),
        ),
        { id: "team-context" },
        machine.folder,
      ),
    pattern,
  );
};

test("a team-context manifest with skills, reads, asks and servers loads", () => {
  const machine = contextMachine();
  const plugin = machine.plugin();
  assert.equal(plugin.state, "unapproved");
  assert.deepEqual(
    plugin.context.skills.map((s) => s.name),
    ["error-messages", "module-layout"],
  );
  assert.deepEqual(Object.keys(plugin.context.servers), ["research"]);
  assert.deepEqual(plugin.context.contentSets, ["acme-terms"]);
  assert.match(plugin.context.skills[0].hash, /^[0-9a-f]{64}$/);
});

test("a plugin that provides only context and names an entry is refused", () => {
  refused(
    (m) => (m.entry = "index.mjs"),
    /provides only context.*remove entry/,
  );
});

test("each context key error is refused naming the key", () => {
  refused((m) => (m.context.extra = 1), /context\.extra/);
  refused((m) => delete m.context.repos, /context\.repos/);
  refused((m) => (m.context.repos = []), /context\.repos/);
  refused((m) => (m.context.reads[0].path = "relative"), /reads\.0\.path/);
  refused((m) => (m.context.reads[0].extra = 1), /reads\.0\.extra/);
  refused((m) => (m.context.ask.notesRoot = ""), /ask\.notesRoot/);
  refused((m) => (m.context.ask.unused = "Why?"), /ask\.unused is not used/);
  refused(
    (m) => (m.context.reads[0].path = "{ask:missing}/x"),
    /uses \{ask:missing\}, which ask does not list/,
  );
  refused(
    (m) => (m.context.skills = "../skills"),
    /skills must name a folder inside/,
  );
  refused((m) => (m.context.mcp = "../servers.json"), /inside the plugin/);
  refused((m) => (m.context.contentSets = ["Bad Set"]), /contentSets/);
  refused((m) => delete m.provides, /kinds must list|provides/);
});

test("a skill over 64 KB or with a wrong name is refused", () => {
  refused(() => {}, /over 64 KB/, {
    "skills/module-layout/SKILL.md": `---\nname: module-layout\ndescription: x\n---\n${"a".repeat(65 * 1024)}`,
  });
  refused(() => {}, /name must be module-layout/, {
    "skills/module-layout/SKILL.md": "---\nname: other\ndescription: x\n---\n",
  });
  refused(() => {}, /needs a description/, {
    "skills/module-layout/SKILL.md": "---\nname: module-layout\n---\n",
  });
});

test("a servers file with env or a credential, a command outside the plugin and a shell string are refused", () => {
  const servers = (value) => ({ "mcp/servers.json": JSON.stringify(value) });
  const research = (extra) => ({
    research: {
      about: "Answers",
      command: ["node", "mcp/research.mjs"],
      ...extra,
    },
  });
  refused(
    () => {},
    /research\.env is not allowed/,
    servers(research({ env: ["X"] })),
  );
  refused(
    () => {},
    /looks like a credential/,
    servers(research({ command: ["node", "ghp_" + "a".repeat(36)] })),
  );
  refused(
    () => {},
    /command\[0\] must be a program name or a path inside the plugin/,
    servers(research({ command: ["../outside/server"] })),
  );
  refused(
    () => {},
    /command\[0\] must be a program name or a path inside the plugin/,
    servers(research({ command: ["/usr/bin/server"] })),
  );
  refused(
    () => {},
    /not a shell string/,
    servers(research({ command: "node mcp/research.mjs" })),
  );
});

test("an ask that is unanswered gives nothing and an unmapped alias gives nothing", () => {
  const unanswered = contextMachine({ approve: true, answer: false });
  assert.equal(unanswered.plugin().state, "approved");
  assert.deepEqual(contextSources(unanswered.options), []);
  assert.equal(
    contextView(unanswered.plugin(), unanswered.settings()).state,
    "needs answers",
  );
  const unmapped = contextMachine({ approve: true, map: false });
  assert.deepEqual(contextSources(unmapped.options), []);
  assert.equal(
    contextView(unmapped.plugin(), unmapped.settings()).state,
    "needs mapping",
  );
});

test("contextSources returns only approved machine plugins", () => {
  const unapproved = contextMachine();
  assert.deepEqual(contextSources(unapproved.options), []);
  const machine = contextMachine({ approve: true });
  const [source] = contextSources(machine.options);
  assert.equal(source.id, "team-context");
  assert.equal(
    path.normalize(source.reads[0].path),
    path.join(machine.notes, "widgets"),
  );
  assert.deepEqual(source.servers.research.env, ["RESEARCH_TOKEN"]);
  assert.equal(source.servers.research.replaced, false);
});

test("a part a repository's .avoozl.json declares is skipped and marked ignored", () => {
  const machine = contextMachine({ declare: "repository", approve: false });
  const plugin = machine.plugin();
  assert.equal(plugin.source, "repository");
  assert.deepEqual(contextSources(machine.options), []);
  const view = contextView(plugin, machine.settings());
  assert.equal(view.state, "ignored");
  assert.equal(view.ignored, "context ignored: declared in .avoozl.json");
});

test("changing an answer or a mapping turns the plugin changed until approved again", () => {
  const machine = contextMachine({ approve: true });
  assert.equal(machine.plugin().state, "approved");
  setAnswer(machine.options, {
    id: "team-context",
    name: "notesRoot",
    value: machine.notes,
  });
  assert.equal(
    machine.plugin().state,
    "approved",
    "the same answer changes nothing",
  );
  fs.mkdirSync(path.join(machine.root, "other"));
  setAnswer(machine.options, {
    id: "team-context",
    name: "notesRoot",
    value: path.join(machine.root, "other"),
  });
  assert.equal(machine.plugin().state, "changed");
  assert.deepEqual(contextSources(machine.options), []);
  machine.approve();
  assert.equal(machine.plugin().state, "approved");
  setMapping(machine.options, {
    id: "team-context",
    alias: "research",
    env: ["OTHER_TOKEN"],
  });
  assert.equal(machine.plugin().state, "changed");
  machine.approve();
  assert.equal(machine.plugin().state, "approved");
});

test("a mapping holds env names and an optional command, never a credential", () => {
  const machine = contextMachine({ approve: true });
  const set = (input) =>
    setMapping(machine.options, {
      id: "team-context",
      alias: "research",
      ...input,
    });
  assert.throws(
    () => set({ command: "research-mcp" }),
    /command must be command arguments/,
  );
  assert.throws(
    () => set({ command: ["x", "ghp_" + "a".repeat(36)] }),
    /looks like a credential/,
  );
  assert.throws(() => set({ env: ["not a name"] }), /env must list/);
  assert.throws(
    () =>
      setMapping(machine.options, {
        id: "team-context",
        alias: "nope",
        env: [],
      }),
    /declares no server nope/,
  );
  set({ command: ["research-mcp", "--stdio"], env: ["RESEARCH_TOKEN"] });
  machine.approve();
  const [source] = contextSources(machine.options);
  assert.deepEqual(source.servers.research.command, [
    "research-mcp",
    "--stdio",
  ]);
  assert.equal(source.servers.research.replaced, true);
});

test("readPluginSettings keeps context through plugin edits", () => {
  const machine = contextMachine({ approve: true });
  machine.approve();
  assert.deepEqual(machine.settings().context["team-context"].answers, {
    notesRoot: machine.notes,
  });
});

test("answer, map and approve are refused over MCP", () => {
  for (const name of ["plugin.answer", "plugin.map", "plugin.approve"]) {
    assert.equal(OPERATIONS.get(name).policy.kind, "person", name);
    assert.ok(mcpRefusal(name, {}), name);
  }
  assert.throws(
    () =>
      OPERATIONS.get("plugin.answer").handler.call(
        { pluginOptions: { workspaceRoot: "x" } },
        { input: {}, context: { mcp: true } },
      ),
    /Only a person/,
  );
});

test("an answer outside a folder shape is refused", () => {
  const machine = contextMachine({ approve: true });
  assert.throws(
    () =>
      setAnswer(machine.options, {
        id: "team-context",
        name: "notesRoot",
        value: "relative",
      }),
    /must be absolute or start with ~\//,
  );
  assert.throws(
    () =>
      setAnswer(machine.options, {
        id: "team-context",
        name: "other",
        value: "~/x",
      }),
    /asks no question other/,
  );
});

test("the approval view lists repos, skills with hashes, reads written and filled, servers and sets", () => {
  const machine = contextMachine({ approve: true });
  const view = contextView(machine.plugin(), machine.settings());
  assert.deepEqual(view.repos, ["acme/*"]);
  assert.equal(view.skills.length, 2);
  assert.match(view.skills[0].hash, /^[0-9a-f]{64}$/);
  assert.equal(view.reads[0].written, "{ask:notesRoot}/widgets");
  assert.equal(
    path.normalize(view.reads[0].filled),
    path.join(machine.notes, "widgets"),
  );
  assert.deepEqual(view.servers[0].command, ["node", "mcp/research.mjs"]);
  assert.deepEqual(view.servers[0].env, ["RESEARCH_TOKEN"]);
  assert.deepEqual(view.contentSets, ["acme-terms"]);
  assert.equal(view.state, "approved");
});
