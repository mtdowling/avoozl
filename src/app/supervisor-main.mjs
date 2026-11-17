// Entry point for the machine's supervisor (R95, design §4.28). The app
// backend starts it detached; launchd or systemd may run it directly. A second
// one exits with code 1 and names the first.
import { parseArgs } from "node:util";
import { runSupervisor } from "./supervisor.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
  },
});
runSupervisor({
  stateDirectory: values["state-directory"],
  configDirectory: values["config-directory"],
});
