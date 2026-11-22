// `avoozl context set` and `avoozl context show` from a terminal, and the
// plugin list's context part (epic-context ec-1.2, ec-1.4).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { Operations } from "../../api/operations.ts";
import { Store } from "../../store/store.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { contextMachine } from "./context-fixture.ts";

const cli = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));

const block = {
  repos: ["acme/*"],
  reads: [os.tmpdir()],
  mcp: {
    research: {
      about: "Answers",
      command: ["research-mcp"],
      env: ["RESEARCH_TOKEN"],
    },
  },
};

function setup() {
  const machine = temporaryDirectory("avoozl-ctx-cli-"),
    workspace = temporaryDirectory("avoozl-ctx-cli-ws-"),
    env = {
      XDG_CONFIG_HOME: path.join(machine, "config"),
      XDG_STATE_HOME: path.join(machine, "state"),
    };
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json"),
    JSON.stringify({ version: 1, port: 0, workspaces: {} }),
  );
  initializeWorkspace(workspace, { name: "Context CLI", port: 0 });
  const run = (args: string[], extra = {}) =>
    execFileSync(process.execPath, [cli, ...args, "--workspace", workspace], {
      encoding: "utf8",
      env: { ...process.env, ...env, ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    });
  return { env, workspace, run };
}

test("avoozl context set and show work from a terminal and keep the other keys", () => {
  const { env, run } = setup();
  const file = path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json");
  run(["context", "set", "--json", JSON.stringify(block)]);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(saved.epicContext, block);
  assert.equal(saved.port, 0, "other keys stay");
  const shown = JSON.parse(run(["context", "show"]));
  assert.deepEqual(shown.machine, block);
  assert.deepEqual(shown.sessions, []);
  assert.throws(
    () => run(["context", "set", "--json", JSON.stringify({ repos: [] })]),
    /epicContext\.repos/,
  );
  assert.throws(
    () =>
      run([
        "context",
        "set",
        "--json",
        JSON.stringify({
          ...block,
          reads: [path.join(os.tmpdir(), "none-x9")],
        }),
      ]),
    /epicContext\.reads\.0 .* is not a folder on this machine/,
  );
  run(["context", "set", "--remove"]);
  assert.equal(
    "epicContext" in JSON.parse(fs.readFileSync(file, "utf8")),
    false,
  );
});

test("a supervisor child is refused at the command line", () => {
  const { run } = setup();
  assert.throws(
    () =>
      run(["context", "set", "--json", JSON.stringify(block)], {
        AVOOZL_CHILD: "1",
        AVOOZL_CHILD_SESSION: "process-x",
      }),
    /agent the supervisor started/,
  );
});

test("plugins.list shows the context part, and answering is a person's act", async () => {
  const machine = contextMachine({ answer: false, map: false }),
    store = new Store(
      workspaceConfig({
        workspace: (() => {
          const root = temporaryDirectory("avoozl-ctx-ops-");
          initializeWorkspace(root, { name: "Ops", port: 0 });
          return root;
        })(),
      }).dbPath,
    );
  try {
    const ops = new Operations(store, {
      workspaceRoot: machine.workspaceRoot,
      pluginSettingsFile: machine.settingsFile,
    });
    const listed = await ops.execute<{
      plugins: {
        id: string;
        context: {
          state: string;
          ask: { answer: unknown }[];
          missing: unknown;
        };
      }[];
    }>("plugins.list", {});
    const part = listed.plugins.find((p) => p.id === "team-context")?.context;
    assert.ok(part);
    assert.equal(part.state, "unapproved");
    assert.equal(part.ask[0].answer, null);
    assert.deepEqual(part.missing, {
      questions: ["notesRoot"],
      aliases: ["research"],
    });
    await assert.rejects(
      ops.execute(
        "plugin.answer",
        { id: "team-context", name: "notesRoot", value: machine.notes },
        undefined,
        { mcp: true },
      ),
      /person|MCP/i,
    );
    await ops.execute(
      "plugin.answer",
      { id: "team-context", name: "notesRoot", value: machine.notes },
      undefined,
      { local: true, person: true },
    );
    assert.equal(
      machine.settings().context?.["team-context"]?.answers?.notesRoot,
      machine.notes,
    );
  } finally {
    store.close();
  }
});
