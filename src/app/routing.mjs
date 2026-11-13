// Placement in the tick and Settings › Routing (design §4.10, §8.3). Off by
// default: every session runs on `local`, as before. On, the person's one
// routing prompt guides the routing agent (router.mjs), which picks a crew
// and a model for each ready worker among the options that passed the hard
// checks (placement.mjs). A crew or model pinned in a task's manifest wins.
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
  healthContext,
  providerFacts,
  PROVIDER_DEFAULTS,
  readProviders,
} from "./provider-health.mjs";
import {
  crewChecks,
  modelChecks,
  placedRole,
  routingConfig,
  subjectOf,
  validateRouting,
  validateTrackedRouting,
} from "./placement.mjs";
import { contentBinding, resolveSets } from "./content-rules.mjs";
import {
  PROMPT_EXAMPLES,
  routerAnswer,
  routerBatch,
  routerBrief,
} from "./router.mjs";
import { relayActive, relayQueuedByCrew, relayView } from "./relay.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { taskRepository } from "../work-model.mjs";

const DECISIONS = "placement_decisions";
const MODELS = "routing.models";

function readTracked(workspaceRoot) {
  if (!workspaceRoot) return { value: {} };
  try {
    const text = fs.readFileSync(
      path.join(workspaceRoot, ".avoozl.json"),
      "utf8",
    );
    return { value: JSON.parse(text), text };
  } catch (error) {
    if (error.code === "ENOENT") return { value: {} };
    throw Error(`.avoozl.json is invalid: ${error.message}`);
  }
}

// The machine-local half: crews, the stale limit, and the routing prompt.
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

// The models Kiro Crew lists (`GET /api/models`, F128), as the app backend
// last read them. Read again on every backend pass, so a model Kiro Crew
// drops leaves the options at the next tick.
export function recordModelList(store, models) {
  const names = (Array.isArray(models) ? models : [])
    .map((m) => (typeof m === "string" ? m : (m?.model_name ?? m?.id)))
    .filter((m) => typeof m === "string" && m && m.length <= 128)
    .slice(0, 100);
  store.setMeta(MODELS, { models: names, readAt: new Date().toISOString() });
  return names;
}
export const modelList = (store) => store.getMeta(MODELS)?.models || [];

// Live Avoozl sessions per crew, and per model for writers.
function runningCounts(bindings) {
  const crews = new Map(),
    models = new Map();
  for (const b of bindings) {
    if (
      b.status === "closed" ||
      b.status === "lost" ||
      b.report?.kind === "done" ||
      b.report?.kind === "blocked"
    )
      continue;
    // The routing session is tool-less and short; it holds no work chat.
    if (b.source !== "tick" || b.role === "router") continue;
    const crew = b.crew || LOCAL;
    crews.set(crew, (crews.get(crew) || 0) + 1);
    if (b.role === "worker" && b.model)
      models.set(b.model, (models.get(b.model) || 0) + 1);
  }
  return { crews, models };
}

// Everything one tick or one Preview needs. `local` is this machine's
// reading; tests pass their own.
export function routingContext(store, options = {}) {
  const workspaceRoot =
      options.workspaceRoot ?? contentBinding(store)?.workspaceRoot ?? null,
    tracked = options.tracked ?? readTracked(workspaceRoot).value,
    file = machinePath(store, options),
    machine = file
      ? machineRouting(file)
      : { crews: {}, staleSeconds: null, routing: null },
    snapshot = crewSnapshot(store),
    bindings = options.bindings ?? listSessionBindings(store),
    counts = runningCounts(bindings),
    now = options.now ?? Date.now();
  validateTrackedRouting(tracked);
  // A request queued for the Remote relay holds a chat on its crew (R41.17).
  for (const [crew, n] of relayQueuedByCrew(store))
    counts.crews.set(crew, (counts.crews.get(crew) || 0) + n);
  const crews = listCrews({
    settings: machine.crews,
    staleSeconds: machine.staleSeconds,
    snapshot,
    local:
      options.local ?? localReading({ root: workspaceRoot || undefined, now }),
    running: counts.crews,
    now,
  });
  const mc10 = snapshot?.mc10 === true,
    config = routingConfig({
      workspace: tracked,
      machine: { routing: machine.routing },
    });
  return {
    config,
    crews,
    machine,
    snapshot,
    mc10,
    // The Remote relay opens a worker's remote pick until MC-10 lands
    // (R41.16); hardChecks reads it.
    relayActive: relayActive(config, mc10),
    remoteDispatch: snapshot?.remoteDispatch === true,
    counts,
    fetch: options.fetch ?? new Map(),
    now,
    script: options.script === true,
    models: options.models ?? modelList(store),
    // The owner set a local chat limit: it caps local sessions even when
    // routing is off (P29 action 1).
    localLimit: machine.crews[LOCAL]?.chatLimit ?? null,
    // Provider health (§4.20): empty unless something is marked.
    health:
      options.health ??
      healthContext(store, { machineFile: file ?? undefined, now }),
  };
}

// Projects whose remote crews are worth a fetch this tick.
export async function fetchAll(store, ctx, { fetch = false } = {}) {
  const remote = ctx.crews.filter(
    (c) => c.trust !== "local" && c.gitHosts.length,
  );
  const pinned = () =>
    store.read().tasks.some((t) => t.session?.crew && t.session.crew !== LOCAL);
  if (!remote.length || !(ctx.config.enabled || pinned())) return ctx.fetch;
  const hosts = new Set(
    remote.flatMap((c) => c.gitHosts.map((h) => h.toLowerCase())),
  );
  for (const project of store.list("projects"))
    if (project.root)
      ctx.fetch.set(project.id, await fetchInfo(project, { fetch, hosts }));
  return ctx.fetch;
}

// Does anything ask for placement? The prompt, a local chat limit, or a
// task that pins its crew or model.
export function routingOn(ctx, data) {
  return (
    ctx.config.enabled ||
    ctx.localLimit !== null ||
    data.tasks.some((t) => t.session || t.needs?.length)
  );
}

// The defaults a session falls back to (R53.3): the role's own settings.
function roleDefaults(role, policy, reviewRole) {
  if (role === "worker")
    return {
      agent: policy?.agent ?? null,
      model: policy?.model ?? null,
      from: policy?.model || policy?.agent ? "delivery" : "default",
    };
  return {
    agent: reviewRole?.agent ?? null,
    model: reviewRole?.model ?? null,
    from: "role",
  };
}

// The hard checks for one session (§4.10): which crews and models it may
// use, and why each other one may not. Reads only.
export function hardChecks(store, data, ctx, input) {
  const { task, role: bindingRole, project, attempt = 1 } = input,
    role = placedRole(bindingRole),
    pin = role === "worker" ? task.session || {} : {},
    defaults = roleDefaults(role, input.policy, input.reviewRole);
  const crews = ctx.config.enabled
    ? ctx.crews
    : ctx.crews.map((c) =>
        c.id === LOCAL && ctx.localLimit === null
          ? { ...c, chatLimit: Infinity, available: true, why: null }
          : c,
      );
  const checked = crewChecks(crews, {
    role,
    pin: pin.crew ?? null,
    needs: role === "worker" ? task.needs || [] : [],
    agent: pin.agent ?? defaults.agent,
    remoteDispatch: ctx.remoteDispatch,
    canOpenRemote: ctx.mc10 || (ctx.relayActive === true && role === "worker"),
    contentForbids: contentForbidsRemote(
      store,
      project?.repository || project?.id || taskRepository(task),
    ),
    fetchable: (crew) =>
      project
        ? fetchableWhy(ctx, project, crew, {
            taskId: task.id,
            attempt,
            earlier: Boolean(input.delivery?.commit),
          })
        : "no checkout",
  });
  // A retry keeps its last model unless it is out (R53.6, R72.6).
  const kept =
    role === "worker" && input.kept?.model && !pin.model
      ? ctx.health.level(input.kept.model) === "out"
        ? null
        : input.kept.model
      : null;
  const models =
    role !== "worker"
      ? modelChecks({ pin: defaults.model, health: ctx.health })
      : modelChecks({
          pin: pin.model ?? kept,
          fallback: defaults.model,
          listed: ctx.config.enabled ? ctx.models : [],
          health: ctx.health,
          skipModels: input.skipModels || [],
        });
  return {
    role,
    pin,
    defaults,
    kept,
    keptOut: Boolean(input.kept?.model && !kept && !pin.model),
    ...checked,
    models: models.models,
    modelsRemoved: models.removed,
  };
}

const room = (ctx, state, id) => {
  const crew = ctx.crews.find((c) => c.id === id);
  if (!crew) return false;
  const limit =
    id === LOCAL && !ctx.config.enabled && ctx.localLimit === null
      ? Infinity
      : crew.chatLimit;
  return crew.running + (state.crews.get(id) || 0) < limit;
};

// Place one session. `state`: per-tick reservations {crews: Map}. Returns
// {crew, agent, model, placement} or {wait, why, noFit, removed}.
export function placeOne(store, data, ctx, state, input) {
  const { task } = input,
    checks = hardChecks(store, data, ctx, input);
  if (!checks.role)
    return { crew: LOCAL, agent: null, model: null, placement: null };
  const removed = [
    ...checks.removed,
    ...checks.modelsRemoved.map((m) => ({ model: m.model, by: m.by })),
  ];
  const agent = checks.pin.agent ?? checks.defaults.agent;
  // Nothing can ever take it: one no-fit decision (R41.8).
  if (!checks.allowed.length && !checks.busy.length)
    return { wait: true, noFit: true, why: "no crew fits", removed, checks };
  // Every model it may use is out (R72.5): it waits; Needs you shows why. A
  // writer left only with review roles' models is a decision (R53.7).
  if (!checks.models.length)
    return {
      wait: true,
      noFit: checks.modelsRemoved.every((m) => /review role/.test(m.by)),
      health: true,
      why: checks.modelsRemoved.map((m) => m.by).join(", ") || "no model",
      removed,
      checks,
    };
  const open = checks.allowed.filter((id) => room(ctx, state, id));
  if (!open.length)
    return {
      wait: true,
      noFit: false,
      why: "every crew that passed the checks is busy",
      removed,
      checks,
    };
  const options = open.flatMap((crew) =>
    checks.models.map((model) => ({ crew, model })),
  );
  let pick = null,
    reason;
  const pinned = checks.pin.crew || checks.pin.model;
  if (options.length === 1) {
    pick = options[0];
    reason = pinned
      ? "pinned in the manifest"
      : ctx.config.enabled
        ? "the only option that passed the checks"
        : "routing is off: local";
  } else if (ctx.config.enabled && checks.role === "worker") {
    const answer = routerAnswer(store, ctx, task.id, options, {
      ...brief(task, data, checks),
    });
    if (answer.placing)
      return { wait: true, noFit: false, why: "placing", removed, checks };
    if (answer.pick) {
      pick = { crew: answer.pick.crew, model: answer.pick.model };
      reason = `routing agent: ${answer.pick.reason}`;
    } else {
      pick = fallbackPick(options, checks);
      if (!pick)
        return {
          wait: true,
          noFit: false,
          why: `routing fell back to local (${answer.fallback}), and local is not an option`,
          removed,
          checks,
        };
      reason = `fell back to local (${answer.fallback})`;
    }
  } else {
    pick = fallbackPick(options, checks) ?? options[0];
    reason = ctx.config.enabled
      ? "not a worker: local"
      : "routing is off: local";
  }
  state.crews.set(pick.crew, (state.crews.get(pick.crew) || 0) + 1);
  const crewInfo = ctx.crews.find((c) => c.id === pick.crew);
  return {
    crew: pick.crew,
    agent,
    model: pick.model,
    sessionReason:
      pick.model === checks.kept && checks.kept
        ? `kept from the last attempt; ${reason}`
        : checks.keptOut
          ? `the kept model ${input.kept.model} is out; ${reason}`
          : reason,
    placement: {
      crew: pick.crew,
      reason,
      reading: crewInfo?.reading ?? null,
      allowed: checks.allowed,
      removed,
      at: new Date(ctx.now).toISOString(),
    },
    crewInfo,
  };
}

// Local on the kept or default model, else local on any model that passed.
function fallbackPick(options, checks) {
  const local = options.filter((o) => o.crew === LOCAL);
  return (
    local.find((o) => o.model === (checks.kept ?? checks.defaults.model)) ??
    local[0] ??
    null
  );
}

// What the routing agent reads about one task: its own words, as data.
function brief(task, data, checks) {
  const subject = subjectOf(task, data, "worker");
  return {
    title: task.title || task.id,
    labels: subject.labels,
    type: subject.kind,
    repository: subject.repository,
    category: subject.category,
    paths: subject.paths.slice(0, 20),
    ...(checks.kept ? { lastModel: checks.kept } : {}),
  };
}

// The models a running chat may switch to (§4.20 Running chats): the
// task's pin, then the models Kiro Crew lists.
export function switchModels(ctx, task) {
  return [task?.session?.model, ...ctx.models].filter(
    (m, i, all) => m && all.indexOf(m) === i,
  );
}

// Whether a batch member's worker may run in its leader's session on
// `crewId` (R46.4): its own pin and needs must allow that crew.
export function crewAllowed(ctx, task, crewId) {
  const crew = ctx.crews.find((c) => c.id === crewId);
  if (!crew) return false;
  if (task.session?.crew && task.session.crew !== crewId) return false;
  return (task.needs || []).every((t) => crew.tags.includes(t));
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
  for (const ref of [
    project.integrationBranch,
    project.baseBranch || "main",
  ].filter(Boolean))
    try {
      info.base = await git(project.root, [
        "rev-parse",
        "--verify",
        "--quiet",
        `refs/heads/${ref}`,
      ]);
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
    for (const ref of refs.split("\n").filter(Boolean))
      info.on.add(ref.split("/")[0]);
    const all = await git(project.root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/remotes",
    ]);
    for (const ref of all.split("\n").filter(Boolean)) info.branches.add(ref);
  } catch {}
  info.landing = branch;
  return info;
}

// Why `crew` cannot fetch this task's work, or null (§4.10 Fetchable work).
export function fetchableWhy(
  ctx,
  project,
  crew,
  { taskId, attempt, earlier = false },
) {
  const info = ctx.fetch.get(project.id);
  if (crew.delivery === "handback" && (!crew.sshHost || !crew.worktreeRoot))
    return "work not fetchable (hand-back needs sshHost and worktreeRoot for this crew)";
  const remote = info?.remotes.find(
    (r) => r.host && crew.gitHosts.map((h) => h.toLowerCase()).includes(r.host),
  );
  if (!remote)
    return "work not fetchable (no remote on a git host this crew lists)";
  if (!info.on.has(remote.name))
    return "work not fetchable (the base commit is only on this machine)";
  // A retry or rework resumes the earlier attempt's commits, when it left any.
  if (
    attempt > 1 &&
    earlier &&
    crew.delivery === "push" &&
    !info.branches.has(`${remote.name}/avoozl/${taskId}`)
  )
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
        s.repositories.some(
          (r) => r.toLowerCase() === String(repository).toLowerCase(),
        )),
  );
  return set?.id ?? null;
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

// ---------------------------------------------------------------------------
// No-fit decisions (§4.10 step 4, R41.8): one per task, closed by itself
// when a later evaluation fits.

export function openNoFit(store, task, result, { script }) {
  const current = store.get(DECISIONS, task.id);
  const text = result.removed
    .map((r) => `${r.crew ?? r.model}: ${r.by}`)
    .join("; ");
  if (current?.state === "open" && current.text === text) return [];
  store.transaction(() =>
    store.put(DECISIONS, {
      id: task.id,
      taskId: task.id,
      state: "open",
      why: result.why,
      removed: result.removed,
      text,
      openedAt:
        current?.state === "open" ? current.openedAt : new Date().toISOString(),
    }),
  );
  return script && current?.state !== "open"
    ? [
        {
          channel: "decision",
          task: task.id,
          title: `No crew fits ${task.id}`,
          text: `${result.why}. ${text}.`,
          resume:
            "Change the task's pin or needs, or a crew's tags in Settings › Routing; the task starts when it fits.",
        },
      ]
    : [];
}

export function closeNoFit(store, taskId) {
  const current = store.get(DECISIONS, taskId);
  if (current?.state !== "open") return;
  store.transaction(() =>
    store.put(DECISIONS, {
      ...current,
      state: "closed",
      closedAt: new Date().toISOString(),
    }),
  );
}

export const openNoFits = (store) =>
  store.list(DECISIONS).filter((d) => d.state === "open");

// ---------------------------------------------------------------------------
// Settings › Routing.

// What each crew's checks say now, for the crews list (§8.3).
function crewRows(ctx) {
  return ctx.crews.map((c) => {
    const local = c.id === LOCAL;
    return {
      id: c.id,
      name: c.name,
      tags: c.tags,
      trust: c.trust,
      gitHosts: c.gitHosts,
      chatLimit: c.chatLimit,
      chatLimitSet: c.chatLimitSet,
      running: c.running,
      configured: c.configured,
      delivery: c.delivery,
      sshHost: c.sshHost,
      worktreeRoot: c.worktreeRoot,
      ageSeconds: c.ageSeconds,
      reading: c.reading
        ? {
            source: c.reading.source,
            measuredAt: c.reading.measuredAt,
            memFreeGb: c.reading.memFreeGb,
            diskFreeGb: c.reading.diskFreeGb,
            loadPerCpu: c.reading.loadPerCpu,
          }
        : null,
      checks: [
        { check: "online", ok: c.available, why: c.why },
        {
          check: "ready",
          ok: c.ready === true,
          why:
            c.ready === true
              ? null
              : c.ready === false
                ? "would stall on tool approvals"
                : "approval mode unknown",
        },
        {
          check: "reach",
          ok: local || (ctx.remoteDispatch && c.gitHosts.length > 0),
          why: local
            ? null
            : !ctx.remoteDispatch
              ? "Kiro Crew's remote dispatch is off"
              : c.gitHosts.length
                ? null
                : "no git hosts set",
        },
      ],
    };
  });
}

export function routingView(store, data, options = {}) {
  const ctx = routingContext(store, options),
    providers = readProviders(store, {
      machineFile: machinePath(store, options) ?? undefined,
    }),
    batch = routerBatch(store);
  return {
    enabled: ctx.config.enabled,
    switchedOn: ctx.config.switchedOn,
    // The prompt is the person's: only a person's read carries it.
    prompt: options.person ? ctx.config.prompt : null,
    hasPrompt: Boolean(ctx.config.prompt.trim()),
    model: ctx.config.model,
    timeoutSeconds: ctx.config.timeoutSeconds,
    examples: PROMPT_EXAMPLES,
    machineHash: ctx.machine.hash ?? null,
    crews: crewRows(ctx),
    staleSeconds: ctx.machine.staleSeconds,
    models: ctx.models,
    providers: {
      lowPercent: providers.settings.lowPercent ?? null,
      defaultLowPercent: PROVIDER_DEFAULTS.lowPercent,
      limits: providers.settings.limits || {},
      hash: providers.hash,
      rows: providerFacts(store, ctx.health, { models: ctx.models }),
    },
    mc10: ctx.mc10,
    remoteDispatch: ctx.remoteDispatch,
    // The Remote relay (R41.16–R41.23): the setting, whether MC-10 makes it
    // ignored, the registered chat, and the relay's turns per day.
    relay: relayView(store, {
      setting: ctx.config.remoteRelay,
      mc10: ctx.mc10,
      now: ctx.now,
    }),
    lastCall: batch
      ? {
          id: batch.id,
          state: batch.state,
          tasks: batch.tasks?.length ?? 0,
          why: batch.why ?? null,
          openedAt: batch.openedAt,
          finishedAt: batch.finishedAt ?? null,
        }
      : null,
    noFit: openNoFits(store),
  };
}

// Preview (§8.3): a dry run on the current ready tasks. For each one, what
// the hard checks let through and what would happen; with the prompt on,
// the exact brief one routing call would get. It opens nothing, calls no
// agent and writes nothing.
export async function routingPreview(store, data, options = {}) {
  const ctx = routingContext(store, options);
  await fetchAll(store, ctx, { fetch: false });
  const projects = new Map(store.list("projects").map((p) => [p.id, p])),
    asked = [];
  const items = (options.readyCandidates ? options.readyCandidates() : []).map(
    (task) => {
      const project = projects.get(taskRepository(task)),
        checks = hardChecks(store, data, ctx, {
          task,
          role: "worker",
          project,
          policy: options.policy,
          skipModels: (
            options.policy?.repositories?.[taskRepository(task)]?.reviewers ??
            options.policy?.reviewers ??
            []
          )
            .filter((r) => r.distinctFrom === "model" && r.model)
            .map((r) => r.model),
        }),
        crews = [...checks.allowed, ...checks.busy],
        optionsFor = crews.flatMap((crew) =>
          checks.models.map((model) => ({ crew, model })),
        );
      let outcome;
      if (!checks.allowed.length && !checks.busy.length)
        outcome = { kind: "no-fit", text: "no crew passes the checks" };
      else if (!checks.models.length)
        outcome = { kind: "wait", text: "every model it may use is out" };
      else if (optionsFor.length === 1 || !ctx.config.enabled)
        outcome = {
          kind: "fixed",
          crew: ctx.config.enabled ? optionsFor[0].crew : fallbackCrew(crews),
          model:
            ctx.config.enabled || checks.pin.model
              ? optionsFor[0].model
              : (checks.kept ?? checks.defaults.model),
          text:
            checks.pin.crew || checks.pin.model
              ? "pinned in the manifest"
              : ctx.config.enabled
                ? "the only option that passed the checks"
                : "routing is off: local",
        };
      else {
        outcome = {
          kind: "agent",
          text: `the routing agent picks among ${optionsFor.length} options`,
        };
        asked.push({
          task: task.id,
          ...brief(task, data, checks),
          options: optionsFor,
        });
      }
      return {
        taskId: task.id,
        title: task.title,
        pin: checks.pin,
        needs: task.needs || [],
        options: optionsFor,
        removed: [
          ...checks.removed,
          ...checks.modelsRemoved.map((m) => ({ model: m.model, by: m.by })),
        ],
        outcome,
        noFit: outcome.kind === "no-fit",
      };
    },
  );
  return {
    enabled: ctx.config.enabled,
    mc10: ctx.mc10,
    items,
    brief: asked.length
      ? routerBrief({
          prompt: ctx.config.prompt,
          tasks: asked,
          ...routingFacts(store, ctx),
        })
      : null,
  };
}

const fallbackCrew = (crews) => (crews.includes(LOCAL) ? LOCAL : crews[0]);

// The facts one routing call gets (§4.10): each crew's checks and load,
// and each provider's health line. Read live.
export function routingFacts(store, ctx) {
  return {
    crews: ctx.crews.map((c) => ({
      crew: c.id,
      tags: c.tags,
      chats: `${c.running}/${c.chatLimit}`,
      online: c.available,
      ...(c.why ? { why: c.why } : {}),
      memFreeGb: c.reading?.memFreeGb ?? null,
      loadPerCpu: c.reading?.loadPerCpu ?? null,
    })),
    providers: providerFacts(store, ctx.health, { models: ctx.models }).map(
      (p) => p.line,
    ),
  };
}

// Writes go to this machine's file with an expected hash: the prompt may
// name private machines, so it never goes in a tracked file (R41.7).
// The one tracked key, routing.remoteRelay, goes to the workspace's
// .avoozl.json (R41.16).
export function updateRouting(settings, store, input = {}, options = {}) {
  const where = input.where ?? "machine";
  if (where === "workspace") {
    const routing = input.routing || {};
    if (Object.keys(routing).some((k) => k !== "remoteRelay"))
      fail(
        "The routing prompt is saved on this machine only (where: machine). The workspace holds only routing.remoteRelay.",
      );
    const before = settings.readFile();
    if (input.expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = settings.updateValue(before);
    if (Object.keys(routing).length) value.routing = routing;
    else delete value.routing;
    validateTrackedRouting(value);
    return { hash: settings.write(value, { expectedHash: before.hash }).hash };
  }
  if (where !== "machine")
    fail("The routing prompt is saved on this machine only (where: machine).");
  const file = machinePath(store, options);
  if (!file) fail("This workspace has no machine settings file.", 409);
  const routing = input.routing;
  if (routing !== null && routing !== undefined)
    validateRouting(routing, { tracked: false });
  return writeMachineFile(
    file,
    (value) => {
      if (routing && Object.keys(routing).length) value.routing = routing;
      else delete value.routing;
    },
    input.expectedHash,
  );
}

export function updateCrews(store, input = {}, options = {}) {
  const file = machinePath(store, options);
  if (!file) fail("This workspace has no machine settings file.", 409);
  const crews =
    input.crews === undefined ? undefined : crewSettingsInput(input.crews);
  const stale =
    input.staleSeconds === undefined
      ? undefined
      : staleSecondsInput(input.staleSeconds);
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
