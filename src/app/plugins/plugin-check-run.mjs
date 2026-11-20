// Running one plugin check (plugin-checks D4, D6, D13): the result cache
// first, then its run step or MCP step, held as outside code. The check
// runner (check-runs.mjs, verify.mjs runEach) calls this for each plugin
// entry; nothing here decides whether a check applies.
import { createHash } from "node:crypto";
import path from "node:path";
import { canonical } from "../store/store.mjs";
import { commandEvidence, git } from "../git/git.mjs";
import { isolatedCheck } from "../workspace/check-isolation.mjs";
import { checkResult, matchesPath } from "../delivery/verify.mjs";
import { markPluginBroken, pluginChanged } from "./plugin-checks.mjs";
import { listeningSockets } from "./plugins.mjs";
import { watchListeners } from "./child-io.mjs";
import { fillText, runMcpStep } from "./mcp-steps.mjs";

const CACHE = "check-cache";
const CACHE_LIMIT = 5000;
const CACHE_DAYS = 30;
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9._/-]{1,200}$/;

// The placeholder values a step may use, each shape checked (D4): a
// value that fails its shape is never put in a command.
export function fills({ commit, base, repo }) {
  const out = {};
  if (SHA.test(commit ?? "")) out.commit = commit;
  if (SHA.test(base ?? "")) out.base = base;
  if (REPO.test(repo ?? "")) out.repo = repo;
  return out;
}

const usesBase = (check) =>
  /\{(?:base|diff_path)\}/.test(
    JSON.stringify(check.step === "mcp" ? check.mcp : check.argv),
  );

// [path, blob] of each tracked file at `commit` the check's paths match
// (every tracked file without paths), sorted.
async function filesAt(root, commit, paths) {
  const out = await git(root, ["ls-tree", "-r", "-z", commit]);
  return out
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return [line.slice(tab + 1), line.slice(0, tab).split(" ")[2]];
    })
    .filter(([file]) => !paths || paths.some((glob) => matchesPath(glob, file)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// The content key (D6, PK5.2, PK10.10).
export async function contentKey(root, check, { commit, base }) {
  const parts = [
    check.plugin.id,
    check.plugin.version,
    check.plugin.hash,
    check.name,
    await filesAt(root, commit, check.paths),
    usesBase(check) && base ? await filesAt(root, base, check.paths) : null,
    check.step === "mcp"
      ? { step: check.mcp, mapping: check.mappingHash }
      : null,
  ];
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

const cacheEntries = (store) => {
  try {
    return store.list("flow_records").filter((r) => r.kind === CACHE);
  } catch {
    return [];
  }
};

export function cachedResult(store, key) {
  try {
    const hit = store.get("flow_records", `${CACHE}:${key}`);
    if (!hit) return null;
    if (Date.now() - Date.parse(hit.at) > CACHE_DAYS * 86400_000) return null;
    return hit;
  } catch {
    return null;
  }
}

// Store a passed or failed result (never a not-run one), first dropping
// entries older than 30 days and the oldest over 5,000 (PK5.5).
export function storeResult(
  store,
  key,
  { check, result, commit, now = Date.now() },
) {
  if (!Number.isInteger(result.exitCode) || result.notRun !== undefined) return;
  store.transaction(() => {
    const entries = cacheEntries(store).sort((a, b) =>
        a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
      ),
      old = now - CACHE_DAYS * 86400_000,
      kept = entries.filter((entry) => entry.id !== `${CACHE}:${key}`);
    let count = kept.length;
    for (const entry of kept)
      if (Date.parse(entry.at) < old || count >= CACHE_LIMIT) {
        store.remove("flow_records", entry.id);
        count--;
      }
    store.put("flow_records", {
      id: `${CACHE}:${key}`,
      kind: CACHE,
      key,
      check: check.name,
      plugin: check.plugin.id,
      result: {
        exitCode: result.exitCode,
        ...(result.tail ? { tail: result.tail } : {}),
        durationMs: result.durationMs ?? 0,
      },
      firstCommit: commit,
      at: new Date(now).toISOString(),
    });
  });
}

// A run step's argv: `run[0]` is the plugin's own file (a .mjs or .js runs
// with this Node), later items filled.
function runArgv(check, values) {
  const file = path.join(check.plugin.folder, check.argv[0]),
    rest = check.argv.slice(1).map((part) => fillText(part, values));
  return /\.(?:mjs|js)$/.test(file)
    ? [process.execPath, file, ...rest]
    : [file, ...rest];
}

async function runStep(check, context) {
  const {
    repository,
    dir,
    timeoutMs,
    run = commandEvidence,
    onBroken,
  } = context;
  let argv;
  try {
    argv = runArgv(check, fills(context));
  } catch (error) {
    return { exitCode: null, notRun: error.message };
  }
  let violation = null,
    stop = () => {},
    exited = false;
  const started = Date.now(),
    result = await run(dir, argv, {
      timeoutMs,
      env: check.env,
      isolate: (command, env) =>
        isolatedCheck(repository, dir, command, env, {
          network: check.network,
          readable: [check.plugin.folder],
        }),
      onChild: (child) => {
        if (!child?.pid) return;
        child.on("exit", () => {
          exited = true;
          stop();
        });
        stop = watchListeners(child.pid, {
          checkListeners: context.checkListeners ?? listeningSockets,
          gone: () => exited,
          onHit: (reason) => {
            violation = reason;
          },
        });
      },
    });
  stop();
  const elapsed = Date.now() - started;
  if (violation) {
    onBroken?.(violation);
    return {
      exitCode: 1,
      violation,
      durationMs: elapsed,
      tail: `stopped: ${violation}`,
    };
  }
  return checkResult(result, elapsed, timeoutMs, dir);
}

// One plugin check at `commit` in `dir` (a worktree there). `context`:
// {store, repository, root, dir, commit, base, repo, timeoutMs, fresh,
// pluginOptions, mcpId, onMcpId, run, checkListeners}. Returns its result
// entry: {name, command, plugin, exitCode, ...} with `cached` on a hit.
export async function runPluginCheck(check, context) {
  const base = {
      name: check.name,
      command: `plugin ${check.plugin.id}`,
      plugin: check.plugin.id,
      stage: check.stage,
    },
    changed = pluginChanged(check.plugin);
  if (changed) return { ...base, exitCode: null, notRun: changed };
  if (check.step === "mcp" && !check.mapping)
    return {
      ...base,
      exitCode: null,
      notRun: `map server ${check.mcp.server} of plugin ${check.plugin.id} on this machine`,
    };
  const { store } = context,
    root = context.root ?? context.repository?.root;
  let key = null;
  try {
    key = await contentKey(root, check, context);
  } catch {}
  if (key && !context.fresh && store) {
    const hit = cachedResult(store, key);
    if (hit)
      return {
        ...base,
        ...hit.result,
        durationMs: 0,
        cached: { firstCommit: hit.firstCommit, at: hit.at },
      };
  }
  const onBroken = (reason) =>
    markPluginBroken(context.pluginOptions, check.plugin.id, reason);
  const result =
    check.step === "mcp"
      ? await runMcpStep(check, {
          ...context,
          root,
          values: fills(context),
          onBroken,
        })
      : await runStep(check, { ...context, onBroken });
  if (key && store && !result.violation)
    storeResult(store, key, { check, result, commit: context.commit });
  return { ...base, ...result };
}
