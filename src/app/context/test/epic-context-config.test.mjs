// The machine epicContext block (epic-context ec-1.2): what loads, what is
// refused naming the key, where the block may live, and who may set it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  readEpicContext,
  validateEpicContext,
  writeEpicContext,
} from "../epic-context-config.mjs";
import { normalizeHostConfig } from "../../settings/host-config.mjs";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { OPERATIONS } from "../../api/operation-table.mjs";
import { mcpRefusal, cliRefusal } from "../../mcp/mcp-policy.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const good = () => ({
  repos: ["acme/*", "research"],
  reads: ["~/notes/acme-widgets"],
  mcp: {
    research: {
      about: "Answers questions from the team's design archive",
      command: ["research-mcp", "--stdio"],
      env: ["RESEARCH_TOKEN"],
    },
  },
  contentSets: ["acme-terms"],
});

const refused = (edit, pattern) => {
  const block = good();
  edit(block);
  assert.throws(() => validateEpicContext(block, "epicContext"), pattern);
};

test("the block loads with repos, reads, mcp and contentSets", () => {
  assert.deepEqual(validateEpicContext(good()), good());
  assert.deepEqual(validateEpicContext({ repos: ["acme/widgets"] }), {
    repos: ["acme/widgets"],
  });
});

test("an unknown key, a missing repos and each limit are refused naming the key", () => {
  refused((b) => (b.network = true), /epicContext\.network/);
  refused((b) => delete b.repos, /epicContext\.repos is required/);
  refused((b) => (b.repos = []), /epicContext\.repos/);
  refused((b) => (b.repos = Array(51).fill("acme/*")), /epicContext\.repos/);
  refused((b) => (b.repos = ["not a name"]), /epicContext\.repos/);
  refused((b) => (b.reads = Array(21).fill("~/notes")), /epicContext\.reads/);
  refused((b) => (b.reads = ["relative/path"]), /epicContext\.reads\.0/);
  refused((b) => (b.reads = ["~/a/../b"]), /epicContext\.reads\.0/);
  refused(
    (b) =>
      (b.mcp = Object.fromEntries(
        Array.from({ length: 11 }, (_, i) => [`s${i}`, b.mcp.research]),
      )),
    /epicContext\.mcp/,
  );
  refused((b) => (b.mcp.Bad_Alias = b.mcp.research), /alias Bad_Alias/);
  refused((b) => (b.mcp.research.extra = 1), /mcp\.research\.extra/);
  refused((b) => (b.mcp.research.about = ""), /mcp\.research\.about/);
  refused((b) => (b.contentSets = ["Bad Set"]), /epicContext\.contentSets/);
});

test("a shell string command and a credential are refused", () => {
  refused(
    (b) => (b.mcp.research.command = "research-mcp --stdio"),
    /mcp\.research\.command must be an argument list, not a shell string/,
  );
  refused(
    (b) => (b.mcp.research.command = ["x", "ghp_" + "a".repeat(36)]),
    /mcp\.research\.command holds what looks like a credential/,
  );
  refused(
    (b) => (b.mcp.research.apiToken = "x"),
    /mcp\.research\.apiToken looks like a credential/,
  );
  refused((b) => (b.mcp.research.env = ["not a name"]), /mcp\.research\.env/);
});

test("the host config validates the block and the file reads it back", () => {
  const dir = temporaryDirectory("avoozl-ec-");
  assert.throws(
    () =>
      normalizeHostConfig({ version: 1, epicContext: { repos: [] } }, "config"),
    /epicContext\.repos/,
  );
  assert.equal(readEpicContext(dir), null);
  writeEpicContext(dir, good());
  assert.deepEqual(readEpicContext(dir), good());
  const file = JSON.parse(
    fs.readFileSync(path.join(dir, "config.json"), "utf8"),
  );
  assert.equal(file.version, 1);
  assert.doesNotThrow(() => normalizeHostConfig(file, "config"));
  writeEpicContext(dir, null);
  assert.equal(readEpicContext(dir), null);
});

test("a repository file and a layered workspace config refuse epicContext, naming the file", () => {
  const root = temporaryDirectory("avoozl-ec-ws-"),
    home = temporaryDirectory("avoozl-ec-home-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, epicContext: good() }),
  );
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot: root, env: {}, home }),
    /epicContext.*\.avoozl\.json|\.avoozl\.json.*epicContext/,
  );
  // The machine's own config.json holds it.
  fs.rmSync(path.join(root, ".avoozl.json"));
  fs.mkdirSync(path.join(home, ".config", "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".config", "avoozl", "config.json"),
    JSON.stringify({ version: 1, epicContext: good() }),
  );
  assert.doesNotThrow(() =>
    loadLayeredConfig({ workspaceRoot: root, env: {}, home }),
  );
});

test("context.machine.set is a person's act: refused over MCP, for a bound caller and for a child", async () => {
  const entry = OPERATIONS.get("context.machine.set");
  assert.equal(entry.policy.kind, "person");
  assert.ok(mcpRefusal("context.machine.set", { epicContext: good() }));
  assert.ok(
    cliRefusal(
      "context.machine.set",
      { epicContext: good() },
      { env: { AVOOZL_CHILD: "1", AVOOZL_CHILD_SESSION: "process-x" } },
    ),
  );
  assert.equal(
    cliRefusal("context.machine.set", {}, { env: {} }),
    null,
    "a terminal is allowed",
  );
  const calls = { configDirectory: "/nonexistent" };
  for (const context of [{ caller: { slot: "s" } }, { mcp: true }])
    await assert.rejects(
      async () =>
        entry.handler.call(calls, { input: { epicContext: good() }, context }),
      /Only a person/,
    );
});
