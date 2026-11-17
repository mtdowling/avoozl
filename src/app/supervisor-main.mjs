// Entry point for the machine's supervisor (R95, design §4.28). The app
// backend starts it detached; launchd or systemd may run it directly. A second
// one exits with code 1 and names the first.
import { parseArgs } from "node:util";
import { machineAvoozlPaths } from "./host-config.mjs";
import { startSupervisor } from "./supervisor.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
  },
});
const machine = machineAvoozlPaths();
let supervisor;
try {
  supervisor = startSupervisor({
    stateDirectory: values["state-directory"] ?? machine.stateDirectory,
    configDirectory: values["config-directory"] ?? machine.configDirectory,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Avoozl supervisor running as pid ${process.pid}.`);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.on(signal, () => {
    supervisor.close();
    process.exit(0);
  });
