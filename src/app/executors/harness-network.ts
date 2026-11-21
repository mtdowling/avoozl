// What a confined child of one definition gets to reach its model (MS5.5):
// short-lived AWS keys from its `credentialExport`, run here, outside the
// sandbox, so the child needs no credential helper, profile or sign-in
// cookie; its fixed `setEnv`; and its own egress proxy, the one port its
// sandbox opens. No value is logged.
import { spawnSync } from "node:child_process";
import { EXPORTED_AWS_KEYS } from "./harness-definitions.ts";
import { findProgram } from "./harness-ready.ts";
import { egressEnv, startEgressProxy } from "./egress-proxy.ts";

const PROFILE_NAMES = ["AWS_PROFILE", "AWS_DEFAULT_PROFILE"];

type NetworkDefinition = {
  name: string;
  credentialExport?: readonly string[];
  egress?: readonly string[];
  setEnv?: Readonly<Record<string, string>>;
};

// Run the export and read its credential_process JSON ({AccessKeyId, ...},
// at the top or under Credentials). A failure names the exit, never output.
function exportCredentials(
  definition: NetworkDefinition,
  {
    env,
    machineEnv,
  }: { env: NodeJS.ProcessEnv; machineEnv: Record<string, string | undefined> },
): Record<string, string> {
  const command = definition.credentialExport;
  if (!command) return {};
  const found = findProgram(command[0], { env, machineEnv });
  if (found.problem !== undefined) throw Error(found.problem);
  const run = spawnSync(found.file, command.slice(1), {
    env: { ...env, ...(found.path ? { PATH: found.path } : {}) },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 60_000,
    windowsHide: true,
  });
  let keys: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(run.stdout ?? "");
    keys = value?.Credentials ?? value;
  } catch {}
  const values = [keys?.AccessKeyId, keys?.SecretAccessKey, keys?.SessionToken];
  if (
    run.status !== 0 ||
    !values.slice(0, 2).every((v) => typeof v === "string" && v)
  )
    throw Error(
      `${definition.name}'s credentialExport (${command.join(" ")}) ${run.status === 0 ? "printed no AccessKeyId and SecretAccessKey" : `exited ${run.status ?? run.signal}`}. Sign in for it in your shell, then try again.`,
    );
  return Object.fromEntries(
    EXPORTED_AWS_KEYS.map((key, index) => [key, values[index]]).filter(
      ([, value]) => typeof value === "string" && value,
    ),
  ) as Record<string, string>;
}

// The child's extra environment, the names its sandbox must keep, and the
// loopback ports it may reach. The proxy, when there is one, ends when
// `exitFile` appears; stop it sooner with stopEgressProxy(proxy.pid).
export function harnessNetwork(
  definition: NetworkDefinition,
  {
    env,
    machineEnv,
    folder,
    exitFile,
  }: {
    env: NodeJS.ProcessEnv;
    machineEnv: Record<string, string | undefined>;
    folder: string;
    exitFile: string;
  },
) {
  const credentials = exportCredentials(definition, { env, machineEnv });
  const proxy = definition.egress
    ? startEgressProxy({ hosts: definition.egress, folder, exitFile, env })
    : null;
  const childEnv: Record<string, string | undefined> = {
    ...(definition.setEnv ?? {}),
    ...credentials,
    ...(proxy ? egressEnv(proxy.port) : {}),
  };
  return {
    env: childEnv,
    keep: Object.keys(credentials),
    // A named profile makes the AWS SDKs skip keys in the environment, so
    // exported keys go without one: they are that profile's.
    unset: Object.keys(credentials).length ? PROFILE_NAMES : [],
    ports: proxy ? [`localhost:${proxy.port}`] : [],
    proxy,
  };
}
