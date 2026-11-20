// The OTLP exporter's status and its machine setting (spec otel-export, OT5,
// OT11, §D6, §D11).
import path from "node:path";
import { person, notOnMcp } from "../api/operation-policy.mjs";
import { globalAvoozlConfigPath } from "../settings/layered-config.mjs";
import { validateTelemetry } from "../settings/telemetry-config.mjs";
import { writeMachineFile } from "../tick/crews.mjs";
import { fail } from "../store/store.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { telemetryHandle, telemetryStatus } from "../telemetry/index.mjs";

const configDirectory = (operations) =>
  operations.configDirectory ?? machineAvoozlPaths().configDirectory;

export const entries = [
  {
    name: "telemetry.status",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "A chat has no use for the export's status; Settings and the CLI show it.",
    ),
    handler() {
      return telemetryStatus(this.store, {
        configDirectory: configDirectory(this),
      });
    },
  },
  {
    name: "telemetry.configure",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes telemetry export."),
    // Writes the keys the input names and keeps the rest: `enabled`,
    // `endpoint` (null or "" removes it), `protocol` and `headers` (names
    // only). Header values are never taken.
    async handler({ input }) {
      const given = Object.keys(input ?? {}).filter(
        (key) => input[key] !== undefined,
      );
      if (!given.length) fail("Name a telemetry setting to change.", 400);
      const patch = Object.fromEntries(given.map((key) => [key, input[key]]));
      if (patch.endpoint === "" || patch.endpoint === null)
        patch.endpoint = undefined;
      validateTelemetry(patch);
      const file = this.configDirectory
        ? path.join(this.configDirectory, "config.json")
        : globalAvoozlConfigPath();
      writeMachineFile(file, (value) => {
        const telemetry = { ...value.telemetry, ...patch };
        for (const key of Object.keys(telemetry))
          if (telemetry[key] === undefined) delete telemetry[key];
        value.telemetry = telemetry;
      });
      await telemetryHandle(this.store)?.step();
      return telemetryStatus(this.store, {
        configDirectory: configDirectory(this),
      });
    },
  },
];
