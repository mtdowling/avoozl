// Placement in the tick and the Routing page (design §4.10, §8.3): reads
// the rules from `.avoozl.json` and this machine's settings, the crews and
// their readings, and decides for each worker, checks, and reviewer
// session which crew runs it and on which agent and model. With no rule and
// no `session` anywhere nothing changes (R41.3, R53.13).
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { git } from "./git.mjs";
import {
  crewSettingsInput,
  crewSnapshot,
  listCrews,
  LOCAL,
  localReading,
  machineFile,
  remoteHost,
  staleSecondsInput,
  writeMachineFile,
} from "./crews.mjs";
import {
  choiceKey,
  chooseSession,
  evaluatePlacement,
  pickCrew,
  placedRole,
  presetOf,
  routingConfig,
  subjectOf,
  validateRouting,
  validateTrackedRouting,
} from "./placement.mjs";
import { contentBinding, resolveSets } from "./content-rules.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { taskRepository, taskRoute } from "../work-model.mjs";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const DECISIONS = "placement_decisions";

function readTracked(workspaceRoot) {
  if (!workspaceRoot) return { value: {}, hash: null };
  try {
    const text = fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8");
    return { value: JSON.parse(text), text };
  } catch (error) {
    if (error.code === "ENOENT") return { value: {} };
    throw Error(`.avoozl.json is invalid: ${error.message}`);
  }
}

// The machine-local half: crews, the stale limit, and machine rules.
export function machineRouting(file) {
  const { value, hash } = machineFile(file);
  return {
    hash,
    crews: crewSettingsInput(value.crews),
    staleSeconds: staleSecondsInput(value.crewStaleSeconds),
    routing: value.routing
      ? validateRouting(value.routing, { at: "routing", tracked: false })
      : null,
  };
}

const machinePath = (store, options) =>
  options.machineFile ?? contentBinding(store)?.configFile ?? null;

// Live Avoozl sessions per crew, and per agent and model for writers.
function runningCounts(bindings) {
  const crews = new Map(),
    choices = new Map();
  for (const b of bindings) {
    if (b.status === "closed" || b.status === "lost" || b.report?.kind === "done" || b.report?.kind === "blocked")
      continue;
    if (b.source !== "tick") continue;
    const crew = b.crew || LOCAL;
    crews.set(crew, (crews.get(crew) || 0) + 1);
    if (b.role === "worker") {
      const key = choiceKey({ agent: b.agent, model: b.model });
      choices.set(key, (choices.get(key) || 0) + 1);
    }
  }
  return { crews, choices };
}

// Everything one tick or one Preview needs. `local` is this machine's
// reading; tests pass their own.
export function routingContext(store, options = {}) {
  const workspaceRoot = options.workspaceRoot ?? contentBinding(store)?.workspaceRoot ?? null,
    tracked = options.tracked ?? readTracked(workspaceRoot).value,
    file = machinePath(store, options),
    machine = file ? machineRouting(file) : { crews: {}, staleSeconds: null, routing: null },
    config = routingConfig({
      workspace: tracked,
      machine: { routing: machine.routing },
    }),
    snapshot = crewSnapshot(store),
    bindings = options.bindings ?? listSessionBindings(store),
    counts = runningCounts(bindings),
    now = options.now ?? Date.now(),
    crews = listCrews({
      settings: machine.crews,
      staleSeconds: machine.staleSeconds,
      snapshot,
      local: options.local ?? localReading({ root: workspaceRoot || undefined, now }),
      running: counts.crews,
      now,
    });
  return {
    config,
    crews,
    machine,
    snapshot,
    mc10: snapshot?.mc10 === true,
    remoteDispatch: snapshot?.remoteDispatch === true,
    counts,
    fetch: options.fetch ?? new Map(),
    now,
    // The owner set a local chat limit: it caps local sessions even with
    // no rule (P29 action 1).
    localLimit: machine.crews[LOCAL]?.chatLimit ?? null,
  };
}

// What a remote crew needs to fetch, per project: {remotes: [{name, host,
// url}], base, on: Set(remote names holding base), branches: Set("<remote>/<branch>")}.
// `fetch` runs `git fetch` first (the tick; Preview reads only).
export async function fetchInfo(project, { fetch = false, hosts = null } = {}) {
  const info = { remotes: [], base: null, on: new Set(), branches: new Set() };
  let names = [];
  try {
    names = (await git(project.root, ["remote"])).split("\n").filter(Boolean);
  } catch {
    return info;
  }
  for (const name of names) {
    let url = "";
    try {
      url = await git(project.root, ["config", "--get", `remote.${name}.url`]);
    } catch {}
    info.remotes.push({ name, url, host: remoteHost(url) });
  }
  if (fetch)
    for (const remote of info.remotes)
      if (remote.host && (!hosts || hosts.has(remote.host)))
        try {
          await git(project.root, ["fetch", "--quiet", remote.name]);
        } catch {}
  const branch = project.integrationBranch || project.baseBranch || "main";
  for (const ref of [project.integrationBranch, project.baseBranch || "main"].filter(Boolean))
    try {
      info.base = await git(project.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${ref}`]);
      break;
    } catch {}
  if (!info.base) return info;
  try {
    const refs = await git(project.root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "--contains",
      info.base,
      "refs/remotes",
    ]);
    for (const ref of refs.split("\n").filter(Boolean)) info.on.add(ref.split("/")[0]);
    const all = await git(project.root, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]);
    for (const ref of all.split("\n").filter(Boolean)) info.branches.add(ref);
  } catch {}
  info.landing = branch;
  return info;
}

// Projects whose remote crews are worth a fetch this tick.
export async function fetchAll(store, ctx, { fetch = false } = {}) {
  const remote = ctx.crews.filter((c) => c.trust !== "local" && c.gitHosts.length);
  if (!ctx.config.active || !remote.length) return ctx.fetch;
  const hosts = new Set(remote.flatMap((c) => c.gitHosts.map((h) => h.toLowerCase())));
  for (const project of store.list("projects"))
    if (project.root) ctx.fetch.set(project.id, await fetchInfo(project, { fetch, hosts }));
  return ctx.fetch;
}

// Why `crew` cannot fetch this task's work, or null (§4.10 Fetchable work).
export function fetchableWhy(ctx, project, crew, { taskId, attempt, earlier = false }) {
  const info = ctx.fetch.get(project.id);
  if (crew.delivery === "handback" && (!crew.sshHost || !crew.worktreeRoot))
    return "work not fetchable (hand-back needs sshHost and worktreeRoot for this crew)";
  const remote = info?.remotes.find((r) => r.host && crew.gitHosts.map((h) => h.toLowerCase()).includes(r.host));
  if (!remote) return "work not fetchable (no remote on a git host this crew lists)";
  if (!info.on.has(remote.name))
    return "work not fetchable (the base commit is only on this machine)";
  // A retry or rework resumes the earlier attempt's commits, when it left any.
  if (attempt > 1 && earlier && crew.delivery === "push" && !info.branches.has(`${remote.name}/avoozl/${taskId}`))
    return `work not fetchable (the earlier attempt's branch is not on ${remote.name})`;
  return null;
}

// The first available content-rule set for this repository whose
// `remote` is forbid, or null.
export function contentForbidsRemote(store, repository) {
  let sets = [];
  try {
    sets = resolveSets(store).sets;
  } catch {
    return null;
  }
  const set = sets.find(
    (s) =>
      s.remote === "forbid" &&
      (!s.repositories ||
        s.repositories.some((r) => r.toLowerCase() === String(repository).toLowerCase())),
  );
  return set?.id ?? null;
}

// Does anything ask for placement or a session choice?
export function routingOn(ctx, data) {
  return (
    ctx.config.active ||
    ctx.localLimit !== null ||
    data.tasks.some((t) => t.session)
  );
}

// Attach (R41.14): a local chat opens at /chat?sid=<slot>; a remote one
// only through MC-10, from the link pattern Kiro Crew gives (Inferred: the
// contract is not published yet), else null.
export function attachLink(store, binding, local) {
  if (!binding.crew) return local;
  const pattern = crewSnapshot(store)?.attach;
  return typeof pattern === "string" && pattern.startsWith("/")
    ? pattern
        .replace("{crew}", encodeURIComponent(binding.crew))
        .replace("{slot}", encodeURIComponent(binding.slot))
    : null;
}

// The defaults a session falls back to (R53.3): the role's own settings.
function roleDefaults(role, policy, reviewRole) {
  if (role === "worker")
    return {
      agent: policy?.agent ?? null,
      model: policy?.model ?? null,
      source: policy?.model || policy?.agent ? "delivery" : "default",
    };
  return {
    agent: reviewRole?.agent ?? null,
    model: reviewRole?.model ?? null,
    source: "role",
  };
}

// Place one session. `state`: per-tick reservations {crews: Map, choices:
// Map}. Returns {crew, agent, model, placement} or {wait, why, noFit,
// removed}. `preview` keeps remote picks even without MC-10.
export function placeOne(store, data, ctx, state, input) {
  const { task, role: bindingRole, project, attempt = 1, policy, reviewRole, kept = null, skipModels = [], preview = false } = input;
  const role = placedRole(bindingRole);
  const subject = {
    ...subjectOf(task, data, role),
    route: task.route,
    defaultRoute: taskRoute(task),
  };
  if (!role)
    return { crew: LOCAL, agent: null, model: null, placement: null };
  const evaluation = evaluatePlacement(subject, ctx.config.rules, ctx.crews, {
    remoteDispatch: ctx.remoteDispatch,
    contentForbids: contentForbidsRemote(store, project?.repository || project?.id || taskRepository(task)),
    fetchable: (crew) =>
      role !== "worker"
        ? "work not fetchable (checks and reviews run on this machine, where the commit is)"
        : project
          ? fetchableWhy(ctx, project, crew, {
              taskId: task.id,
              attempt,
              earlier: Boolean(input.delivery?.commit),
            })
          : "no checkout",
  });
  const byId = new Map(ctx.crews.map((c) => [c.id, c])),
    removed = [...evaluation.removed];
  let allowed = [...evaluation.allowed];
  // The session (R53): after the hard rules, before the scorer.
  const hasAgent = (crew, agent) => !agent || !crew.agents || crew.agents.includes(agent);
  const session = chooseSession({
    task,
    role,
    rules: ctx.config.rules,
    subject,
    defaults: roleDefaults(role, policy, reviewRole),
    running: ctx.counts.choices,
    reserved: state.choices,
    kept,
    skipModels,
    agentAvailable: (agent) => allowed.some((id) => hasAgent(byId.get(id), agent)),
  });
  if (session.wait) {
    // An agent no allowed crew has, or no model apart from a reviewer's.
    if (!session.distinct)
      for (const id of allowed) removed.push({ crew: id, by: "agent not installed" });
    return {
      wait: true,
      noFit: true,
      why: session.reason,
      removed,
      evaluation,
      session,
    };
  }
  for (const id of [...allowed])
    if (!hasAgent(byId.get(id), session.agent)) {
      allowed = allowed.filter((x) => x !== id);
      removed.push({ crew: id, by: "agent not installed" });
    }
  if (!allowed.length)
    return {
      wait: true,
      noFit: true,
      why: "no crew fits",
      removed,
      evaluation,
      session,
    };
  // Without MC-10 a remote pick cannot open (§4.10 Who opens remote
  // sessions): it runs on local when the rules allow that, else waits.
  let candidates = allowed;
  if (!preview && !ctx.mc10) candidates = allowed.filter((id) => id === LOCAL);
  // Without any rule only the owner's local chat limit applies.
  const crews = ctx.config.active
      ? ctx.crews
      : ctx.crews.map((c) =>
          c.id === LOCAL && ctx.localLimit === null ? { ...c, chatLimit: Infinity, available: true } : c,
        ),
    picked = pickCrew(candidates, crews, ctx.config.weights, state.crews);
  if (!picked)
    return {
      wait: true,
      noFit: false,
      why: candidates.length
        ? "every allowed crew is busy or unavailable"
        : "remote placement waits on Kiro Crew (MC-10)",
      removed,
      evaluation,
      session,
      allowed,
    };
  state.crews.set(picked.crew.id, (state.crews.get(picked.crew.id) || 0) + 1);
  if (role === "worker") {
    const key = choiceKey(session);
    state.choices.set(key, (state.choices.get(key) || 0) + 1);
  }
  const why = evaluation.pin
    ? `rule ${evaluation.pin} pins it`
    : allowed.length === 1
      ? allowed[0] === LOCAL
        ? evaluation.applied.length
          ? `rules ${evaluation.applied.join(", ")}: local only`
          : "no rule: local"
        : `only ${allowed[0]} is allowed`
      : `${presetOf(ctx.config.pick)}: score ${Math.round(picked.score * 100) / 100}`;
  return {
    crew: picked.crew.id,
    agent: session.agent,
    model: session.model,
    sessionReason: session.reason,
    placement: {
      crew: picked.crew.id,
      rules: evaluation.applied,
      route: evaluation.route,
      reason: why,
      reading: picked.crew.reading,
      allowed,
      removed,
      at: new Date(ctx.now).toISOString(),
    },
    crewInfo: picked.crew,
  };
}

// ---------------------------------------------------------------------------
// No-fit decisions (§4.10 step 4, R41.8): one per task, closed by itself
// when a later evaluation fits.

export function openNoFit(store, task, result, { script }) {
  const current = store.get(DECISIONS, task.id);
  const text = result.removed.map((r) => `${r.crew}: ${r.by}`).join("; ");
  if (current?.state === "open" && current.text === text) return [];
  store.transaction(() =>
    store.put(DECISIONS, {
      id: task.id,
      taskId: task.id,
      state: "open",
      why: result.why,
      removed: result.removed,
      text,
      openedAt: current?.state === "open" ? current.openedAt : new Date().toISOString(),
    }),
  );
  return script && current?.state !== "open"
    ? [
        {
          channel: "decision",
          task: task.id,
          title: `No crew fits ${task.id}`,
          text: `${result.why}. ${text}.`,
          resume: "Change a routing rule or a crew's tags on the Routing page; the task starts when it fits.",
        },
      ]
    : [];
}

export function closeNoFit(store, taskId) {
  const current = store.get(DECISIONS, taskId);
  if (current?.state !== "open") return;
  store.transaction(() =>
    store.put(DECISIONS, { ...current, state: "closed", closedAt: new Date().toISOString() }),
  );
}

export const openNoFits = (store) =>
  store.list(DECISIONS).filter((d) => d.state === "open");

// ---------------------------------------------------------------------------
// The Routing page.

export function routingView(store, data, options = {}) {
  const ctx = routingContext(store, options),
    tracked =
      options.tracked ??
      readTracked(options.workspaceRoot ?? contentBinding(store)?.workspaceRoot).value;
  return {
    crews: ctx.crews.map((c) => ({
      ...c,
      reading: c.reading
        ? {
            source: c.reading.source,
            measuredAt: c.reading.measuredAt,
            memFreeGb: c.reading.memFreeGb,
            diskFreeGb: c.reading.diskFreeGb,
            loadPerCpu: c.reading.loadPerCpu,
          }
        : null,
    })),
    staleSeconds: ctx.machine.staleSeconds,
    machineHash: ctx.machine.hash ?? null,
    rules: ctx.config.rules.map((rule) => ({
      ...rule,
      sessionApplies: !rule.route || rule.route === "local",
    })),
    workspace: {
      rules: tracked.routing?.rules || [],
      pick: tracked.routing?.pick || {},
      router: tracked.routing?.router || {},
    },
    repositories: Object.fromEntries(
      Object.entries(record(tracked.projects) ? tracked.projects : {})
        .filter(([, p]) => p?.routing)
        .map(([id, p]) => [id, p.routing]),
    ),
    machine: ctx.machine.routing || {},
    pick: { ...ctx.config.pick, preset: presetOf(ctx.config.pick), weights: ctx.config.weights },
    router: { ...ctx.config.router, instructions: undefined, hasInstructions: Boolean(ctx.machine.routing?.router?.instructions) },
    instructions: options.person ? (ctx.machine.routing?.router?.instructions ?? "") : null,
    mc10: ctx.mc10,
    remoteDispatch: ctx.remoteDispatch,
    noFit: openNoFits(store),
    labels: [...new Set(data.tasks.flatMap((t) => subjectOf(t, data, "worker").labels))].sort(),
  };
}

// Preview (§8.3): where each ready task would go now, read only. It opens
// nothing and writes nothing; remote picks show even without MC-10.
export async function routingPreview(store, data, options = {}) {
  const ctx = routingContext(store, options);
  await fetchAll(store, ctx, { fetch: false });
  const
    state = { crews: new Map(), choices: new Map() },
    projects = new Map(store.list("projects").map((p) => [p.id, p]));
  const tasks = readyForPreview(store, data, options);
  return {
    mc10: ctx.mc10,
    items: tasks.map((task) => {
      const project = projects.get(taskRepository(task)),
        result = placeOne(store, data, ctx, state, {
          task,
          role: "worker",
          project,
          policy: options.policy,
          preview: true,
        });
      return {
        taskId: task.id,
        title: task.title,
        route: result.placement?.route ?? result.evaluation?.route ?? taskRoute(task),
        crew: result.wait ? null : result.crew,
        agent: result.agent ?? result.session?.agent ?? null,
        model: result.model ?? result.session?.model ?? null,
        sessionReason: result.sessionReason ?? result.session?.reason ?? null,
        reason: result.wait ? result.why : result.placement.reason,
        noFit: Boolean(result.noFit),
        whyNot: (result.removed || result.placement?.removed || []).concat(
          ctx.crews
            .filter((c) => !c.available && (result.placement?.allowed || result.allowed || []).includes(c.id) && c.id !== result.crew)
            .map((c) => ({ crew: c.id, by: c.why })),
        ),
      };
    }),
  };
}

// Ready local leaves, without capacity: what the next ticks would place.
function readyForPreview(store, data, options) {
  return options.readyCandidates
    ? options.readyCandidates()
    : [];
}

// Writes. The tracked half goes through the workspace settings file with an
// expected hash; the machine half through this machine's file.
export function updateRouting(settings, store, input = {}, options = {}) {
  const where = input.where ?? "workspace";
  if (where === "machine") {
    const file = machinePath(store, options);
    if (!file) fail("This workspace has no machine settings file.", 409);
    const routing = input.routing;
    if (routing !== null && routing !== undefined)
      validateRouting(routing, { tracked: false, pluginIds: options.pluginIds ?? null });
    return writeMachineFile(
      file,
      (value) => {
        if (routing && Object.keys(routing).length) value.routing = routing;
        else delete value.routing;
      },
      input.expectedHash,
    );
  }
  const before = settings.readFile();
  if (input.expectedHash !== before.hash)
    fail("Avoozl configuration changed; reload before saving.", 409);
  const value = settings.updateValue(before),
    routing = input.routing || {};
  if (where === "workspace") {
    if (Object.keys(routing).length) value.routing = routing;
    else delete value.routing;
  } else if (where.startsWith("repository:")) {
    const id = where.slice(11);
    if (!record(value.projects?.[id]))
      fail(`Repository ${id} is not in .avoozl.json projects.`, 404);
    if (Object.keys(routing).length) value.projects[id].routing = routing;
    else delete value.projects[id].routing;
  } else fail("Save a rule in the workspace, a repository, or this machine.");
  validateTrackedRouting(value, { pluginIds: options.pluginIds ?? null });
  const written = settings.write(value, { expectedHash: before.hash });
  return { hash: written.hash };
}

export function updateCrews(store, input = {}, options = {}) {
  const file = machinePath(store, options);
  if (!file) fail("This workspace has no machine settings file.", 409);
  const crews = input.crews === undefined ? undefined : crewSettingsInput(input.crews);
  const stale = input.staleSeconds === undefined ? undefined : staleSecondsInput(input.staleSeconds);
  return writeMachineFile(
    file,
    (value) => {
      if (crews !== undefined) {
        if (Object.keys(crews).length) value.crews = crews;
        else delete value.crews;
      }
      if (stale !== undefined) {
        if (stale === null) delete value.crewStaleSeconds;
        else value.crewStaleSeconds = stale;
      }
    },
    input.expectedHash,
  );
}
