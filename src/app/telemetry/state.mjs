// The instance ID (spec otel-export, OT6.7, §D2): a random UUID made once per
// machine and kept in `telemetry.json` in the state folder, outside SQLite, so
// `avoozl rebuild` keeps it. A file that cannot be read gives a fresh ID.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function instanceId(stateDirectory) {
  const file = path.join(stateDirectory, "telemetry.json");
  try {
    const { instanceId: id } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof id === "string" && UUID.test(id)) return id;
  } catch {}
  const id = crypto.randomUUID();
  try {
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ instanceId: id }, null, 2)}\n`, {
      mode: 0o600,
    });
  } catch {}
  return id;
}
