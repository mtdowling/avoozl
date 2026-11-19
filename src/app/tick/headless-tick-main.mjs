// One headless tick pass (R95.3): the supervisor started with --tick runs
// this as its own process, so a slow or failing tick never stalls the
// children it watches. Prints one JSON line per workspace.
import { parseArgs } from "node:util";
import { tickCatalog } from "./headless-tick.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
  },
});
for (const result of await tickCatalog({
  stateDirectory: values["state-directory"],
  configDirectory: values["config-directory"],
}))
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
