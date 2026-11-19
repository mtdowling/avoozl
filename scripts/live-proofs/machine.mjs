// Shared steps for the live proofs that run Avoozl as a machine of its own
// under a temporary HOME. Avoozl's modules are imported only when called, so
// a script sets XDG_CONFIG_HOME and XDG_STATE_HOME first.
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The machine's Avoozl folders, refused unless both are under `home`.
export async function isolatedMachine(home) {
  const { machineAvoozlPaths } = await import("../../src/app/host-config.mjs");
  const machine = machineAvoozlPaths();
  for (const dir of [machine.configDirectory, machine.stateDirectory])
    if (!dir.startsWith(home + path.sep)) throw Error(`Not isolated: ${dir}`);
  return machine;
}

// Write and approve a harness definition. With `unconfined`, a host with no
// sandbox runs it anyway (the fake agent only). Returns its hash.
export async function installHarness(
  configDirectory,
  name,
  bytes,
  { unconfined = false } = {},
) {
  const { approveHarnessDefinition, harnessDefinitionHash } = await import(
    "../../src/app/harness-definitions.mjs"
  );
  const dir = path.join(configDirectory, "harnesses");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), bytes);
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({ configDirectory, name, hash });
  const { sandboxKind } = await import("../../src/app/sandbox.mjs");
  if (unconfined && !sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ [name]: hash }),
    );
  return hash;
}

// Stop the proof's backend, its model proxy and the machine's supervisor.
export async function stopMachine({ root, backend, proxy, stateDirectory }) {
  fs.writeFileSync(path.join(root, "stop-backend"), "");
  await sleep(5000);
  backend.kill("SIGTERM");
  if (proxy) proxy.kill("SIGTERM");
  try {
    const { runningSupervisor } = await import("../../src/app/supervisor.mjs");
    const sup = runningSupervisor(stateDirectory, {});
    if (sup?.pid) process.kill(sup.pid, "SIGTERM");
  } catch {}
}
