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
    policy: person("Only a person turns telemetry export on or off."),
    async handler({ input }) {
      const telemetry = { enabled: input.enabled };
      validateTelemetry(telemetry);
      if (typeof input.enabled !== "boolean")
        fail("enabled must be true or false.", 400);
      const file = this.configDirectory
        ? path.join(this.configDirectory, "config.json")
        : globalAvoozlConfigPath();
      writeMachineFile(file, (value) => {
        value.telemetry = { ...value.telemetry, enabled: input.enabled };
      });
      await telemetryHandle(this.store)?.step();
      return telemetryStatus(this.store, {
        configDirectory: configDirectory(this),
      });
    },
  },
];
