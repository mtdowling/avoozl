// The driver chat was removed: no avoozl-driver agent, no driver session
// operations, and no driver session setting. This fails if any comes back.
// The per-spec driver lock (driver.*, §6.10) is a different feature and stays.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ROLES } from "../agents/role-table.mjs";
import { classifyOperation } from "../api/operation-table.mjs";

const read = (file) =>
  fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const exists = (file) =>
  fs.existsSync(new URL(`../../../${file}`, import.meta.url));

test("the avoozl-driver agent and the driver session setting stay removed", () => {
  const manifest = JSON.parse(read("hosts/kirocrew/app.json"));
  assert.ok(!manifest.agents.some((file) => /avoozl-driver/.test(file)));
  const metadata = JSON.parse(read("roles.json"));
  assert.ok(!metadata.some((agent) => agent.name === "avoozl-driver"));
  assert.ok(!exists("hosts/kirocrew/agents/avoozl-driver.json"));
  assert.ok(!exists("prompts/driver.md"));
  assert.doesNotMatch(read("hosts/kirocrew/bin/avoozl.mjs"), /driver hook/);
  assert.doesNotMatch(
    read("src/app/cli/cli.mjs"),
    /driver-session|registerDriverSession/,
  );
  assert.ok(!exists("src/app/driver-session.mjs"));
  // No driver session operation.
  for (const name of ["driversession.view", "driversession.register"])
    assert.equal(classifyOperation(name), null, name);
  // Settings: no driver tab and no driver chat model.
  assert.ok(!ROLES.includes("driver"));
  assert.doesNotMatch(
    read("hosts/kirocrew/ui/src/models-api.ts"),
    /key: 'driver'/,
  );
  assert.doesNotMatch(
    read("hosts/kirocrew/ui/src/SettingsView.tsx"),
    /key: 'driver'/,
  );
  assert.ok(!exists("hosts/kirocrew/ui/src/DriverSessionBox.tsx"));
});
