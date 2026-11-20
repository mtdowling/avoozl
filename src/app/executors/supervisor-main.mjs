// Entry point for the machine server (R95, design D4). `avoozl start` runs it
// detached; `avoozl start --foreground` and a login unit run it in place. A
// second one exits with code 1 and names the first, unless --foreground, which
// waits for the lock.
import { parseArgs } from "node:util";
import { runSupervisor } from "./supervisor.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
    starter: { type: "string" },
    foreground: { type: "boolean" },
  },
});
await runSupervisor({
  stateDirectory: values["state-directory"],
  configDirectory: values["config-directory"],
  starter: values.starter,
  foreground: values.foreground,
});
