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
import { PROJECT_SCOPE_FIX } from "./github-project.mjs";
import { AVOOZL_STATES } from "../delivery-lanes.mjs";
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

export const BOARD_VIEW = "Board by release";
export const TABLE_VIEW = "Table by wave";
export const STATE_VIEW = "Board by Avoozl state";
const SCOPES = ["repo", "read:org", "project"];
// A classic scope that includes another (GitHub's scope hierarchy).
const INCLUDED_BY = { "read:org": ["write:org", "admin:org"] };
// The first column is Ready; a board that already has Todo keeps it.
const STATUS = [
  ["todo", "Ready"],
  ["inProgress", "In progress"],
  ["done", "Done"],
  ["deferred", "Deferred"],
];
const STATUS_ALIASES = { todo: ["Todo"] };
const FIELDS = {
  status: "Status",
  release: "Release",
  wave: "Wave",
  iteration: "Iteration",
  avoozlState: "Avoozl state",
};
const LABEL_COLORS = {
  managed: "5319e7",
  responding: "1d76db",
  planning: "c5def5",
  ready: "0e8a16",
  stale: "fbca04",
  decision: "d93f0b",
};
// Requirement 33.6. `target` is the column or filter the API cannot read.
const WORKFLOWS = [
  ["Auto-add sub-issues to project", true, null],
  ["Auto-add to project", true, "filter is:issue label:{managed}"],
  ["Item added to project", true, "Status {todo}"],
  ["Pull request linked to issue", true, "Status {inProgress}"],
  ["Item closed", true, "Status {done}"],
  ["Pull request merged", true, "Status {done}"],
  ["Auto-close issue", true, null],
  ["Auto-archive items", false, null],
];
const DOCS = {
  workflows:
    "https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations",
  templates:
    "https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-project-templates-in-your-organization",
  scopes:
    "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps",
};
const STEPS = [
  ["token", "Token"],
  ["repository", "Mode and planning repository"],
  ["issues", "Issues"],
  ["project", "Project"],
  ["fields", "Fields"],
  ["views", "Views"],
  ["workflows", "Built-in workflows"],
  ["epic", "Epic issue type"],
  ["labels", "Managed labels"],
  ["settings", ".avoozl.json"],
];
const PROJECT_STEPS = new Set(["project", "fields", "views", "workflows"]);

const PROJECT_FIELDS = `fields(first:100){nodes{__typename ... on ProjectV2FieldCommon{id databaseId name dataType} ... on ProjectV2SingleSelectField{options{id name color description}}}}`;
const PROJECT_DETAIL = `query($id:ID!){node(id:$id){... on ProjectV2{id number title public url ${PROJECT_FIELDS} views(first:100){nodes{id number name layout}} workflows(first:100){nodes{id number name enabled}}}}}`;
const OWNER = `query($login:String!){repositoryOwner(login:$login){__typename id login ... on Organization{projectsV2(first:100){nodes{id number title public url}}} ... on User{projectsV2(first:100){nodes{id number title public url}}}}}`;

const lower = (value) => String(value).toLowerCase();
const unique = (values) => {
  const seen = new Map();
  for (const value of values)
    if (value && !seen.has(lower(value))) seen.set(lower(value), value);
  return [...seen.values()];
};
const permissionDenied = (error) =>
  error?.status === 401 || error?.status === 403;

// GraphQL with the error type kept: a FORBIDDEN or INSUFFICIENT_SCOPES error
// reads as HTTP 403, so the step reports a permission failure.
async function graphql(github, query, variables) {
  const result = await github.request("POST", "/graphql", {
    body: { query, variables },
  });
  if (result?.errors?.length) {
    const error = Error(result.errors.map((entry) => entry.message).join("; "));
    error.status = result.errors.some((entry) =>
      ["FORBIDDEN", "INSUFFICIENT_SCOPES"].includes(entry.type),
    )
      ? 403
      : result.errors.some((entry) => entry.type === "NOT_FOUND")
        ? 404
        : 502;
    throw error;
  }
  return result?.data;
}

const notFound = (promise) =>
  promise.catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });

// The wizard's input with defaults from the current `.avoozl.json` section.
export function setupRequest(input = {}, current = {}, milestones = []) {
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
  const issueRepositories = planning ? [planning] : repositories,
    project = input.project ?? {},
    currentProject = current.project ?? {},
    owner =
      project.owner ??
      currentProject.owner ??
      parseRepository(issueRepositories[0]).owner,
    number =
      project.number ?? (project.title ? null : currentProject.number) ?? null;
  if (number !== null && (!Number.isSafeInteger(number) || number < 1))
    fail("project.number must be a positive whole number.");
  const fields = { ...FIELDS, ...currentProject.fields, ...input.fields },
    iteration =
      input.iteration === true ||
      (input.iteration !== false && Boolean(currentProject.fields?.iteration));
  return {
    mode,
    planning,
    repositories,
    issueRepositories,
    project: { owner, number, title: project.title || "Avoozl" },
    fields: {
      status: fields.status || FIELDS.status,
      release: fields.release || FIELDS.release,
      wave: fields.wave || FIELDS.wave,
      iteration: iteration ? fields.iteration || FIELDS.iteration : null,
      avoozlState: fields.avoozlState || FIELDS.avoozlState,
    },
    statusValues: Object.fromEntries(
      STATUS.map(([key, name]) => [
        key,
        input.statusValues?.[key] ?? currentProject.statusValues?.[key] ?? name,
      ]),
    ),
    releases: unique([...milestones, ...(input.releases || [])]),
    tableByWave: input.tableByWave === true,
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
    owner: null,
    project: null,
    projectError: null,
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
  const owners = unique([
    ...request.issueRepositories.map((id) => parseRepository(id).owner),
    request.project.owner,
  ]);
  for (const owner of owners)
    try {
      const org = await notFound(
        github.request("GET", `/orgs/${encodeURIComponent(owner)}`),
      );
      state.ownerKinds[lower(owner)] = org ? "org" : "user";
    } catch (error) {
      state.ownerKinds[lower(owner)] = "unknown";
    }
  if (!missingScopes(state).includes("project"))
    await inspectProject(github, request, state);
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

async function inspectProject(github, request, state) {
  try {
    const data = await graphql(github, OWNER, {
        login: request.project.owner,
      }),
      owner = data?.repositoryOwner;
    if (!owner) throw Object.assign(Error("owner not found"), { status: 404 });
    state.owner = { id: owner.id, kind: owner.__typename, login: owner.login };
    const projects = owner.projectsV2?.nodes || [],
      found =
        request.project.number !== null
          ? projects.find((entry) => entry.number === request.project.number)
          : projects.find((entry) => entry.title === request.project.title);
    if (found) state.project = await projectDetail(github, found.id);
  } catch (error) {
    state.projectError = error;
  }
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

async function projectDetail(github, id) {
  const node = (await graphql(github, PROJECT_DETAIL, { id }))?.node;
  if (!node?.id) fail("GitHub returned invalid Project data.", 502);
  return {
    id: node.id,
    number: node.number,
    title: node.title,
    public: node.public === true,
    url: node.url || null,
    fields: (node.fields?.nodes || []).filter((field) => field?.id),
    views: node.views?.nodes || [],
    workflows: node.workflows?.nodes || null,
  };
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

// Options to add to a single-select field: each wanted name the field lacks,
// matched without case so "In Progress" maps "In progress". `aliases` names
// older option names that count as the wanted one (Status Todo for Ready).
function optionPlan(field, wanted, aliases = {}) {
  const existing = field?.options || [],
    names = new Map(existing.map((option) => [lower(option.name), option])),
    mapped = {},
    add = [];
  for (const [key, name] of wanted) {
    const match =
      names.get(lower(name)) ??
      (aliases[key] || [])
        .map((alias) => names.get(lower(alias)))
        .find(Boolean);
    if (match) mapped[key] = match.name;
    else {
      mapped[key] = name;
      if (!add.some((entry) => lower(entry) === lower(name))) add.push(name);
    }
  }
  return { mapped, add };
}

const aliasesOf = (key) => (key === "status" ? STATUS_ALIASES : {});

const fieldType = {
  status: "SINGLE_SELECT",
  release: "SINGLE_SELECT",
  wave: "NUMBER",
  iteration: "ITERATION",
  avoozlState: "SINGLE_SELECT",
};

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
    ctx = {
      repositories: {},
      project: state.project,
      statusValues: { ...request.statusValues },
      fallbacks: [],
      badFields: new Set(),
    };
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

  // 4 to 5c: the Project.
  if (missing.includes("project")) {
    for (const id of PROJECT_STEPS)
      block(
        id,
        "skipped",
        "The token lacks the project scope, so Avoozl makes no Project call.",
        PROJECT_SCOPE_FIX,
      );
  } else if (state.projectError) {
    const denied = permissionDenied(state.projectError);
    block(
      "project",
      "failed",
      `Could not read Projects of ${request.project.owner}: ${state.projectError.message}`,
      denied ? PROJECT_SCOPE_FIX : null,
    );
    for (const id of ["fields", "views", "workflows"])
      block(id, "skipped", "The Project could not be read.");
  } else if (!state.project && request.project.number !== null) {
    block(
      "project",
      "failed",
      `${request.project.owner} has no Project #${request.project.number} this token can see.`,
    );
    for (const id of ["fields", "views", "workflows"])
      block(id, "skipped", "The Project could not be read.");
  } else {
    planProject(github, request, state, { steps, ctx, write, note, block });
  }

  // 6 Epic issue type.
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

  // 7 Managed labels.
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

function planProject(
  github,
  request,
  state,
  { steps, ctx, write, note, block },
) {
  const project = state.project,
    owner = request.project.owner;
  if (project)
    note(
      "project",
      `Reusing #${project.number} ${project.title} (${project.public ? "public" : "private"}).`,
    );
  else {
    write(
      "project",
      {
        action: "create-project",
        object: "project",
        owner,
        name: request.project.title,
        visibility: "private",
        detail: "Create the Project, then set it private.",
      },
      async () => {
        const created = (
          await graphql(
            github,
            `
              mutation ($input: CreateProjectV2Input!) {
                createProjectV2(input: $input) {
                  projectV2 {
                    id
                    number
                    title
                    url
                    public
                  }
                }
              }
            `,
            {
              input: { ownerId: state.owner.id, title: request.project.title },
            },
          )
        )?.createProjectV2?.projectV2;
        if (!created?.id) fail("GitHub returned invalid Project data.", 502);
        // Whether a new Project starts private is not documented (L4).
        await graphql(
          github,
          `
            mutation ($input: UpdateProjectV2Input!) {
              updateProjectV2(input: $input) {
                projectV2 {
                  id
                  public
                }
              }
            }
          `,
          { input: { projectId: created.id, public: false } },
        );
        ctx.project = await projectDetail(github, created.id);
        ctx.created = created.id;
      },
    );
  }
  const fields = project?.fields || [],
    byName = (name) =>
      fields.find((field) => lower(field.name) === lower(name));
  const wrongType = (key, field) => {
    if (!field || field.dataType === fieldType[key]) return false;
    ctx.badFields.add(key);
    block(
      "fields",
      "failed",
      `Field ${field.name} is ${field.dataType}, not ${fieldType[key]}. Pick another name for ${key} and run the wizard again.`,
    );
    return true;
  };
  const after = ["project"];
  // Status, then Release: add missing options, keep every old one.
  const optionSteps = [
    ["status", STATUS.map(([key]) => [key, request.statusValues[key]])],
    ["avoozlState", AVOOZL_STATES.map(([key, name]) => [key, name])],
    ...(request.releases.length
      ? [["release", request.releases.map((name) => [name, name])]]
      : []),
  ];
  if (!request.releases.length)
    block(
      "fields",
      "missing",
      "No spec milestone names a release. Name a first release to create the Release field.",
    );
  for (const [key, wanted] of optionSteps) {
    const name = request.fields[key],
      field = byName(name);
    if (wrongType(key, field)) continue;
    const { mapped, add } = optionPlan(field, wanted, aliasesOf(key));
    if (key === "status") Object.assign(ctx.statusValues, mapped);
    if (field && !add.length) {
      note("fields", `${field.name} has every option.`);
      continue;
    }
    write(
      "fields",
      {
        action: field
          ? "add-options"
          : project
            ? "create-field"
            : "ensure-options",
        object: "field",
        owner,
        name,
        visibility: null,
        detail: field
          ? `Add options ${add.join(", ")}; keep ${field.options.map((o) => o.name).join(", ")}.`
          : project
            ? `Single-select with ${add.join(", ")}.`
            : `Add whichever of ${wanted.map(([, value]) => value).join(", ")} the new Project lacks${key === "status" ? `; its default Todo is renamed ${request.statusValues.todo}` : ""}.`,
      },
      () => ensureOptions(github, ctx, key, name, wanted),
      after,
    );
  }
  for (const key of ["wave", "iteration"]) {
    const name = request.fields[key];
    if (!name) continue;
    const field = byName(name);
    if (wrongType(key, field)) continue;
    if (field) {
      note("fields", `${field.name} exists.`);
      continue;
    }
    write(
      "fields",
      {
        action: "create-field",
        object: "field",
        owner,
        name,
        visibility: null,
        detail:
          key === "wave"
            ? "Number field."
            : "Iteration field, two weeks, starting today.",
      },
      () => createField(github, ctx, key, name),
      after,
    );
  }

  // 5b Views. No Roadmap: Avoozl sets no dates.
  const views = [
    [BOARD_VIEW, "board", "status", "release"],
    [STATE_VIEW, "board", "avoozlState", null],
    ...(request.tableByWave ? [[TABLE_VIEW, "table", null, "wave"]] : []),
  ];
  for (const [name, layout, columns, group] of views) {
    const view = project?.views.find(
      (entry) => lower(entry.name) === lower(name),
    );
    if (view) {
      note("views", `${view.name} exists.`);
      continue;
    }
    write(
      "views",
      {
        action: "create-view",
        object: "view",
        owner,
        name,
        visibility: null,
        detail:
          layout !== "board"
            ? `Table grouped by ${request.fields.wave}.`
            : group
              ? `Board, a column per ${request.fields.status}, grouped by ${request.fields.release}.`
              : `Board, a column per ${request.fields[columns]}.`,
      },
      () =>
        createView(github, ctx, request, state, {
          name,
          layout,
          columns: columns && request.fields[columns],
          group: group && request.fields[group],
        }),
      ["project"],
    );
  }
}

function fieldNode(created) {
  return created?.createProjectV2Field?.projectV2Field;
}

async function refreshFields(github, ctx) {
  const detail = await projectDetail(github, ctx.project.id);
  ctx.project = detail;
  return detail.fields;
}

// Adds each missing option. The field update replaces the whole list (L6),
// so every old option goes back with its own id, name, color and
// description; a re-read fails the step if any of them changed.
async function ensureOptions(github, ctx, key, name, wanted) {
  const fields = await refreshFields(github, ctx),
    field = fields.find((entry) => lower(entry.name) === lower(name));
  if (field && field.dataType !== fieldType[key])
    fail(
      `Field ${field.name} is ${field.dataType}, not ${fieldType[key]}.`,
      409,
    );
  // A Project this run made comes with GitHub's Todo: renamed to the first
  // column's name, since nobody uses it yet. An older Project keeps Todo.
  const own = key === "status" && field && ctx.created === ctx.project.id,
    { mapped, add } = optionPlan(field, wanted, own ? {} : aliasesOf(key)),
    todo = own
      ? field.options.find((option) => lower(option.name) === "todo")
      : null,
    rename = todo && add.includes(mapped.todo) ? mapped.todo : null;
  if (rename) add.splice(add.indexOf(rename), 1);
  if (key === "status") Object.assign(ctx.statusValues, mapped);
  if (field && !add.length && !rename) return;
  const fresh = add.map((option) => ({
    name: option,
    color: "GRAY",
    description: "",
  }));
  if (!field) {
    const created = fieldNode(
      await graphql(
        github,
        `
          mutation ($input: CreateProjectV2FieldInput!) {
            createProjectV2Field(input: $input) {
              projectV2Field {
                ... on ProjectV2FieldCommon {
                  id
                  name
                }
              }
            }
          }
        `,
        {
          input: {
            projectId: ctx.project.id,
            dataType: "SINGLE_SELECT",
            name,
            singleSelectOptions: fresh,
          },
        },
      ),
    );
    if (!created?.id) fail("GitHub returned invalid field data.", 502);
    await refreshFields(github, ctx);
    return;
  }
  const kept = field.options.map((option) => ({
    id: option.id,
    name: rename && option.id === todo.id ? rename : option.name,
    color: option.color,
    description: option.description ?? "",
  }));
  await graphql(
    github,
    `
      mutation ($input: UpdateProjectV2FieldInput!) {
        updateProjectV2Field(input: $input) {
          projectV2Field {
            ... on ProjectV2FieldCommon {
              id
            }
          }
        }
      }
    `,
    { input: { fieldId: field.id, singleSelectOptions: [...kept, ...fresh] } },
  );
  const after = (await refreshFields(github, ctx)).find(
    (entry) => entry.id === field.id,
  );
  for (const option of kept) {
    const now = after?.options?.find((entry) => entry.id === option.id);
    if (
      !now ||
      now.name !== option.name ||
      now.color !== option.color ||
      (now.description ?? "") !== option.description
    )
      fail(
        `GitHub changed option ${option.name} of ${field.name} while adding options. Check the field on GitHub.`,
        502,
      );
  }
}

async function createField(github, ctx, key, name) {
  const fields = await refreshFields(github, ctx),
    field = fields.find((entry) => lower(entry.name) === lower(name));
  if (field) {
    if (field.dataType !== fieldType[key])
      fail(
        `Field ${field.name} is ${field.dataType}, not ${fieldType[key]}.`,
        409,
      );
    return;
  }
  const input = { projectId: ctx.project.id, dataType: fieldType[key], name };
  if (key === "iteration")
    input.iterationConfiguration = {
      startDate: new Date().toISOString().slice(0, 10),
      duration: 14,
      iterations: [],
    };
  const created = fieldNode(
    await graphql(
      github,
      `
        mutation ($input: CreateProjectV2FieldInput!) {
          createProjectV2Field(input: $input) {
            projectV2Field {
              ... on ProjectV2FieldCommon {
                id
                name
              }
            }
          }
        }
      `,
      { input },
    ),
  );
  if (!created?.id) fail("GitHub returned invalid field data.", 502);
  await refreshFields(github, ctx);
}

// REST views take grouping (L7b, not yet proved live); GraphQL makes the
// view without it (L7a), and the grouping click goes on the checklist.
async function createView(github, ctx, request, state, view) {
  const project = ctx.project,
    fields = project.fields,
    id = (name) =>
      name
        ? fields.find((field) => lower(field.name) === lower(name))?.databaseId
        : undefined,
    kind = state.owner?.kind === "Organization" ? "orgs" : "users",
    base = `/${kind}/${encodeURIComponent(request.project.owner)}/projectsV2/${project.number}`,
    columns = id(view.columns),
    group = id(view.group);
  try {
    if ((view.group && !group) || (view.columns && !columns))
      throw Error("A grouping field is missing.");
    await github.request("POST", `${base}/views`, {
      body: {
        name: view.name,
        layout: view.layout,
        ...(columns ? { vertical_group_by: [columns] } : {}),
        ...(group ? { group_by: [group] } : {}),
      },
    });
    return;
  } catch {
    // Any REST failure falls back to GraphQL (404 was seen live, L7b).
  }
  const created = (
    await graphql(
      github,
      `
        mutation ($input: CreateProjectV2ViewInput!) {
          createProjectV2View(input: $input) {
            projectV2View {
              id
              number
              name
            }
          }
        }
      `,
      {
        input: {
          projectId: project.id,
          name: view.name,
          layout: view.layout === "board" ? "BOARD_LAYOUT" : "TABLE_LAYOUT",
        },
      },
    )
  )?.createProjectV2View?.projectV2View;
  ctx.fallbacks.push({
    view: view.name,
    group: view.group,
    // A board whose columns are not Status needs its column field set too.
    columns:
      view.columns && lower(view.columns) !== lower(request.fields.status)
        ? view.columns
        : null,
    number: created?.number ?? null,
  });
}

const fill = (text, values) =>
  text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key);

// What the API cannot do (L1–L13), each with a link.
function checklist(request, steps, ctx) {
  const project = ctx.project,
    url = project?.url || null,
    items = [];
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
  // Inferred, not proved live: GitHub's API makes the view but may not set
  // its grouping (L7b), so the one click is listed.
  for (const fallback of ctx.fallbacks)
    items.push({
      id: `group-${fallback.view}`,
      text: fallback.columns
        ? `In ${fallback.view}, set Column by to ${fallback.columns}, then Save. (Inferred: the API did not set it.)`
        : `In ${fallback.view}, Group by ${fallback.group}, then Save.`,
      link: url && fallback.number ? `${url}/views/${fallback.number}` : url,
      ...(fallback.columns ? { inferred: true } : {}),
    });
  if (steps.workflows.status === "ok") {
    const values = {
      ...ctx.statusValues,
      managed: request.labels[request.issueRepositories[0]]?.managed,
    };
    const listed = project?.workflows || null;
    if (!project || listed === null)
      steps.workflows.notes.push(
        "Workflows are read after the Project exists.",
      );
    for (const [name, on, target] of WORKFLOWS) {
      const found = listed?.find((entry) => lower(entry.name) === lower(name)),
        want = on ? "On" : "Off",
        where = target
          ? `, ${fill(target, values)} (check the column or filter)`
          : "";
      if (found && found.enabled === on && !target) continue;
      const text = !found
        ? `${name}: set ${want}${where}. Avoozl cannot read this workflow.`
        : found.enabled !== on
          ? `${name}: turn ${want}${where}.`
          : `${name} is ${want}${where}.`;
      items.push({
        id: `workflow-${lower(name).replace(/[^a-z0-9]+/g, "-")}`,
        text,
        link: url ? `${url}/workflows` : DOCS.workflows,
      });
    }
    for (const entry of listed || [])
      if (!WORKFLOWS.some(([name]) => lower(name) === lower(entry.name)))
        steps.workflows.notes.push(
          `${entry.name} is ${entry.enabled ? "on" : "off"}; Avoozl does not need it.`,
        );
  }
  items.push({
    id: "template",
    text: "Optional: apply a built-in template. Avoozl works without one.",
    link: DOCS.templates,
  });
  items.push({
    id: "roadmap",
    text: "Optional: add a Roadmap view later. It needs date fields, which Avoozl does not set.",
    link: url,
  });
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

// Step 8: the `.avoozl.json` change, written only through Settings.
function settingsProposal(request, settings, ctx, applied) {
  const before = settings.github || {},
    next = structuredClone(before);
  next.mode = request.mode;
  if (request.planning) next.planningRepository = request.planning;
  else delete next.planningRepository;
  if (ctx.project?.number) {
    // The preview names the fields the run will make; after the run, only
    // fields that exist.
    const fields = ctx.project.fields || [],
      has = (name) =>
        !applied || fields.some((field) => lower(field.name) === lower(name));
    next.project = {
      ...before.project,
      owner: request.project.owner,
      number: ctx.project.number,
      fields: Object.fromEntries(
        Object.entries(request.fields)
          .filter(([key, name]) => name && has(name) && !ctx.badFields.has(key))
          .map(([key, name]) => [
            key,
            fields.find((field) => lower(field.name) === lower(name))?.name ??
              name,
          ]),
      ),
      statusValues: { ...ctx.statusValues },
    };
  }
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

// `context` is {github, settings, milestones}; `settings` is the
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

export async function githubSetup(
  { github, settings, milestones = [] },
  input = {},
) {
  const request = setupRequest(input, settings.github || {}, milestones),
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
      project: request.project,
      fields: request.fields,
      releases: request.releases,
      tableByWave: request.tableByWave,
    },
    writes: previewWrites,
    previewHash,
    nothingToChange: previewWrites.length === 0,
    ...extra,
    steps: Object.values(plan.steps),
    checklist: checklist(request, plan.steps, plan.ctx),
    settings: settingsProposal(request, settings, plan.ctx, extra.applied),
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
            ? PROJECT_STEPS.has(entry.step)
              ? PROJECT_SCOPE_FIX
              : entry.step === "epic"
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
  // Read workflows on the Project as it is now; never written (L12).
  if (plan.ctx.project?.id && !failed.has("project"))
    try {
      plan.ctx.project = await projectDetail(github, plan.ctx.project.id);
    } catch {
      // The checklist then says the workflows could not be read.
    }
  cancelled.delete(previewHash);
  return view({ applied: true, results });
}
