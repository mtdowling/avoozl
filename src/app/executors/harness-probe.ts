// A harness's sign-in check (MS5.3): run its `probe` argv once with the
// home, environment and sandbox a worker gets, and keep the answer per
// definition hash and machine.env. Each run is a model call, so nothing
// reads it on a page load or a tick: a person asks for it (Check again).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { redact } from "../github/github-credentials.mjs";
import { withoutPushCredentials } from "../git/git.mjs";
import {
  harnessReads,
  harnessSecretReads,
  loadHarnessDefinition,
  seedHarnessHome,
} from "./harness-definitions.mjs";
import { findProgram, recordProbe } from "./harness-ready.mjs";
import { harnessNetwork } from "./harness-network.ts";
import { stopEgressProxy } from "./egress-proxy.ts";
import { readMachineEnv, withKeptValues } from "./machine-env.mjs";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxKind,
  sandboxNetwork,
  sandboxSecretPaths,
} from "./sandbox.mjs";
import { GIT_USER_CONFIG } from "./supervisor.mjs";

const PROBE_TIMEOUT_MS = 120_000;
const LONG_VALUE = /[A-Za-z0-9+/=_-]{32,}/g;

type ProbeResult = { ok: boolean; message: string | null; at: string };
// The parts of a loaded definition the probe reads.
type Definition = {
  name: string;
  hash: string;
  probe?: readonly string[];
  home?: string;
  keepEnv?: readonly string[];
  tmpEnv?: readonly string[];
  egress?: readonly string[];
  credentialExport?: readonly string[];
  setEnv?: Readonly<Record<string, string>>;
};
// The hosts the probe's egress proxy refused, from its log of host names.
const refusedHosts = (folder: string) => {
  try {
    const lines = fs.readFileSync(path.join(folder, "egress.log"), "utf8");
    return [...new Set([...lines.matchAll(/ deny (S+)/g)].map((m) => m[1]))];
  } catch {
    return [];
  }
};
// The sandbox's JavaScript signatures, typed loosely from their defaults.
const confine = confineChild as unknown as (
  argv: string[],
  options: Record<string, unknown>,
) => { argv: string[]; env: NodeJS.ProcessEnv };
const secretPaths = sandboxSecretPaths as unknown as (
  options: Record<string, unknown>,
) => string[];

// The end of the harness's own output, cut and with every value it was
// given, and anything shaped like a credential, taken out.
export function probeError(text: string, values: string[]): string {
  let out = String(text ?? "");
  for (const value of values)
    if (value && value.length >= 4) out = out.split(value).join("[redacted]");
  out = out.replace(LONG_VALUE, "[redacted]").replace(/\s+/g, " ").trim();
  return redact(out.length > 300 ? `…${out.slice(-300)}` : out, 320);
}

const fixLine = (name: string) =>
  `Check that ${name} is signed in for this machine's server (the names in its keepEnv, machine.env, and the folders its reads list for a credential helper), then Check again.`;

// Probe harness `name`, record the answer and return it. `kind` and `env`
// are the sandbox and server environment, for tests.
export function probeHarness({
  configDirectory,
  stateDirectory,
  catalogPath = path.join(stateDirectory, "catalog.sqlite"),
  name,
  env = process.env,
  kind = sandboxKind(),
}: {
  configDirectory: string;
  stateDirectory: string;
  catalogPath?: string;
  name: string;
  env?: NodeJS.ProcessEnv;
  kind?: string | null;
}): ProbeResult & { name: string } {
  const definition = loadHarnessDefinition({
    configDirectory,
    name,
  }) as Definition;
  if (!definition.probe)
    throw Error(
      `Harness ${name} names no probe, so its sign-in cannot be checked.`,
    );
  const finish = (ok: boolean, message: string | null) => {
    const result = { ok, message, at: new Date().toISOString() };
    recordProbe(configDirectory, name, definition.hash, result);
    return { name, ...result };
  };
  const machineEnv = readMachineEnv(configDirectory);
  const found = findProgram(definition.probe[0], { env, machineEnv });
  if (found.problem) return finish(false, found.problem);
  const home = env.HOME || os.homedir();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-probe-"));
  let proxyPid: number | undefined;
  try {
    const work = path.join(folder, "work"),
      tmp = path.join(folder, "tmp"),
      harnessHome = path.join(folder, "home");
    for (const dir of [work, tmp, harnessHome])
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // A fresh home seeded as a lane's is, so the probe sees what a worker
    // sees.
    if (definition.home) seedHarnessHome(definition, harnessHome, home);
    let reach;
    try {
      reach = harnessNetwork(definition, {
        env,
        machineEnv,
        folder,
        exitFile: path.join(folder, "exit"),
      });
    } catch (error) {
      return finish(false, (error as Error).message);
    }
    proxyPid = reach.proxy?.pid;
    const childEnv: NodeJS.ProcessEnv = withoutPushCredentials({
      ...withKeptValues(env, definition.keepEnv ?? [], machineEnv),
      ...(found.path ? { PATH: found.path } : {}),
      ...Object.fromEntries(
        ["TMPDIR", ...(definition.tmpEnv ?? [])].map((key) => [key, tmp]),
      ),
      ...(definition.home ? { [definition.home]: harnessHome } : {}),
      ...reach.env,
      AVOOZL_CHILD: "1",
    });
    for (const key of reach.unset) delete childEnv[key];
    let confined;
    try {
      confined = confine([found.file, ...definition.probe.slice(1)], {
        definition,
        configDirectory,
        writeRoots: [work, tmp, harnessHome],
        secrets: secretPaths({
          home,
          env,
          configDirectory,
          stateDirectory,
          workspaceRoots: catalogWorkspaceRoots(catalogPath),
        }),
        readable: harnessSecretReads(definition, home),
        home,
        readRoots: [
          folder,
          ...harnessReads(definition, home),
          ...GIT_USER_CONFIG.map((file: string) => path.join(home, file)),
        ],
        keepEnv: [...(definition.keepEnv ?? []), ...reach.keep],
        network: sandboxNetwork(reach.ports.length ? reach.ports : undefined),
        env: childEnv,
        kind,
      });
    } catch (error) {
      return finish(false, (error as Error).message);
    }
    const run = spawnSync(confined.argv[0], confined.argv.slice(1), {
      cwd: work,
      env: confined.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    if (run.status === 0) return finish(true, null);
    const values = [
      ...(definition.keepEnv ?? []).map((key: string) => childEnv[key] ?? ""),
      ...Object.values(reach.env).map(String),
      ...Object.values(machineEnv).map(String),
    ];
    const said =
      probeError(`${run.stderr ?? ""}\n${run.stdout ?? ""}`, values) ||
      (run.error
        ? `it did not finish (${(run.error as NodeJS.ErrnoException).code ?? "error"})`
        : `it exited ${run.status ?? run.signal}`);
    const refused = refusedHosts(folder);
    return finish(
      false,
      `${name} failed its sign-in check: ${said}${refused.length ? ` Its egress proxy refused ${refused.join(", ")}; add the ones it needs to egress.` : ""} ${fixLine(name)}`,
    );
  } finally {
    stopEgressProxy(proxyPid);
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
