// Start the machine server when none runs, and never replace one (MS3.5).
// The server gets no gateway secret, so its children never inherit one.
import { machineAvoozlPaths } from "../../settings/host-config.mjs";
import { launchSupervisor, runningSupervisor } from "../supervisor.mjs";

// Returns { started: false } when a server already ran, else { started: true }.
export function ensureMachineServer({ env = process.env } = {}) {
  const { stateDirectory, configDirectory } = machineAvoozlPaths();
  if (runningSupervisor(stateDirectory)) return { started: false };
  const clean = { ...env };
  delete clean.KIROCREW_PROXY_SECRET;
  delete clean.KIROCREW_GATEWAY_ORIGIN_PROOF;
  launchSupervisor({
    stateDirectory,
    configDirectory,
    starter: "kirocrew",
    env: clean,
  });
  return { started: true };
}
