// Entry point for the machine server (R95, design D4). `avoozl start` runs it
// detached; `avoozl start --foreground` and a login unit run it in place. A
// second one exits with code 1 and names the first, unless --foreground, which
// waits for the lock.
import fs from "node:fs";
import { parseArgs } from "node:util";
import { runSupervisor } from "./supervisor.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
    starter: { type: "string" },
    foreground: { type: "boolean" },
    // Where to write output when started with no stdout (Windows).
    log: { type: "string" },
  },
});
if (values.log) {
  const out = fs.openSync(values.log, "a", 0o600);
  for (const stream of [process.stdout, process.stderr])
    stream.write = (chunk, encoding, done) => {
      fs.writeSync(out, typeof chunk === "string" ? chunk : Buffer.from(chunk));
      if (typeof encoding === "function") encoding();
      else if (typeof done === "function") done();
      return true;
    };
}
await runSupervisor({
  stateDirectory: values["state-directory"],
  configDirectory: values["config-directory"],
  starter: values.starter,
  foreground: values.foreground,
});
