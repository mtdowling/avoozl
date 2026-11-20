// ot-1.2: the machine setting (OT4.1, OT4.3, OT5.1, OT5.2, OT5.4).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readTelemetryConfig } from "../../telemetry/config.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import { validateTelemetry } from "../telemetry-config.mjs";
import { validateManifest } from "../../plugins/plugins.mjs";

test("validateTelemetry accepts enabled and nothing, and names what it refuses", () => {
  validateTelemetry({ enabled: true });
  validateTelemetry({});
  validateTelemetry(undefined);
  assert.throws(
    () => validateTelemetry({ endpoint: "x" }),
    /telemetry\.endpoint/,
  );
  assert.throws(
    () => validateTelemetry({ enabled: "yes" }),
    /telemetry\.enabled/,
  );
  for (const value of [null, [], "on", 1])
    assert.throws(
      () => validateTelemetry(value),
      /telemetry must be an object/,
    );
});

test("telemetry in .avoozl.json is refused, naming the file and the machine file", () => {
  const root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, telemetry: { enabled: true } }),
  );
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot: root,
        env: { XDG_CONFIG_HOME: path.join(root, "xdg") },
        home: root,
      }),
    /telemetry is set in .*\.avoozl\.json\. Put it in .*config\.json/,
  );
});

test("a plugin manifest with a telemetry key fails", () => {
  const manifest = {
    id: "fake-intake",
    version: "1.0.0",
    contract: 1,
    kinds: ["intake"],
    capabilities: { intake: [] },
    entry: "index.mjs",
  };
  assert.throws(
    () =>
      validateManifest(
        { ...manifest, telemetry: { enabled: true } },
        { id: "fake-intake" },
      ),
    /telemetry/,
  );
});

test("with no telemetry key the status is off", () => {
  const directory = temporaryDirectory();
  assert.equal(readTelemetryConfig(directory).status, "off");
  fs.writeFileSync(path.join(directory, "config.json"), "{}");
  assert.equal(readTelemetryConfig(directory).status, "off");
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({ telemetry: { enabled: false } }),
  );
  assert.equal(readTelemetryConfig(directory).enabled, false);
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({ telemetry: { enabled: true } }),
  );
  assert.equal(readTelemetryConfig(directory).enabled, true);
});
