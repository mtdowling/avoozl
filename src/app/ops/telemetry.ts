// The OTLP exporter's status and its machine setting (spec otel-export, OT5,
// OT11, §D6, §D11).
import path from "node:path";
import { person, notOnMcp } from "../api/operation-policy.ts";
import { globalAvoozlConfigPath } from "../settings/layered-config.ts";
import { validateTelemetry } from "../settings/telemetry-config.ts";
import { writeMachineFile } from "../tick/crews.ts";
import { fail } from "../store/store.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { telemetryHandle, telemetryStatus } from "../telemetry/index.ts";
import type { Operations } from "../api/operations.ts";

const configDirectory = (operations: Operations) =>
  operations.configDirectory ?? machineAvoozlPaths().configDirectory;

export const entries = [
  {
    name: "telemetry.status",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "A chat has no use for the export's status; Settings and the CLI show it.",
    ),
    handler(this: Operations) {
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
    async handler(
      this: Operations,
      { input }: { input?: Record<string, unknown> | null },
    ) {
      const given = Object.keys(input ?? {}).filter(
        (key) => input?.[key] !== undefined,
      );
      if (!given.length) fail("Name a telemetry setting to change.", 400);
      const patch: Record<string, unknown> = Object.fromEntries(
        given.map((key) => [key, input?.[key]]),
      );
      if (patch.endpoint === "" || patch.endpoint === null)
        patch.endpoint = undefined;
      validateTelemetry(patch);
      const file = this.configDirectory
        ? path.join(this.configDirectory, "config.json")
        : globalAvoozlConfigPath();
      writeMachineFile(file, (value) => {
        const telemetry: Record<string, unknown> = {
          ...(value.telemetry as Record<string, unknown> | undefined),
          ...patch,
        };
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
