// Set up GitHub wizard (design §8.2, Requirement 32). One operation reads
// GitHub, builds one plan of writes, and returns it as a preview. A second
// call with `confirm` and the preview's hash rebuilds the plan, refuses it if
// GitHub changed, and runs it. Every step matches by name and adds only what
// is missing, so a finished setup previews as "Nothing to change". The
// wizard calls no delete endpoint and never renames, recolors, or changes the
// visibility of an object that exists. A step refused for permission is
// reported with its fix, and every step that does not need it still runs.
// The `.avoozl.json` change is only proposed here; the person saves it
// through `github.settings.update` (§4.4) after reviewing it.
import { digest } from "../model.mjs";
import { MANAGED_LABEL_KEYS, normalizeGitHubPolicy } from "./github-policy.mjs";
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

const SCOPES = ["repo", "read:org"];
// A classic scope that includes another (GitHub's scope hierarchy).
const INCLUDED_BY = { "read:org": ["write:org", "admin:org"] };
const LABEL_COLORS = {
  managed: "5319e7",
  responding: "1d76db",
  planning: "c5def5",
  ready: "0e8a16",
  stale: "fbca04",
  decision: "d93f0b",
};
const DOCS = {
  scopes:
    "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps",
};
const STEPS = [
  ["token", "Token"],
  ["repository", "Mode and planning repository"],
  ["issues", "Issues"],
  ["epic", "Epic issue type"],
  ["labels", "Managed labels"],
  ["settings", ".avoozl.json"],
];
const lower = (value) => String(value).toLowerCase();
const unique = (values) => {
  const seen = new Map();
  for (const value of values)
    if (value && !seen.has(lower(value))) seen.set(lower(value), value);
  return [...seen.values()];
};
const permissionDenied = (error) =>
  error?.status === 401 || error?.status === 403;

const notFound = (promise) =>
  promise.catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });

// The wizard's input with defaults from the current `.avoozl.json` section.
export function setupRequest(input = {}, current = {}) {
  const mode = input.mode ?? current.mode ?? null;
  if (mode !== "plans-repo" && mode !== "single-repo")
    fail("Choose plans-repo or single-repo mode.");
  const planning =
    mode === "plans-repo"
      ? parseRepository(
          input.planningRepository ?? current.planningRepository ?? "",
        ).id
      : null;
  const repositories = unique(
    (input.repositories ?? Object.keys(current.repositories || {})).map(
      (value) => parseRepository(value).id,
    ),
  ).filter((id) => lower(id) !== lower(planning ?? ""));
  if (mode === "single-repo" && !repositories.length)
    fail("Single-repo mode needs at least one code repository.");
  const issueRepositories = planning ? [planning] : repositories;
  return {
    mode,
    planning,
    repositories,
    issueRepositories,
    epic: input.epic !== false,
    epicIssueType: input.epicIssueType ?? current.epicIssueType ?? "Epic",
    labels: Object.fromEntries(
      issueRepositories.map((repository) => [
        repository,
        Object.fromEntries(
          MANAGED_LABEL_KEYS.map((key) => [
            key,
            input.managedLabels?.[key] ??
              current.repositories?.[repository]?.managedLabels?.[key] ??
              `avoozl:${key}`,
          ]),
        ),
      ]),
    ),
  };
}

// Reads only. Each read that fails is recorded on its step; nothing throws
// past this function except a request the wizard cannot interpret.
async function inspect(github, request) {
  const state = {
    login: null,
    scopes: null,
    tokenError: null,
    repositories: {},
    ownerKinds: {},
    issueTypes: {},
    labels: {},
  };
  try {
    const user = await github.request("GET", "/user", { headers: true });
    state.login = user.value?.login || null;
    state.scopes =
      typeof user.scopes === "string"
        ? user.scopes
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean)
        : null;
  } catch (error) {
    state.tokenError = error;
    return state;
  }
  for (const id of unique([request.planning, ...request.repositories]))
    try {
      state.repositories[id] = {
        value: await notFound(github.repository(id)),
      };
    } catch (error) {
      state.repositories[id] = { error };
    }
  const owners = unique(
    request.issueRepositories.map((id) => parseRepository(id).owner),
  );
  for (const owner of owners)
    try {
      const org = await notFound(
        github.request("GET", `/orgs/${encodeURIComponent(owner)}`),
      );
      state.ownerKinds[lower(owner)] = org ? "org" : "user";
    } catch (error) {
      state.ownerKinds[lower(owner)] = "unknown";
    }
  for (const id of request.issueRepositories) {
    const { owner } = parseRepository(id);
    if (state.ownerKinds[lower(owner)] === "org" && !state.issueTypes[owner])
      try {
        state.issueTypes[owner] = {
          value: await notFound(
            github.request(
              "GET",
              `/orgs/${encodeURIComponent(owner)}/issue-types`,
            ),
          ),
        };
      } catch (error) {
        state.issueTypes[owner] = { error };
      }
  }
  return state;
}

async function readLabels(github, state, request) {
  for (const id of request.issueRepositories) {
    if (!state.repositories[id]?.value) continue;
    const { owner, repo } = parseRepository(id);
    try {
      state.labels[id] = {
        value: await github.paginate(`/repos/${owner}/${repo}/labels`),
      };
    } catch (error) {
      state.labels[id] = { error };
    }
  }
}

function missingScopes(state) {
  if (!state.scopes) return [];
  const has = new Set(state.scopes);
  return SCOPES.filter(
    (scope) =>
      !has.has(scope) && !(INCLUDED_BY[scope] || []).some((s) => has.has(s)),
  );
}

const scopeFix = (scopes) => `gh auth refresh -s ${scopes.join(",")}`;

// The plan: steps with their findings, and writes, each a description the
// preview shows plus `run`, which the confirmed call executes.
function buildPlan(github, request, state) {
  const steps = Object.fromEntries(
      STEPS.map(([id, title]) => [
        id,
        { id, title, status: "ok", notes: [], reason: null, fix: null },
      ]),
    ),
    writes = [],
    ctx = { repositories: {} };
  const note = (step, text) => steps[step].notes.push(text);
  const block = (step, status, reason, fix = null) =>
    Object.assign(steps[step], { status, reason, fix });
  const write = (step, description, run, after = []) =>
    writes.push({ step, ...description, after, run });

  // 1 Token.
  if (state.tokenError) {
    block(
      "token",
      "failed",
      state.tokenError.message,
      "gh auth login, or set AVOOZL_GITHUB_TOKEN",
    );
    for (const [id] of STEPS.slice(1))
      block(id, "skipped", "The token could not be read.");
    return { steps, writes, ctx };
  }
  const missing = missingScopes(state);
  if (state.scopes === null)
    note(
      "token",
      "Fine-grained token: it lists no scopes, so each step finds out by reading.",
    );
  if (missing.length)
    block(
      "token",
      "missing",
      `The token lacks ${missing.join(", ")}.`,
      scopeFix(missing),
    );
  else note("token", `Signed in as ${state.login}.`);

  // 2 and 3: repositories and issues.
  for (const id of unique([request.planning, ...request.repositories])) {
    const found = state.repositories[id];
    if (found.error) {
      block("repository", "failed", `${id}: ${found.error.message}`);
      continue;
    }
    if (found.value) {
      ctx.repositories[id] = found.value;
      note(
        "repository",
        `${id} exists (${found.value.private ? "private" : "public"}).`,
      );
      const issues = id === request.planning || request.mode === "single-repo";
      if (issues && found.value.has_issues === false)
        write(
          "issues",
          {
            action: "enable-issues",
            object: "repository",
            owner: parseRepository(id).owner,
            name: id,
            visibility: found.value.private ? "private" : "public",
            detail: "Turn issues on.",
          },
          () => {
            const { owner, repo } = parseRepository(id);
            return github.request("PATCH", `/repos/${owner}/${repo}`, {
              body: { has_issues: true },
            });
          },
          ["repository"],
        );
      continue;
    }
    if (id !== request.planning) {
      block(
        "repository",
        "failed",
        `${id} does not exist or this token cannot see it. The wizard creates only the planning repository.`,
      );
      continue;
    }
    const { owner, repo } = parseRepository(id),
      kind = state.ownerKinds[lower(owner)];
    if (kind === "unknown") {
      block("repository", "failed", `Could not read the account ${owner}.`);
      continue;
    }
    if (kind === "user" && lower(owner) !== lower(state.login)) {
      block(
        "repository",
        "failed",
        `${owner} is another user's account; Avoozl can create a repository only for you or an organization.`,
      );
      continue;
    }
    write(
      "repository",
      {
        action: "create-repository",
        object: "repository",
        owner,
        name: id,
        visibility: "private",
        detail: "Create the planning repository with issues on.",
      },
      async () => {
        ctx.repositories[id] = await github.request(
          "POST",
          kind === "org"
            ? `/orgs/${encodeURIComponent(owner)}/repos`
            : "/user/repos",
          {
            body: {
              name: repo,
              private: true,
              has_issues: true,
              auto_init: true,
              description: "Avoozl plans",
            },
          },
        );
      },
    );
  }

  // 4 Epic issue type.
  if (!request.epic) block("epic", "skipped", "Not asked for.");
  else
    for (const id of request.issueRepositories) {
      const { owner } = parseRepository(id),
        kind = state.ownerKinds[lower(owner)];
      if (kind !== "org") {
        note("epic", `${owner} is not an organization; it has no issue types.`);
        continue;
      }
      const types = state.issueTypes[owner];
      if (types?.error) {
        block("epic", "failed", `${owner}: ${types.error.message}`);
        continue;
      }
      if (!types?.value) {
        note("epic", `${owner} has issue types turned off.`);
        continue;
      }
      const found = types.value.find(
        (type) => lower(type.name) === lower(request.epicIssueType),
      );
      if (found) {
        note("epic", `${owner} has ${found.name}.`);
        ctx.epic = found.name;
        continue;
      }
      if (state.scopes && !state.scopes.includes("admin:org")) {
        block(
          "epic",
          "skipped",
          `Creating an issue type in ${owner} needs an organization admin and the admin:org scope.`,
          "gh auth refresh -s admin:org",
        );
        continue;
      }
      if (
        writes.some(
          (entry) =>
            entry.action === "create-issue-type" && entry.owner === owner,
        )
      )
        continue;
      write(
        "epic",
        {
          action: "create-issue-type",
          object: "issue type",
          owner,
          name: request.epicIssueType,
          visibility: "organization",
          detail: "A large body of work split into sub-issues.",
        },
        async () => {
          await github.createIssueType(owner, {
            name: request.epicIssueType,
            description: "A large body of work split into sub-issues",
            color: "purple",
          });
          ctx.epic = request.epicIssueType;
        },
      );
    }

  // 5 Managed labels.
  for (const id of request.issueRepositories) {
    const names = request.labels[id],
      repository = state.repositories[id];
    if (!repository || repository.error) continue;
    const listed = state.labels[id];
    if (listed?.error) {
      block("labels", "failed", `${id}: ${listed.error.message}`);
      continue;
    }
    const existing = new Set(
      (listed?.value || []).map((label) => lower(label.name)),
    );
    for (const key of MANAGED_LABEL_KEYS) {
      const name = names[key];
      if (existing.has(lower(name))) continue;
      write(
        "labels",
        {
          action: "create-label",
          object: "label",
          owner: id,
          name,
          visibility:
            repository.value?.private === false ? "public" : "private",
          detail: `Managed label for ${key}.`,
        },
        () => {
          const { owner, repo } = parseRepository(id);
          return github
            .request("POST", `/repos/${owner}/${repo}/labels`, {
              body: {
                name,
                color: LABEL_COLORS[key],
                description: `Managed by Avoozl (${key})`,
              },
            })
            .catch((error) => {
              // A same-named label made since the preview is the same label.
              if (error.status !== 422) throw error;
            });
        },
        ["repository"],
      );
    }
  }
  for (const entry of writes)
    if (steps[entry.step].status === "ok") steps[entry.step].status = "change";
  return { steps, writes, ctx };
}

// The scope fixes the token needs, each with a link.
function checklist(steps) {
  const items = [];
  const fixes = new Set();
  for (const step of Object.values(steps))
    if (step.fix?.startsWith("gh ") && !fixes.has(step.fix)) {
      fixes.add(step.fix);
      items.push({
        id: `fix-${step.id}`,
        text: `Run ${step.fix}, then run Set up GitHub again.`,
        link: DOCS.scopes,
      });
    }
  return items;
}

// Line diff of two texts, for the `.avoozl.json` review.
function lineDiff(before, after) {
  const a = before.split("\n"),
    b = after.split("\n"),
    table = Array.from({ length: a.length + 1 }, () =>
      new Array(b.length + 1).fill(0),
    );
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
  const lines = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length)
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push("  " + a[i]);
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || table[i][j + 1] >= table[i + 1][j])
    ) {
      lines.push("+ " + b[j]);
      j += 1;
    } else {
      lines.push("- " + a[i]);
      i += 1;
    }
  return lines.join("\n");
}

// Step 6: the `.avoozl.json` change, written only through Settings.
function settingsProposal(request, settings, ctx) {
  const before = settings.github || {},
    next = structuredClone(before);
  next.mode = request.mode;
  if (request.planning) next.planningRepository = request.planning;
  else delete next.planningRepository;
  if (ctx.epic) next.epicIssueType = ctx.epic;
  const repositories = { ...before.repositories };
  for (const id of unique([
    ...request.issueRepositories,
    ...request.repositories,
  ])) {
    const entry = { ...repositories[id] };
    entry.baseBranch ??= ctx.repositories[id]?.default_branch || "main";
    if (request.labels[id])
      entry.managedLabels = { ...entry.managedLabels, ...request.labels[id] };
    repositories[id] = entry;
  }
  // A workspace with roles takes the mode from them (R105.8), so the mode
  // this run picks is written as roles on the entries too.
  if (Object.values(repositories).some((entry) => entry.role !== undefined))
    for (const [id, entry] of Object.entries(repositories))
      entry.role =
        request.mode === "single-repo"
          ? "both"
          : request.mode === "plans-repo"
            ? lower(id) === lower(request.planning || "")
              ? "planning"
              : "code"
            : "local";
  next.repositories = repositories;
  let error = null;
  try {
    normalizeGitHubPolicy(next);
  } catch (failure) {
    error = failure.message;
  }
  const from = JSON.stringify(before, null, 2),
    to = JSON.stringify(next, null, 2);
  return {
    filename: settings.filename,
    expectedHash: settings.hash,
    github: next,
    changed: from !== to,
    diff: from === to ? "" : lineDiff(from, to),
    error,
  };
}

const describe = (entry) => {
  const { run, after, ...rest } = entry;
  return rest;
};

// `context` is {github, settings}; `settings` is the
// github.settings.get view of `.avoozl.json`.
// Previews whose apply a person cancelled: the running apply stops before
// its next write and reports the rest as skipped.
const cancelled = new Set();
export function cancelSetup(previewHash) {
  if (
    typeof previewHash !== "string" ||
    !/^[0-9a-f]{16,128}$/.test(previewHash)
  )
    fail("Name the preview to cancel by its previewHash.");
  cancelled.add(previewHash);
  return { previewHash, cancelled: true };
}

export async function githubSetup({ github, settings }, input = {}) {
  const request = setupRequest(input, settings.github || {}),
    state = await inspect(github, request);
  await readLabels(github, state, request);
  const plan = buildPlan(github, request, state),
    previewWrites = plan.writes.map(describe),
    previewHash = digest(JSON.stringify(previewWrites));
  const view = (extra) => ({
    request: {
      mode: request.mode,
      planningRepository: request.planning,
      repositories: request.repositories,
    },
    writes: previewWrites,
    previewHash,
    nothingToChange: previewWrites.length === 0,
    ...extra,
    steps: Object.values(plan.steps),
    checklist: checklist(plan.steps),
    settings: settingsProposal(request, settings, plan.ctx),
  });
  // A fresh preview starts clean: an old cancel never skips a new apply.
  if (input.confirm !== true) {
    cancelled.delete(previewHash);
    return view({ applied: false });
  }
  if (input.previewHash !== previewHash)
    fail(
      "GitHub or the request changed since the preview. Preview again, then confirm.",
      409,
    );
  const failed = new Set(),
    results = [];
  for (const entry of plan.writes) {
    if (cancelled.has(previewHash)) {
      results.push({
        ...describe(entry),
        status: "skipped",
        reason: "Cancelled before this write.",
      });
      continue;
    }
    const blocked = entry.after.find((step) => failed.has(step));
    if (blocked) {
      results.push({
        ...describe(entry),
        status: "skipped",
        reason: `Needs the ${blocked} step.`,
      });
      continue;
    }
    try {
      await entry.run();
      results.push({ ...describe(entry), status: "done" });
      if (plan.steps[entry.step].status === "change")
        plan.steps[entry.step].status = "done";
    } catch (error) {
      failed.add(entry.step);
      const denied = permissionDenied(error);
      Object.assign(plan.steps[entry.step], {
        status: "failed",
        reason: error.message,
        fix:
          plan.steps[entry.step].fix ||
          (denied
            ? entry.step === "epic"
              ? "gh auth refresh -s admin:org (needs an organization admin)"
              : `Ask for write access to ${entry.owner}.`
            : null),
      });
      results.push({
        ...describe(entry),
        status: "failed",
        reason: error.message,
      });
    }
  }
  cancelled.delete(previewHash);
  return view({ applied: true, results });
}
