// @ts-nocheck: typing debt
// Plugin update checks (design §4.8, Requirement 34.17). At most once a day
// per plugin, and when a person chooses Check now, Avoozl asks whether
// something newer than what this machine has exists: a git plugin's branch
// moved or a newer version tag exists (`git ls-remote`, names only), a
// package has a newer version on the registry (its dist-tags, never the
// package), or a local folder's files changed since the approval. It fetches,
// unpacks and installs nothing: a person's Update, review and approval stay
// the only way new code loads. The check runs on its own timer, never inside
// a tick, and `updateChecks: false` in this machine's plugins.json turns it
// off.
import fs from "node:fs";
import path from "node:path";
import { gitRemote, remoteRefs } from "./plugin-git.ts";
import {
  inspectPlugins,
  readPluginSettings,
  writePluginSettings,
} from "./plugins.ts";
import { fail } from "../store/store.ts";

const META = "pluginUpdates";
const DAY_MS = 24 * 3600 * 1000;
const PASS_MS = 3600 * 1000;
const FIRST_PASS_MS = 60 * 1000;
const TIMEOUT_MS = 15_000;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SEMVER =
  /^(v?)(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// Whether this machine checks for plugin updates: on unless plugins.json
// says `updateChecks: false`.
export const updateChecksOn = (settingsFile) =>
  readPluginSettings(settingsFile).updateChecks !== false;

// A person's switch for the check, kept in this machine's plugins.json.
export function setUpdateChecks(settingsFile, enabled) {
  if (typeof enabled !== "boolean") fail("enabled must be true or false.");
  const settings = readPluginSettings(settingsFile);
  if (enabled) delete settings.updateChecks;
  else settings.updateChecks = false;
  writePluginSettings(settingsFile, settings);
  return { enabled };
}

// {prefix, parts, pre} for a version or tag name, or null.
function parseVersion(text) {
  const match = SEMVER.exec(String(text));
  if (!match) return null;
  return {
    prefix: match[1],
    parts: [match[2], match[3], match[4]].map(Number),
    pre: match[5] ?? null,
  };
}

// Positive when `a` is newer than `b`. A release is newer than its own
// prerelease; prereleases compare as text.
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++)
    if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

// The newest release tag above `ref` with the same `v` prefix, or null.
// Prerelease tags are left out.
export function newerTag(ref, names) {
  const mine = parseVersion(ref);
  if (!mine) return null;
  let best = null;
  for (const name of names) {
    const version = parseVersion(name);
    if (!version || version.pre !== null || version.prefix !== mine.prefix)
      continue;
    if (compareVersions(version, mine) <= 0) continue;
    if (!best || compareVersions(version, best.version) > 0)
      best = { name, version };
  }
  return best?.name ?? null;
}

// The host a git remote reaches, or null for a local path.
export function remoteHost(remote) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) {
    try {
      const url = new URL(remote);
      return url.protocol === "file:" ? null : url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  const scp = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):/.exec(remote);
  return scp ? scp[1].toLowerCase() : null;
}

// A git plugin: one ls-remote. A branch reports its newest commit; a
// version tag reports a newer version tag, or that the tag itself moved.
async function checkGit(plugin, options, { countGit, scratch }) {
  const { entry } = plugin,
    current = plugin.commit;
  if (COMMIT.test(entry.ref))
    return { state: "current", kind: "commit", current, basis: current };
  const base =
    plugin.source === "repository"
      ? options.workspaceRoot
      : path.dirname(options.settingsFile);
  const remote = gitRemote(entry.git, base);
  fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const refs = await remoteRefs(remote, { scratch, timeout: TIMEOUT_MS });
  countGit?.(remote);
  const at = (name) => refs.get(`${name}^{}`) ?? refs.get(name);
  const result = { kind: "commit", current, basis: current };
  const named = entry.ref.startsWith("refs/")
    ? entry.ref
    : entry.ref === "HEAD"
      ? "HEAD"
      : null;
  const tag = named ? null : at(`refs/tags/${entry.ref}`);
  const branch = named ? at(named) : at(`refs/heads/${entry.ref}`);
  if (tag) {
    const tags = [...refs.keys()]
      .filter((name) => name.startsWith("refs/tags/") && !name.endsWith("^{}"))
      .map((name) => name.slice("refs/tags/".length));
    const newer = newerTag(entry.ref, tags);
    if (newer)
      return {
        ...result,
        state: "newer",
        kind: "tag",
        current: entry.ref,
        latest: newer,
        commit: at(`refs/tags/${newer}`),
      };
    if (tag !== current)
      return { ...result, state: "newer", latest: tag, moved: entry.ref };
    return { ...result, state: "current" };
  }
  if (!branch)
    return {
      ...result,
      state: "failed",
      reason: `No branch or tag named ${entry.ref} on the remote.`,
    };
  return branch === current
    ? { ...result, state: "current" }
    : { ...result, state: "newer", latest: branch };
}

// The registry Avoozl asks: npm's setting, or the public registry. A URL
// with a user name or password in it is refused, never sent.
function registryUrl(env) {
  const text = env.npm_config_registry || "https://registry.npmjs.org/";
  const url = new URL(text);
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("The npm registry must be an https URL.");
  if (url.username || url.password || url.search)
    throw Error(
      "The npm registry URL carries credentials; Avoozl does not send them.",
    );
  return url.href.replace(/\/$/, "");
}

// A package plugin: its installed version against the registry's `latest`
// dist-tag. One small request, with no credential; the package itself is
// never downloaded. shortcut: a private registry that needs a sign-in
// answers "couldn't check"; upgrade by reading npm's own auth when asked.
async function checkPackage(plugin, { fetchImpl, env }) {
  let installed;
  try {
    installed = JSON.parse(
      fs.readFileSync(path.join(plugin.location, "package.json"), "utf8"),
    ).version;
  } catch {
    installed = plugin.version;
  }
  const name = plugin.entry.package.replace("/", "%2f");
  const reply = await fetchImpl(
    `${registryUrl(env)}/-/package/${name}/dist-tags`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    },
  );
  if (!reply.ok) throw Error(`The registry answered ${reply.status}.`);
  const latest = (await reply.json())?.latest;
  const result = { kind: "version", current: installed, basis: installed };
  const a = parseVersion(latest),
    b = parseVersion(installed);
  if (!a || !b)
    return {
      ...result,
      state: "failed",
      reason: "The registry gave no version Avoozl can compare.",
    };
  return compareVersions(a, b) > 0
    ? { ...result, state: "newer", latest }
    : { ...result, state: "current" };
}

// A local folder: its content hash now against the approved one. No network.
function checkFolder(plugin) {
  const approved = plugin.approval?.hash;
  const result = { kind: "files", current: approved, basis: approved };
  return plugin.hash === approved
    ? { ...result, state: "current" }
    : { ...result, state: "newer", latest: plugin.hash };
}

// Which plugins a check covers: declared, readable and enabled, and, for a
// folder, approved (there is nothing to compare before).
const checkable = (plugin) =>
  !["invalid", "missing", "disabled"].includes(plugin.state) &&
  (plugin.entry.git !== undefined
    ? Boolean(plugin.commit)
    : plugin.entry.package !== undefined || Boolean(plugin.approval?.hash));

// What a plugin's check compares against now: a new pin, install or
// approval makes an older result stale.
const basisOf = (plugin) =>
  plugin.entry.git !== undefined
    ? plugin.commit
    : plugin.entry.package !== undefined
      ? plugin.version
      : plugin.approval?.hash;

const readUpdates = (store) => {
  try {
    return store.getMeta(META) || {};
  } catch {
    return {};
  }
};

// Check every plugin that is due (or those `ids` names, now), record each
// result, and return them. A failure is recorded quietly per plugin.
export async function checkPluginUpdates(
  store,
  options,
  {
    ids = null,
    force = false,
    now = Date.now,
    countGit = null,
    fetchImpl = globalThis.fetch,
    env = process.env,
  } = {},
) {
  const done = {};
  for (const plugin of inspectPlugins(options)) {
    if (!plugin.id || !checkable(plugin)) continue;
    if (ids && !ids.includes(plugin.id)) continue;
    const before = readUpdates(store)[plugin.id];
    if (
      !force &&
      before &&
      before.basis === basisOf(plugin) &&
      now() - Date.parse(before.checkedAt) < DAY_MS
    )
      continue;
    let result;
    try {
      result =
        plugin.entry.git !== undefined
          ? await checkGit(plugin, options, {
              countGit,
              scratch: path.join(
                path.dirname(options.settingsFile),
                "plugins",
                "git",
                ".check",
              ),
            })
          : plugin.entry.package !== undefined
            ? await checkPackage(plugin, { fetchImpl, env })
            : checkFolder(plugin);
    } catch (error) {
      result = {
        state: "failed",
        basis: basisOf(plugin),
        reason: String(error.message || error).slice(0, 300),
      };
    }
    done[plugin.id] = {
      ...result,
      checkedAt: new Date(now()).toISOString(),
    };
    try {
      store.setMeta(META, {
        ...readUpdates(store),
        [plugin.id]: done[plugin.id],
      });
    } catch {
      // A closed or read-only store only loses this result.
    }
  }
  return done;
}

// The result Settings shows for one plugin, or null when there is none or
// it was made against an older pin, install or approval.
export function updateFor(store, plugin) {
  const found = readUpdates(store)[plugin.id];
  if (!found || found.basis !== basisOf(plugin)) return null;
  return found;
}

// "v1.2.0 (was v1.0.0)", "new commit abc1234" or "files changed".
export function updateText(update) {
  if (update.kind === "tag" || update.kind === "version")
    return `${update.latest} (was ${update.current})`;
  if (update.kind === "files") return "files changed on disk";
  return `new commit ${String(update.latest).slice(0, 7)}${update.moved ? ` (${update.moved} moved)` : ""}`;
}

// One Needs you row per plugin with something newer.
export function updateNeedsYou(store, options) {
  if (!options?.settingsFile) return [];
  let plugins;
  try {
    if (!updateChecksOn(options.settingsFile)) return [];
    plugins = inspectPlugins(options);
  } catch {
    return [];
  }
  const items = [];
  for (const plugin of plugins) {
    if (!plugin.id || !checkable(plugin)) continue;
    const update = updateFor(store, plugin);
    if (update?.state !== "newer") continue;
    const how =
      plugin.entry.git !== undefined
        ? `Choose Update from ${plugin.entry.ref} in Settings › Plugins, then review and approve it.`
        : plugin.entry.package !== undefined
          ? `Install ${plugin.entry.package}@${update.latest} into this machine's plugin folder, then review and approve it in Settings › Plugins.`
          : "Review and approve it in Settings › Plugins.";
    items.push({
      kind: "needs-human",
      reason: "plugin-update",
      id: `plugin-update:${plugin.id}`,
      taskId: null,
      authority: "local",
      title: `Update available for plugin ${plugin.id}: ${updateText(update)}`,
      detail: `${how} Nothing new loads until you approve.`,
      openedAt: update.checkedAt,
    });
  }
  return items;
}

// The daily check's timer, one per store: a first pass a minute after the
// first tick, then a pass every hour that checks only plugins due. Never
// awaited by the tick, and never throws.
const handles = new WeakMap();
export function startPluginUpdateChecks(store, options, extra = {}) {
  if (!options?.workspaceRoot || !options.settingsFile) return null;
  const known = handles.get(store);
  if (known) return known;
  let running = false;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      if (updateChecksOn(options.settingsFile))
        await checkPluginUpdates(store, options, extra);
    } catch {
      // The next pass tries again.
    } finally {
      running = false;
    }
  };
  const first = setTimeout(pass, FIRST_PASS_MS);
  first.unref();
  const timer = setInterval(pass, PASS_MS);
  timer.unref();
  const handle = {
    pass,
    stop() {
      clearTimeout(first);
      clearInterval(timer);
      handles.delete(store);
    },
  };
  handles.set(store, handle);
  return handle;
}
