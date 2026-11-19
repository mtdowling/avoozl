// `avoozl worker setup` (Requirement 90.7-90.8, design §4.32.8, task 43.6):
// a preview of what this worker machine can do, before it pulls anything.
// It reads only and writes nothing.
//
// It shows the GitHub login, whether each pool's target is readable, which
// registered source repositories (this machine's forks) the login can push
// to, what the login may do in each spec's canonical grant repository, and
// whether the configured executor can run here. Kiro Crew is required only
// for the `kirocrew` executor; a `process` worker is headless. An SSH
// envelope stays for a machine with no GitHub access (runner mode).
// shortcut: the process harness binary is not looked for, only named; check
// it when a headless worker is first started.
import { gatewayClient } from "./gateway-client.mjs";

const READ = new Set(["read", "triage", "write", "maintain", "admin"]);
const WRITE = new Set(["write", "maintain", "admin"]);
const lower = (value) => String(value).toLowerCase();

export async function previewWorker({
  config,
  github,
  env = process.env,
  gateway = gatewayClient,
}) {
  const problems = [],
    executor = config.executor,
    kirocrew = executor === "kirocrew",
    ready = kirocrew ? Boolean(gateway(env)) : true,
    result = {
      role: "worker",
      transport: "github",
      login: null,
      executor: {
        name: executor,
        kirocrewRequired: kirocrew,
        ready,
      },
      targets: [],
      sources: [],
      grants: [],
      problems,
    };
  if (!ready)
    problems.push(
      "The kirocrew executor needs Kiro Crew, which is not reachable here.",
    );
  if (!config.pools.length) problems.push("No pool names a spec to pull from.");
  if (!github?.available?.()) {
    problems.push(
      "No GitHub access here. A worker machine needs GitHub; this machine can run its own workspace.",
    );
    return { ...result, ok: false };
  }
  result.login = (await github.currentUser())?.login ?? null;
  if (!result.login) {
    problems.push("GitHub did not name this machine's login.");
    return { ...result, ok: false };
  }
  const role = async (repository) =>
    String(
      (await github.permission(repository, result.login))?.permission ?? "none",
    );
  const targets = [...new Set(config.pools.map((pool) => pool.target))];
  for (const repository of targets) {
    const found = await role(repository);
    result.targets.push({ repository, role: found, readable: READ.has(found) });
    if (!READ.has(found))
      problems.push(`${repository} is not readable by ${result.login}.`);
  }
  for (const repository of Object.keys(config.sources)) {
    if (targets.some((target) => lower(target) === lower(repository))) continue;
    const found = await role(repository);
    result.sources.push({ repository, role: found, push: WRITE.has(found) });
  }
  // A checkpoint goes to a repository this login can push to: a registered
  // fork, or the target itself.
  const pushable =
    result.sources.some((source) => source.push) ||
    result.targets.some((target) => WRITE.has(target.role));
  if (!pushable)
    problems.push(
      "This login can push to no registered source or target, so it cannot publish checkpoints.",
    );
  for (const pool of config.pools) {
    const found = await role(pool.grants),
      mode = WRITE.has(found)
        ? "reserve"
        : READ.has(found)
          ? "request"
          : "none";
    result.grants.push({
      spec: pool.spec,
      repository: pool.grants,
      role: found,
      mode,
    });
    if (mode === "none")
      problems.push(
        `${pool.grants} (grants for ${pool.spec}) is not readable.`,
      );
  }
  return { ...result, ok: problems.length === 0 };
}
