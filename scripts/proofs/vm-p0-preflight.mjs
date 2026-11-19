// vm-p0, first part: the contained-session preflight (vm-harness D5) on the
// person's own Claude Code sign-in, run from a terminal outside Kiro Crew so
// macOS's sandbox-exec works. It sets up no sign-in: it copies
// examples/harnesses/claude-code.json into a throwaway Avoozl config folder,
// approves it there, uses a throwaway state folder, runs every preflight step
// (one short model turn on the plan login), and prints each step, the box's
// commands, the egress proxy log and the TCP listeners seen while the CLI
// ran.
//
//   node scripts/proofs/vm-p0-preflight.mjs [IMAGE]
//
// IMAGE defaults to docker.io/library/bash:5. Nothing is written outside a
// new folder in the temp folder, which it prints and leaves for the receipt.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBoxPreflight } from "../../src/app/executors/box-preflight.mjs";
import { startEgressProxy } from "../../src/app/executors/egress-proxy.mjs";
import {
  approveHarnessByName,
  loadHarnessDefinition,
} from "../../src/app/executors/harness-definitions.mjs";
import { fileURLToPath } from "node:url";
import { launchPreflight } from "../../src/app/executors/supervisor.mjs";
import { pickRuntime } from "../../src/app/workspace/check-isolation.mjs";
import { readJsonLines } from "../../src/app/executors/egress-proxy.mjs";

const image = process.argv[2] ?? "docker.io/library/bash:5";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-vm-p0-")),
  configDirectory = path.join(scratch, "config"),
  stateDirectory = path.join(scratch, "state");
fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
fs.copyFileSync(
  fileURLToPath(
    new URL("../../examples/harnesses/claude-code.json", import.meta.url),
  ),
  path.join(configDirectory, "harnesses", "claude-code.json"),
);
approveHarnessByName({ configDirectory, name: "claude-code" });
const definition = loadHarnessDefinition({
  configDirectory,
  name: "claude-code",
});
if (!definition.box) {
  console.error(
    `The approved claude-code harness in ${configDirectory} has no box key. Copy it from examples/harnesses/claude-code.json and approve it again with: avoozl harness approve claude-code`,
  );
  process.exit(1);
}
const picked = pickRuntime({ purpose: "box" });
if (!picked.runtime) {
  console.error(picked.refused);
  process.exit(1);
}
const listeners = [];
const listen = () => {
  try {
    listeners.push(
      execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
        encoding: "utf8",
      }),
    );
  } catch {}
};
const before = (() => {
  try {
    return execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
  } catch {
    return "";
  }
})();
let opened = null;
const result = await runBoxPreflight(
  {
    runtime: picked.runtime,
    image,
    hosts: definition.box.hosts ?? [],
    stateDirectory,
    tmpEnv: definition.tmpEnv ?? [],
  },
  {
    startProxy: startEgressProxy,
    launch: (input) => {
      opened = input.opened;
      const timer = setInterval(listen, 2000);
      return launchPreflight(
        {
          session: `process-${crypto.randomUUID()}`,
          definition,
          runtime: picked.runtime,
          configDirectory,
          stateDirectory,
        },
        input,
      ).finally(() => clearInterval(timer));
    },
  },
);
console.log(
  `runtime: ${picked.runtime}, image: ${image}, harness hash: ${definition.hash}`,
);
for (const step of result.steps)
  console.log(`${step.passed ? "pass" : "FAIL"}  ${step.name}: ${step.output}`);
if (opened) {
  console.log("\nCommands box exec ran:");
  for (const entry of readJsonLines(opened.folders.brokerLog))
    console.log(`  exit ${entry.code}: ${entry.command.slice(-120)}`);
  console.log("\nEgress proxy log:");
  for (const entry of readJsonLines(opened.folders.egressLog))
    console.log(`  ${JSON.stringify(entry)}`);
}
const seen = new Set(before.split("\n"));
const added = [
  ...new Set(listeners.flatMap((text) => text.split("\n"))),
].filter((line) => line && !seen.has(line));
console.log("\nTCP listeners new while the CLI ran:");
for (const line of added) console.log(`  ${line}`);
console.log(`\nFolder kept for the receipt: ${scratch}`);
console.log(
  "Afterwards run `claude` once by hand to check you are still signed in.",
);
process.exit(result.passed ? 0 : 1);
