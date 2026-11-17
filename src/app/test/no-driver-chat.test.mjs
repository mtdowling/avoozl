// The driver chat was removed: no avoozl-driver agent, no driver session
// operations, and no driver session setting. This fails if any comes back.
// The per-spec driver lock (driver.*, §6.10) is a different feature and stays.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MODEL_ROLES } from "../chat-models.mjs";
import { classifyOperation } from "../operation-kinds.mjs";

const read = (file) =>
  fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const exists = (file) =>
  fs.existsSync(new URL(`../../../${file}`, import.meta.url));

test("the avoozl-driver agent and the driver session setting stay removed", () => {
  const manifest = JSON.parse(read("kirocrew-app/app.json"));
  assert.ok(!manifest.agents.some((file) => /avoozl-driver/.test(file)));
  const metadata = JSON.parse(
    read("src/app/executors/kirocrew/agent-metadata.json"),
  );
  assert.ok(!metadata.some((agent) => agent.name === "avoozl-driver"));
  assert.ok(!exists("kirocrew-app/agents/avoozl-driver.json"));
  assert.ok(!exists("prompts/driver.md"));
  assert.doesNotMatch(read("kirocrew-app/bin/avoozl.mjs"), /driver hook/);
  assert.doesNotMatch(read("src/app/cli.mjs"), /driver-session|"hook"\)/);
  assert.ok(!exists("src/app/driver-session.mjs"));
  // No driver session operation.
  for (const name of ["driversession.view", "driversession.register"])
    assert.equal(classifyOperation(name), null, name);
  // Settings: no driver tab and no driver chat model.
  assert.ok(!MODEL_ROLES.includes("driver"));
  assert.doesNotMatch(
    read("kirocrew-app/ui/src/models-api.ts"),
    /key: 'driver'/,
  );
  assert.doesNotMatch(
    read("kirocrew-app/ui/src/SettingsView.tsx"),
    /key: 'driver'/,
  );
  assert.ok(!exists("kirocrew-app/ui/src/DriverSessionBox.tsx"));
});
