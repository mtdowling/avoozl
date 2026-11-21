// The sign-in probe (MS5.3): run once in the worker's sandbox, its answer
// cached per definition hash and machine.env, its failure shown redacted.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
  listHarnessDefinitions,
  parseHarnessDefinition,
} from "../harness-definitions.ts";
import { cachedProbe } from "../harness-ready.ts";
import { probeError, probeHarness } from "../harness-probe.ts";
import { sandboxKind } from "../sandbox.ts";
import { scratchRoot } from "./process-machine.ts";

// A fake CLI: prints the kept names it sees and whether its seeded home
// holds settings.json, then exits with FAKE_EXIT.
const PROBE = `
const seen = ["AWS_PROFILE", "MODEL_KEY", "OTHER_API_KEY"].filter((n) => process.env[n]);
const fs = await import("node:fs");
const seeded = fs.existsSync(process.env.FAKE_HOME + "/settings.json");
console.error("kept:" + seen.join(",") + " seeded:" + seeded + " value:" + (process.env.MODEL_KEY ?? ""));
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`;

function install(root: string, configDirectory: string, extra = {}) {
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const script = path.join(root, "probe.mjs");
  fs.writeFileSync(script, PROBE);
  const bytes = Buffer.from(
    JSON.stringify({
      name: "fake-cli",
      start: ["node", "start"],
      resume: ["node", "resume"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}"],
      keepEnv: ["AWS_PROFILE", "MODEL_KEY", "FAKE_EXIT"],
      home: "FAKE_HOME",
      homeFiles: ["~/.fake/settings.json"],
      probe: ["node", script],
      ...extra,
    }),
  );
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  const hash = harnessDefinitionHash(bytes);
  approveHarnessDefinition({ configDirectory, name: "fake-cli", hash });
  if (!sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ "fake-cli": hash }),
    );
  return hash;
}

function machine(t: test.TestContext) {
  const { root } = scratchRoot(t, "avoozl-probe-test-");
  const configDirectory = path.join(root, "config");
  const stateDirectory = path.join(root, "state");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(home, ".fake"), { recursive: true });
  fs.writeFileSync(path.join(home, ".fake", "settings.json"), "{}");
  const hash = install(root, configDirectory);
  const env = {
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
    HOME: home,
    AWS_PROFILE: "work",
    OTHER_API_KEY: "x",
  };
  const run = (extra = {}) =>
    probeHarness({
      configDirectory,
      stateDirectory,
      name: "fake-cli",
      env: { ...env, ...extra },
    });
  return { root, configDirectory, hash, run };
}

test("no key set but the probe passes: the harness can start", (t) => {
  const { configDirectory, run } = machine(t);
  assert.equal(listHarnessDefinitions(configDirectory)[0].probe, null);
  const done = run();
  assert.equal(done.ok, true, String(done.message));
  const [listed] = listHarnessDefinitions(configDirectory);
  assert.equal(listed.startProblem, null);
  assert.equal(listed.probe?.ok, true);
  assert.equal(listed.probes, true);
});

test("a failed probe is the start problem: the CLI's own words, redacted, and a fix", (t) => {
  const { configDirectory, run } = machine(t);
  const done = run({ FAKE_EXIT: "3", MODEL_KEY: "sk-very-private-value" });
  assert.equal(done.ok, false);
  const [listed] = listHarnessDefinitions(configDirectory);
  assert.equal(listed.startProblem, done.message);
  assert.match(String(done.message), /^fake-cli failed its sign-in check: /);
  assert.match(String(done.message), /Check again\.$/);
  // The keepEnv names reach the child, the rest do not, and the home holds
  // the copied settings.json.
  assert.match(String(done.message), /kept:AWS_PROFILE,MODEL_KEY seeded:true/);
  assert.doesNotMatch(String(done.message), /sk-very-private-value/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(configDirectory, "harness-probes.json"), "utf8"),
    /sk-very-private-value/,
  );
});

test("the answer is cached per definition hash and machine.env", (t) => {
  const { root, configDirectory, hash, run } = machine(t);
  run();
  assert.equal(cachedProbe(configDirectory, "fake-cli", hash)?.ok, true);
  // machine.env changes: the answer no longer holds.
  fs.writeFileSync(path.join(configDirectory, "machine.env"), "MODEL_KEY=1\n", {
    mode: 0o600,
  });
  assert.equal(cachedProbe(configDirectory, "fake-cli", hash), null);
  run();
  // The definition changes: neither does it.
  const changed = install(root, configDirectory, { tmpEnv: ["FAKE_TMP"] });
  assert.notEqual(changed, hash);
  assert.equal(cachedProbe(configDirectory, "fake-cli", changed), null);
  assert.equal(listHarnessDefinitions(configDirectory)[0].probe, null);
});

test("probe output keeps no given value and nothing shaped like a key", () => {
  const said = probeError(
    "error: token abcdefghijklmnopqrstuvwxyz0123456789ABCD for profile work-profile",
    ["work-profile"],
  );
  assert.doesNotMatch(said, /abcdefghijklmnop|work-profile/);
  assert.match(said, /\[redacted\]/);
});

test("a definition's probe takes no placeholders and homeFiles copies no credential", () => {
  const base = {
    name: "x",
    start: ["x"],
    resume: ["x"],
    permission: { write: "a", read: "b" },
    home: "X_HOME",
  };
  assert.throws(
    () => parseHarnessDefinition({ ...base, probe: ["x", "{worktree}"] }),
    /probe takes no placeholders/,
  );
  for (const file of ["~/.aws/credentials", "~/.codex/auth.json", "~/.ssh/id"])
    assert.throws(
      () => parseHarnessDefinition({ ...base, homeFiles: [file] }),
      /homeFiles must be config files/,
    );
  const { home, ...homeless } = base;
  assert.ok(home);
  assert.throws(
    () => parseHarnessDefinition({ ...homeless, homeFiles: ["~/.x/a.json"] }),
    /homeFiles needs home/,
  );
});
