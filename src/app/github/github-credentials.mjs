// Who signs Avoozl in to GitHub (plugin-credentials §D3, §D4, §D8). For each
// owner on a host: the credentials plugin that claims it, else `env`
// (AVOOZL_GITHUB_TOKEN), else `gh`. An owner a plugin claims never falls
// back to `env` or `gh`. Tokens live in this process's memory only: never
// on disk, in the store, a log, an error or a child's environment.
import { execFile } from "node:child_process";
import path from "node:path";
import { checkReply } from "../plugins/plugin-contract.mjs";
import { recordActivity } from "../store/activity-log.mjs";
import { fail } from "../store/store.mjs";
import {
  PluginProcess,
  SECRET_VALUE,
  contentHash,
  inspectPlugins,
  listeningSockets,
  pluginSettingsPath,
  readPluginSettings,
  writePluginSettings,
} from "../plugins/plugins.mjs";
import { jobOf, permissionText } from "./github-jobs.mjs";
export { tokenTransportAllowed } from "./github-jobs.mjs";

const CALL_TIMEOUT_MS = 20_000;
const GH_TIMEOUT_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;
const EARLY_MS = 5 * 60 * 1000;
const REHASH_MS = 10 * 60 * 1000;
const RESTART_MS = 60 * 1000;
const MAX_REASON = 500;
export const BUILT_IN = ["env", "gh"];

// The GitHub host Avoozl talks to: github.com for api.github.com, else the
// host (and port) of AVOOZL_GIT_URL or GITHUB_API_URL.
export function githubHost(apiUrl, gitUrl) {
  if (/^https:\/\/api\.github\.com\/?$/.test(apiUrl || "")) return "github.com";
  try {
    return new URL(gitUrl || apiUrl).host.toLowerCase();
  } catch {
    return "github.com";
  }
}

export class CredentialError extends Error {
  constructor(message, { status = 503, key = null, provider = null } = {}) {
    super(message);
    this.status = status;
    this.credentials = { key, provider };
  }
}

// Every token held, and every credential-looking value, becomes [redacted];
// then the text is cut to 500 characters (PC11.4).
const held = new Set();
export function redact(text, max = MAX_REASON) {
  let value = String(text ?? "");
  for (const token of held)
    if (token) value = value.split(token).join("[redacted]");
  for (const pattern of SECRET_VALUE)
    value = value.replace(new RegExp(pattern.source, "g"), "[redacted]");
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

const lower = (value) => String(value || "").toLowerCase();

// The plugins that claim `owner` on `host` (D3 step 1), from this machine's
// plugins.json. A plugin with no approval here claims nothing; a disabled
// one neither. A changed, missing or broken one still claims.
export function claimsFor(plugins, host, owner) {
  const wanted = lower(owner);
  return plugins.filter((plugin) => {
    if (plugin.source !== "machine" || plugin.state === "disabled")
      return false;
    if (!plugin.approval && plugin.state !== "approved") return false;
    const claim = plugin.credentials ?? plugin.approval?.credentials;
    if (
      !claim ||
      !(plugin.provides ?? plugin.approval?.provides ?? []).includes(
        "credentials",
      )
    )
      return false;
    if (!claim.hosts?.includes(host)) return false;
    return !claim.owners || claim.owners.some((name) => lower(name) === wanted);
  });
}

// The reasons credentials plugins cannot be used, such as one declared in
// .avoozl.json (PC2.2), for `avoozl check`.
export function credentialsProblems(options) {
  return inspectPlugins(options)
    .filter(
      (plugin) =>
        plugin.state === "invalid" && plugin.provides?.includes("credentials"),
    )
    .map((plugin) => plugin.reason);
}

// Settings › Plugins **Use this one** (PC2.5, PC2.6): which credentials
// plugin serves `host` where two or more claim one owner. A person's act.
export function pickCredentials(options, { host, id } = {}) {
  if (typeof host !== "string" || !host) fail("Name the host.");
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  const claim = plugin.credentials ?? plugin.approval?.credentials;
  if (!claim?.hosts?.includes(host))
    fail(`Plugin ${id} does not sign Avoozl in to ${host}.`, 409);
  const settings = readPluginSettings(options.settingsFile);
  settings.credentialsPick = {
    ...(settings.credentialsPick || {}),
    [host]: id,
  };
  writePluginSettings(options.settingsFile, settings);
  return { host, id };
}

// The provider for one owner (D3): {provider, plugin} or {refusal}.
export function chooseProvider({ plugins, settings, host, owner, env }) {
  const claims = owner ? claimsFor(plugins, host, owner) : [];
  if (claims.length > 1) {
    const picked = settings.credentialsPick?.[host];
    const plugin = claims.find((p) => p.id === picked);
    if (!plugin)
      return {
        refusal: `${claims.map((p) => p.id).join(" and ")} both claim ${owner} on ${host}. Pick one in Settings › Plugins.`,
        clash: claims.map((p) => p.id),
        provider: null,
      };
    return usable(plugin, owner);
  }
  if (claims.length === 1) return usable(claims[0], owner);
  return { provider: env.AVOOZL_GITHUB_TOKEN?.trim() ? "env" : "gh" };
}

function usable(plugin, owner) {
  if (plugin.state === "approved") return { provider: plugin.id, plugin };
  return {
    provider: plugin.id,
    refusal: `Approve ${plugin.id} again; GitHub work for ${owner} waits. (${plugin.reason || plugin.state})`,
  };
}

// The token's login, from GitHub's GET /user (built-in providers, PC3.4).
async function userLogin(fetchImpl, apiUrl, token) {
  let response;
  try {
    response = await fetchImpl(new URL(apiUrl.replace(/\/$/, "") + "/user"), {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "User-Agent": "avoozl",
      },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CredentialError(`GitHub is unreachable: ${error.message}`);
  }
  if (response.status === 401)
    throw new CredentialError("GitHub refused the token (401).");
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return typeof body?.login === "string" ? body.login : null;
}

const SIGN_IN = "Run `gh auth login`, or set AVOOZL_GITHUB_TOKEN.";

// `ghCommand` is "gh", or [program, ...arguments] that stands in for it.
function ghToken(host, { env, ghCommand }) {
  const [program, ...first] = [].concat(ghCommand);
  return new Promise((resolve, reject) =>
    execFile(
      program,
      [...first, "auth", "token", "--hostname", host],
      { encoding: "utf8", timeout: GH_TIMEOUT_MS, env, windowsHide: true },
      (error, stdout) => {
        const token = String(stdout || "").trim();
        if (error || !token) reject(new CredentialError(SIGN_IN));
        else resolve(token);
      },
    ),
  );
}

// The credentials child of one plugin, kept for this process's life (D4).
class CredentialChild {
  constructor(plugin, { timeoutMs, checkListeners, guard }) {
    this.plugin = plugin;
    this.timeoutMs = timeoutMs;
    this.checkListeners = checkListeners;
    this.guard = guard;
    this.process = null;
    this.hashedAt = 0;
    this.startedAt = 0;
  }
  same(plugin) {
    return plugin.hash === this.plugin.hash && plugin.state === "approved";
  }
  async call(params) {
    const plugin = this.plugin;
    if (
      plugin.entry.git === undefined &&
      Date.now() - this.hashedAt > REHASH_MS
    ) {
      let now;
      try {
        now = contentHash(plugin.location);
      } catch (error) {
        this.stop();
        throw new CredentialError(
          `${plugin.id} cannot be read: ${error.message}`,
        );
      }
      if (now !== plugin.hash) {
        this.stop();
        throw new CredentialError(
          `${plugin.id} changed after it was approved; approve it again.`,
        );
      }
      this.hashedAt = Date.now();
    }
    if (this.process?.broken) {
      if (Date.now() - this.startedAt < RESTART_MS)
        throw new CredentialError(`${plugin.id} ${this.process.broken}`);
      this.process = null;
    }
    if (!this.process) {
      this.startedAt = Date.now();
      this.process = new PluginProcess(plugin, {
        timeoutMs: this.timeoutMs,
        deadline: Number.POSITIVE_INFINITY,
        guard: this.guard,
        checkListeners: this.checkListeners,
      });
      await this.process
        .request("hello", {
          entry: path.join(plugin.location, plugin.manifest.credentials.entry),
          config: plugin.entry.config ?? {},
          kind: "credentials",
        })
        .catch((error) => {
          throw new CredentialError(`${plugin.id} ${error.message}`);
        });
    }
    try {
      return await this.process.request("credentials.token", params);
    } catch (error) {
      throw new CredentialError(
        `${plugin.id} refused: ${String(error.message).replace(/^failed: /, "")}`,
      );
    }
  }
  stop() {
    const child = this.process;
    this.process = null;
    child?.close().catch(() => {});
  }
}

// This machine's providers, for one host. Tests pass `plugins` (a list as
// inspectPlugins returns) or a settings file, a fake `fetch` and `env`.
export function machineCredentials({
  settingsFile = pluginSettingsPath(),
  apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
  gitUrl = process.env.AVOOZL_GIT_URL,
  fetch: fetchImpl = globalThis.fetch,
  env = process.env,
  ghCommand = "gh",
  timeoutMs = CALL_TIMEOUT_MS,
  guard = true,
  checkListeners = listeningSockets,
  plugins: listPlugins = () =>
    inspectPlugins({ workspaceRoot: null, settingsFile }),
  settings: readSettings = () => readPluginSettings(settingsFile),
  now = Date.now,
} = {}) {
  const host = githubHost(apiUrl, gitUrl),
    cache = new Map(),
    inflight = new Map(),
    children = new Map(),
    listeners = { token: [], failure: [], success: [] };
  let inspected = null;

  const inspect = () => {
    const plugins = listPlugins();
    // A changed, disabled or removed plugin stops and drops its tokens
    // before the next call (PC11.6).
    for (const [id, child] of children) {
      const plugin = plugins.find((p) => p.id === id);
      if (!plugin || !child.same(plugin)) {
        child.stop();
        children.delete(id);
        for (const [key, entry] of cache)
          if (entry.provider === id) {
            held.delete(entry.token);
            cache.delete(key);
          }
      }
    }
    inspected = { plugins, settings: readSettings(), at: now() };
    return inspected;
  };
  // plugins.json is read on every token call (one small file); the folders
  // are inspected again when it changed, or every 10 minutes.
  const choose = (owner) => {
    const settings = readSettings(),
      signature = JSON.stringify(settings);
    if (
      !inspected ||
      inspected.signature !== signature ||
      now() - inspected.at > REHASH_MS
    )
      inspected = { ...inspect(), signature };
    return chooseProvider({
      plugins: inspected.plugins,
      settings: inspected.settings,
      host,
      owner,
      env,
    });
  };

  async function mint(choice, { repository, owner, permissions, purpose }) {
    if (choice.provider === "env" || choice.provider === "gh") {
      const token =
        choice.provider === "env"
          ? env.AVOOZL_GITHUB_TOKEN.trim()
          : await ghToken(host, { env, ghCommand });
      held.add(token);
      const login = await userLogin(fetchImpl, apiUrl, token);
      return {
        token,
        login,
        person: login,
        granted: "all",
        broader: false,
        expiresAt: null,
      };
    }
    let child = children.get(choice.plugin.id);
    if (!child) {
      child = new CredentialChild(choice.plugin, {
        timeoutMs,
        checkListeners,
        guard,
      });
      children.set(choice.plugin.id, child);
    }
    const reply = await child.call({ repository, owner, permissions, purpose });
    if (typeof reply?.token === "string") held.add(reply.token);
    try {
      return checkReply("credentials", "token", reply, permissions);
    } catch (error) {
      throw new CredentialError(
        `${choice.plugin.id} sent a bad reply: ${error.message}`,
      );
    }
  }

  const fresh = (entry) =>
    entry.expiresAt
      ? Date.parse(entry.expiresAt) - EARLY_MS > now()
      : now() - entry.at < HOUR_MS;

  return {
    host,
    apiUrl,
    // True when a provider is chosen for this owner: false only on a clash
    // or an unusable claiming plugin (D3).
    available(owner) {
      return !choose(owner).refusal;
    },
    choose,
    on(event, fn) {
      listeners[event].push(fn);
    },
    // {token, login, person, provider, granted, broader, expiresAt}.
    async token({ repository = null, owner, job }) {
      const permissions = jobOf(job).permissions,
        scopeKey = lower(repository || owner),
        choice = choose(owner),
        failureKey = choice.clash
          ? ["clash", host, lower(owner)].join("|")
          : [choice.provider || "none", host, lower(owner), job].join("|");
      if (choice.refusal) {
        const error = new CredentialError(redact(choice.refusal), {
          key: failureKey,
          provider: choice.provider,
        });
        for (const fn of listeners.failure)
          fn({
            key: failureKey,
            provider: choice.provider,
            host,
            owner,
            job,
            reason: error.message,
            clash: choice.clash ?? null,
          });
        throw error;
      }
      const key = [
        choice.provider,
        host,
        scopeKey,
        permissionText(permissions),
      ].join("|");
      const cached = cache.get(key);
      if (cached && fresh(cached)) return cached;
      if (inflight.has(key)) return inflight.get(key);
      const pending = (async () => {
        try {
          const reply = await mint(choice, {
            repository,
            owner,
            permissions,
            purpose: job,
          });
          const entry = {
            ...reply,
            provider: choice.provider,
            host,
            repository,
            owner,
            job,
            key,
            at: now(),
          };
          cache.set(key, entry);
          for (const fn of listeners.success) fn({ key: failureKey });
          for (const fn of listeners.token)
            fn({
              provider: entry.provider,
              host,
              job,
              repository,
              owner,
              login: entry.login,
              granted: entry.granted,
              broader: entry.broader,
              expiresAt: entry.expiresAt,
            });
          return entry;
        } catch (error) {
          const reason = redact(error.message);
          for (const fn of listeners.failure)
            fn({
              key: failureKey,
              provider: choice.provider,
              host,
              owner,
              job,
              reason,
            });
          throw new CredentialError(reason, {
            key: failureKey,
            provider: choice.provider,
          });
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, pending);
      return pending;
    },
    // GitHub answered 401 with this token: ask again next time (PC5.4).
    drop(entry) {
      if (cache.get(entry?.key) === entry) cache.delete(entry.key);
    },
    // What Settings shows: the newest token per provider in use (D11).
    signIns() {
      const { plugins } = inspected || inspect(),
        rows = new Map();
      for (const entry of cache.values()) {
        const row = rows.get(entry.provider);
        if (!row || row.at < entry.at) rows.set(entry.provider, entry);
      }
      const builtIn = env.AVOOZL_GITHUB_TOKEN?.trim() ? "env" : "gh";
      const lines = [];
      for (const plugin of plugins) {
        const claim = plugin.credentials ?? plugin.approval?.credentials;
        if (
          !claim?.hosts?.includes(host) ||
          !claimsFor([plugin], host, claim.owners?.[0] ?? "any").length
        )
          continue;
        const entry = rows.get(plugin.id);
        lines.push({
          host,
          provider: plugin.id,
          owners: claim.owners ?? "all",
          state: plugin.state,
          login: entry?.login ?? null,
          person: entry?.person ?? null,
          granted: "per-job",
          broader: [...cache.values()]
            .filter((e) => e.provider === plugin.id && e.broader)
            .map((e) => e.job)
            .filter((job, i, all) => all.indexOf(job) === i),
          expiresAt: entry?.expiresAt ?? null,
        });
      }
      const allClaimed = lines.some((line) => line.owners === "all");
      if (!allClaimed) {
        const entry = rows.get(builtIn);
        lines.push({
          host,
          provider: builtIn,
          owners: lines.length ? "other" : "all",
          state: "approved",
          login: entry?.login ?? null,
          person: entry?.person ?? null,
          granted: "all",
          broader: [],
          expiresAt: null,
        });
      }
      return lines;
    },
    close() {
      for (const child of children.values()) child.stop();
      children.clear();
    },
  };
}

// ---- Needs you and Activity (PC7.3, PC9.6) ------------------------------

const META = "githubCredentials";
const readMeta = (store) => {
  try {
    return store.getMeta(META) || {};
  } catch {
    return {};
  }
};
const writeFailures = (store, edit) => {
  try {
    const meta = readMeta(store),
      failures = { ...(meta.failures || {}) };
    if (edit(failures) === false) return;
    store.setMeta(META, { ...meta, failures });
  } catch {
    // A read-only or busy store only loses the Needs you row.
  }
};

// One Needs you row per provider, host, owner and job; it clears itself on
// the next token call that works for that key. Activity gets one row per
// new token: never the token.
export function recordCredentialEvents(store, credentials) {
  if (!credentials?.on) return;
  credentials.on("failure", (failure) =>
    writeFailures(store, (failures) => {
      const same = failures[failure.key];
      if (same?.reason === failure.reason) return false;
      failures[failure.key] = { ...failure, at: new Date().toISOString() };
    }),
  );
  credentials.on("success", ({ key }) =>
    writeFailures(store, (failures) => {
      if (!failures[key]) return false;
      delete failures[key];
    }),
  );
  credentials.on("token", (made) => {
    try {
      recordActivity(store, {
        source: "github",
        actor: made.login || made.provider,
        kind: "github.token",
        summary: redact(
          `New GitHub token from ${made.provider} on ${made.host} for ${made.job} on ${made.repository || made.owner || "this machine"}: signed in as ${made.login || "unknown"}, ${made.granted === "all" ? "full access" : `granted ${permissionText(made.granted)}`}, ${made.expiresAt ? `expires ${made.expiresAt}` : "no expiry"}.`,
          400,
        ),
      });
    } catch {
      // Activity is a record, never a reason to fail the call.
    }
  });
}

export function credentialsNeedsYou(store) {
  return Object.values(readMeta(store).failures || {}).map((failure) => ({
    kind: "needs-human",
    reason: "crew",
    id: `github-credentials:${failure.key}`,
    taskId: null,
    authority: "github",
    title: failure.clash
      ? `Pick who signs Avoozl in for ${failure.owner} on ${failure.host}`
      : `${failure.provider || "GitHub sign-in"} refused ${failure.job} for ${failure.owner || "this machine"}`,
    detail: `${failure.reason} GitHub work for ${failure.owner || "this machine"} waits; nothing falls back to another sign-in.`,
    openedAt: failure.at,
    ...(failure.clash
      ? {
          actions: failure.clash.map((id) => ({
            label: "Use this one",
            plugin: id,
            operation: "plugin.credentials.pick",
            input: { host: failure.host, id },
          })),
        }
      : {}),
  }));
}

// A provider that names no person (PC10.4): steps that need the person's
// login wait, with one Needs you row per provider and owner.
export function recordNoPerson(store, { provider, owner }) {
  const key = ["person", provider, lower(owner || "")].join("|");
  writeFailures(store, (failures) => {
    if (failures[key]) return false;
    failures[key] = {
      key,
      provider,
      host: "",
      owner,
      job: "the person's login",
      reason: `${provider} names no person in its token reply, so the spec issue's assignee, driver claims and rights checks wait.`,
      at: new Date().toISOString(),
    };
  });
}
