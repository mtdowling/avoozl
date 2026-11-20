// `avoozl telemetry status|enable|disable` (spec otel-export, OT11.7).
import { help } from "../cli/command-help.mjs";

const show = (value) => console.log(JSON.stringify(value, null, 2));

export const commands = [
  {
    command: "telemetry status",
    help: [
      help(
        "machine",
        "telemetry status",
        "Whether task timing is sent over OpenTelemetry, and the counts",
      ),
    ],
    async run({ localOrRequest }) {
      show(await localOrRequest("telemetry.status", {}));
    },
  },
  {
    command: "telemetry enable",
    help: [
      help(
        "machine",
        "telemetry enable",
        "Turn on sending task timing; the endpoint comes from OTEL_EXPORTER_OTLP_*",
      ),
    ],
    async run({ localOrRequest }) {
      show(await localOrRequest("telemetry.configure", { enabled: true }));
    },
  },
  {
    command: "telemetry disable",
    help: [
      help("machine", "telemetry disable", "Turn off sending task timing"),
    ],
    async run({ localOrRequest }) {
      show(await localOrRequest("telemetry.configure", { enabled: false }));
    },
  },
];
