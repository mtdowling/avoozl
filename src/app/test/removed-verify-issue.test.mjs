// Requirement 91.1 (task 45.2): `verify-issue`, the provenance marker, the
// `avoozl-crew` agent and its Issue Radar tool grant are gone and stay gone.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OLD_TOOLS } from "../mcp.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the removed modules and agent files do not exist", () => {
  for (const file of [
    "src/app/verify-issue.mjs",
    "src/app/github-provenance.mjs",
    "src/app/radar-provenance.mjs",
    "src/app/crew-agent.mjs",
    "src/app/radar-crew-prompt.mjs",
    "kirocrew-app/agents/avoozl-crew.json",
    "prompts/crew.md",
  ])
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
});

test("no app manifest or agent list ships the crew agent or its Radar tools", () => {
  const app = JSON.parse(read("kirocrew-app/app.json"));
  assert.ok(!app.agents.some((file) => /avoozl-crew/.test(file)));
  const metadata = JSON.parse(
    read("src/app/executors/kirocrew/agent-metadata.json"),
  );
  assert.ok(!metadata.some((agent) => agent.name === "avoozl-crew"));
  const tools = metadata.flatMap((agent) => agent.tools ?? []);
  for (const tool of tools)
    assert.doesNotMatch(
      tool,
      /plans_verify_issue|issue_radar_crew_(read|record)/,
    );
  for (const file of fs.readdirSync(path.join(root, "kirocrew-app/agents")))
    assert.doesNotMatch(
      read(`kirocrew-app/agents/${file}`),
      /plans_verify_issue|issue_radar_crew_(read|record)/,
      file,
    );
  assert.doesNotMatch(read("src/avoozl-config.schema.json"), /avoozl-crew/);
});

test("the issue.verify operation and plans_verify_issue tool are gone", () => {
  assert.ok(!("plans_verify_issue" in OLD_TOOLS));
  assert.equal(classifyOperation("issue.verify"), null);
});

test("the verify-issue command is unknown", () => {
  const dir = temporaryDirectory(),
    run = spawnSync(
      process.execPath,
      [path.join(root, "cli.mjs"), "verify-issue", "owner/repo#1"],
      { cwd: dir, encoding: "utf8" },
    );
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.stdout, /checks|marker/i);
});
