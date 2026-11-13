// Task 3.18: the Set up GitHub wizard (design §8.2, Requirement 32). Fake
// GitHub only: a fetch that answers the REST and GraphQL calls the wizard
// makes and logs every write.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import {
  BOARD_VIEW,
  STATE_VIEW,
  TABLE_VIEW,
  cancelSetup,
  githubSetup,
} from "../github-setup.mjs";
import { WORKSPACE_TOOLS } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const GRAPHQL_WRITES = [
  "createProjectV2(",
  "updateProjectV2(",
  "createProjectV2Field(",
  "updateProjectV2Field(",
  "createProjectV2View(",
];

const option = (id, name, color = "GRAY", description = "") => ({
  id,
  name,
  color,
  description,
});

// A Project as GitHub makes a blank one: Status with Todo, In Progress
// (capital P) and Done, and a few workflows already listed.
function blankProject(number, title, owner) {
  return {
    id: `PVT_${number}`,
    number,
    title,
    owner,
    public: true,
    url: `https://github.com/orgs/${owner}/projects/${number}`,
    fields: [
      { id: "F_title", databaseId: 1, name: "Title", dataType: "TITLE" },
      {
        id: "F_status",
        databaseId: 2,
        name: "Status",
        dataType: "SINGLE_SELECT",
        options: [
          option("o-todo", "Todo", "GREEN", "Not started"),
          option("o-progress", "In Progress", "YELLOW", "Working"),
          option("o-done", "Done", "PURPLE", "Finished"),
        ],
      },
    ],
    views: [{ id: "V_1", number: 1, name: "View 1", layout: "TABLE_LAYOUT" }],
    workflows: [
      { id: "W1", number: 1, name: "Item closed", enabled: true },
      { id: "W2", number: 2, name: "Pull request merged", enabled: true },
      { id: "W3", number: 3, name: "Auto-close issue", enabled: true },
      { id: "W4", number: 4, name: "Auto-archive items", enabled: true },
      { id: "W5", number: 5, name: "Auto-add to project", enabled: false },
    ],
  };
}

function fakeGitHub({
  login = "owner",
  scopes = "repo, read:org, project, admin:org",
  orgs = ["example"],
  repositories = {},
  projects = [],
  issueTypes = { example: [{ id: 1, name: "Task" }] },
  restViews = false,
  deny = [],
} = {}) {
  const state = {
      repositories: structuredClone(repositories),
      labels: {},
      projects: structuredClone(projects),
      issueTypes: structuredClone(issueTypes),
    },
    log = [];
  let nextProject = 10,
    nextId = 100;
  const denied = (what) => deny.includes(what);
  const reply = (status, value, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => (value === undefined ? "" : JSON.stringify(value)),
  });
  const forbidden = () => reply(403, { message: "Resource not accessible" });
  const project = (id) => state.projects.find((entry) => entry.id === id);
  const graphql = (query, variables) => {
    const write = GRAPHQL_WRITES.find((name) => query.includes(name));
    if (write) log.push({ method: "GRAPHQL", path: write, variables });
    if (/delete/i.test(query)) log.push({ method: "DELETE", path: query });
    const error = (type, message) => ({ errors: [{ type, message }] });
    if (query.includes("repositoryOwner(")) {
      const owner = variables.login,
        kind = orgs.includes(owner) ? "Organization" : "User";
      return {
        data: {
          repositoryOwner: {
            __typename: kind,
            id: "O_" + owner,
            login: owner,
            projectsV2: {
              nodes: state.projects
                .filter((entry) => entry.owner === owner)
                .map(({ id, number, title, url }) => ({
                  id,
                  number,
                  title,
                  url,
                  public: project(id).public,
                })),
            },
          },
        },
      };
    }
    if (query.includes("node(id:")) {
      const found = project(variables.id);
      return {
        data: {
          node: found && {
            ...found,
            fields: { nodes: structuredClone(found.fields) },
            views: { nodes: structuredClone(found.views) },
            workflows: { nodes: structuredClone(found.workflows) },
          },
        },
      };
    }
    const input = variables.input;
    if (write === "createProjectV2(") {
      if (denied("project")) return error("FORBIDDEN", "No project access.");
      const created = blankProject(
        nextProject++,
        input.title,
        input.ownerId.slice(2),
      );
      state.projects.push(created);
      return { data: { createProjectV2: { projectV2: created } } };
    }
    if (write === "updateProjectV2(") {
      project(input.projectId).public = input.public;
      return {
        data: { updateProjectV2: { projectV2: { id: input.projectId } } },
      };
    }
    if (write === "createProjectV2Field(") {
      if (denied("fields")) return error("FORBIDDEN", "No field access.");
      const found = project(input.projectId),
        field = {
          id: "F_" + nextId++,
          databaseId: nextId,
          name: input.name,
          dataType: input.dataType,
          ...(input.dataType === "SINGLE_SELECT"
            ? {
                options: input.singleSelectOptions.map((entry) => ({
                  id: "o-" + nextId++,
                  ...entry,
                })),
              }
            : {}),
        };
      found.fields.push(field);
      return { data: { createProjectV2Field: { projectV2Field: field } } };
    }
    if (write === "updateProjectV2Field(") {
      const field = state.projects
        .flatMap((entry) => entry.fields)
        .find((entry) => entry.id === input.fieldId);
      // GitHub replaces the list: an option sent without its id is new.
      field.options = input.singleSelectOptions.map((entry) => ({
        ...entry,
        id: entry.id || "o-" + nextId++,
      }));
      return { data: { updateProjectV2Field: { projectV2Field: field } } };
    }
    if (write === "createProjectV2View(") {
      const found = project(input.projectId),
        view = {
          id: "V_" + nextId++,
          number: found.views.length + 1,
          name: input.name,
          layout: input.layout,
        };
      found.views.push(view);
      return { data: { createProjectV2View: { projectV2View: view } } };
    }
    return error("UNKNOWN", "Unexpected query.");
  };
  const fetch = async (url, init) => {
    const method = init.method,
      pathname = decodeURIComponent(new URL(url).pathname),
      body = init.body ? JSON.parse(init.body) : undefined;
    if (method !== "GET" && pathname !== "/graphql")
      log.push({ method, path: pathname, body });
    if (pathname === "/graphql")
      return reply(200, graphql(body.query, body.variables));
    if (pathname === "/user")
      return reply(200, { login }, { "x-oauth-scopes": scopes });
    let match;
    if ((match = /^\/orgs\/([^/]+)$/.exec(pathname)))
      return orgs.includes(match[1])
        ? reply(200, { login: match[1] })
        : reply(404, { message: "Not Found" });
    if ((match = /^\/orgs\/([^/]+)\/issue-types$/.exec(pathname))) {
      const types = state.issueTypes[match[1]];
      if (!types) return reply(404, { message: "Not Found" });
      if (method === "GET") return reply(200, types);
      if (denied("epic")) return forbidden();
      const type = { id: nextId++, name: body.name, color: body.color };
      types.push(type);
      return reply(201, type);
    }
    if ((match = /^\/(orgs\/([^/]+)|user)\/repos$/.exec(pathname))) {
      if (denied("repository")) return forbidden();
      const owner = match[2] || login,
        id = `${owner}/${body.name}`;
      state.repositories[id] = {
        full_name: id,
        private: body.private,
        has_issues: body.has_issues,
        default_branch: "main",
      };
      return reply(201, state.repositories[id]);
    }
    if ((match = /^\/repos\/([^/]+\/[^/]+)\/labels$/.exec(pathname))) {
      const labels = (state.labels[match[1]] ||= []);
      if (method === "GET") return reply(200, labels);
      if (denied("labels")) return forbidden();
      if (
        labels.some(
          (label) => label.name.toLowerCase() === body.name.toLowerCase(),
        )
      )
        return reply(422, { message: "already_exists" });
      labels.push({ ...body });
      return reply(201, body);
    }
    if ((match = /^\/repos\/([^/]+\/[^/]+)$/.exec(pathname))) {
      const repository = state.repositories[match[1]];
      if (!repository) return reply(404, { message: "Not Found" });
      if (method === "PATCH") Object.assign(repository, body);
      return reply(200, repository);
    }
    if (
      (match = /^\/(orgs|users)\/([^/]+)\/projectsV2\/(\d+)\/views$/.exec(
        pathname,
      ))
    ) {
      if (!restViews) return reply(404, { message: "Not Found" });
      const found = state.projects.find(
          (entry) =>
            entry.owner === match[2] && entry.number === Number(match[3]),
        ),
        view = {
          id: "V_" + nextId++,
          number: found.views.length + 1,
          name: body.name,
          layout: body.layout.toUpperCase() + "_LAYOUT",
          group_by: body.group_by,
          vertical_group_by: body.vertical_group_by,
        };
      found.views.push(view);
      return reply(201, view);
    }
    return reply(404, { message: "Not Found " + pathname });
  };
  return {
    github: new GitHubClient({ token: "test", fetch }),
    state,
    log,
  };
}

const EMPTY_SETTINGS = {
  filename: ".avoozl.json",
  exists: false,
  hash: null,
  github: {},
};
const PLANS = {
  mode: "plans-repo",
  planningRepository: "example/plans",
  repositories: ["example/app"],
  project: { owner: "example", title: "Plans" },
};
const APP = {
  "example/app": {
    full_name: "example/app",
    private: true,
    has_issues: true,
    default_branch: "trunk",
  },
};

const run = (
  fake,
  input,
  settings = EMPTY_SETTINGS,
  milestones = ["one", "two"],
) => githubSetup({ github: fake.github, settings, milestones }, input);

async function apply(fake, input, settings, milestones) {
  const preview = await run(fake, input, settings, milestones);
  return run(
    fake,
    { ...input, confirm: true, previewHash: preview.previewHash },
    settings,
    milestones,
  );
}

const step = (result, id) => result.steps.find((entry) => entry.id === id);

// No delete, and no change to an existing object's name or settings: the
// only PATCH is turning issues on, and every option update resends the old
// options unchanged.
function assertNoDeleteOrRename(fake, before) {
  for (const entry of fake.log) {
    assert.notEqual(entry.method, "DELETE", JSON.stringify(entry));
    if (entry.method === "PATCH")
      assert.deepEqual(entry.body, { has_issues: true });
    if (entry.path === "updateProjectV2(")
      assert.deepEqual(Object.keys(entry.variables.input).sort(), [
        "projectId",
        "public",
      ]);
  }
  for (const entry of before.projects) {
    const after = fake.state.projects.find(
      (project) => project.id === entry.id,
    );
    assert.equal(after.title, entry.title);
    assert.equal(
      after.public,
      entry.public,
      "an existing Project keeps its visibility",
    );
    for (const field of entry.fields) {
      const now = after.fields.find((candidate) => candidate.id === field.id);
      assert.equal(now.name, field.name);
      assert.equal(now.dataType, field.dataType);
      for (const old of field.options || [])
        assert.deepEqual(
          now.options.find((candidate) => candidate.id === old.id),
          old,
        );
    }
    for (const view of entry.views)
      assert.deepEqual(
        after.views.find((candidate) => candidate.id === view.id),
        view,
      );
  }
}

test("the preview lists every write and writes nothing", async () => {
  const fake = fakeGitHub({ repositories: APP }),
    preview = await run(fake, PLANS);
  assert.equal(fake.log.length, 0);
  assert.equal(preview.applied, false);
  assert.equal(preview.nothingToChange, false);
  assert.deepEqual(
    preview.writes.map((write) => [write.step, write.action, write.name]),
    [
      ["repository", "create-repository", "example/plans"],
      ["project", "create-project", "Plans"],
      ["fields", "ensure-options", "Status"],
      ["fields", "ensure-options", "Avoozl state"],
      ["fields", "ensure-options", "Release"],
      ["fields", "create-field", "Wave"],
      ["views", "create-view", BOARD_VIEW],
      ["views", "create-view", STATE_VIEW],
      ["epic", "create-issue-type", "Epic"],
      ...[
        "avoozl:managed",
        "avoozl:responding",
        "avoozl:planning",
        "avoozl:ready",
        "avoozl:stale",
        "avoozl:decision",
      ].map((name) => ["labels", "create-label", name]),
    ],
  );
  for (const write of preview.writes) {
    assert.ok(write.owner, "each write names its owner");
    assert.ok("visibility" in write);
    assert.equal(typeof write.run, "undefined");
  }
  assert.equal(preview.writes[0].visibility, "private");
  assert.equal(preview.writes[1].visibility, "private");
  assert.ok(!preview.writes.some((write) => /roadmap/i.test(write.name)));
  assert.match(preview.previewHash, /^[0-9a-f]{64}$/);
});

test("confirming runs the preview; a second run changes nothing", async () => {
  const fake = fakeGitHub({ repositories: APP }),
    first = await apply(fake, PLANS);
  assert.equal(first.applied, true);
  assert.ok(
    first.results.every((result) => result.status === "done"),
    JSON.stringify(first.results),
  );
  const plans = fake.state.repositories["example/plans"];
  assert.deepEqual([plans.private, plans.has_issues], [true, true]);
  const project = fake.state.projects[0];
  assert.equal(project.public, false, "a new Project is set private");
  const status = project.fields.find((field) => field.name === "Status");
  // A Project the wizard made has nobody's Todo yet: it becomes Ready,
  // keeping its id and color.
  assert.deepEqual(
    status.options.map((entry) => [entry.id, entry.name, entry.color]),
    [
      ["o-todo", "Ready", "GREEN"],
      ["o-progress", "In Progress", "YELLOW"],
      ["o-done", "Done", "PURPLE"],
      [status.options[3].id, "Deferred", "GRAY"],
    ],
  );
  assert.deepEqual(
    project.fields
      .find((field) => field.name === "Avoozl state")
      .options.map((entry) => entry.name),
    [
      "Ready",
      "Running",
      "Reviewing",
      "Needs you",
      "Blocked or waiting",
      "Done",
      "Deferred",
    ],
  );
  assert.deepEqual(
    project.fields
      .find((field) => field.name === "Release")
      .options.map((entry) => entry.name),
    ["one", "two"],
  );
  assert.equal(
    project.fields.find((field) => field.name === "Wave").dataType,
    "NUMBER",
  );
  assert.ok(!project.fields.some((field) => field.name === "Iteration"));
  assert.deepEqual(
    project.views.map((view) => view.name),
    ["View 1", BOARD_VIEW, STATE_VIEW],
  );
  assert.ok(!project.views.some((view) => view.layout === "ROADMAP_LAYOUT"));
  assert.ok(fake.state.issueTypes.example.some((type) => type.name === "Epic"));
  assert.equal(fake.state.labels["example/plans"].length, 6);

  // The REST views call was refused, so grouping is a checklist click.
  const group = first.checklist.find(
    (item) => item.id === `group-${BOARD_VIEW}`,
  );
  assert.equal(group.text, `In ${BOARD_VIEW}, Group by Release, then Save.`);
  assert.equal(group.link, `${project.url}/views/2`);
  // The state board's columns are a field other than Status: one click,
  // marked Inferred until a live run shows the API cannot set it.
  const columns = first.checklist.find(
    (item) => item.id === `group-${STATE_VIEW}`,
  );
  assert.equal(
    columns.text,
    `In ${STATE_VIEW}, set Column by to Avoozl state, then Save. (Inferred: the API did not set it.)`,
  );
  assert.equal(columns.inferred, true);
  assert.equal(columns.link, `${project.url}/views/3`);

  // The proposed .avoozl.json: valid, with the mapped Status names.
  assert.equal(first.settings.error, null);
  assert.equal(first.settings.changed, true);
  assert.deepEqual(first.settings.github.project, {
    owner: "example",
    number: project.number,
    fields: {
      status: "Status",
      release: "Release",
      wave: "Wave",
      avoozlState: "Avoozl state",
    },
    statusValues: {
      todo: "Ready",
      inProgress: "In Progress",
      done: "Done",
      deferred: "Deferred",
    },
  });
  assert.equal(first.settings.github.epicIssueType, "Epic");
  assert.equal(
    first.settings.github.repositories["example/app"].baseBranch,
    "trunk",
  );
  assert.equal(
    first.settings.github.repositories["example/plans"].managedLabels.ready,
    "avoozl:ready",
  );
  assert.match(first.settings.diff, /^\+ {3}"mode": "plans-repo",$/m);

  const writes = fake.log.length,
    saved = {
      ...EMPTY_SETTINGS,
      exists: true,
      hash: "h",
      github: first.settings.github,
    },
    again = await run(fake, PLANS, saved);
  assert.equal(again.nothingToChange, true);
  assert.deepEqual(again.writes, []);
  assert.equal(again.settings.changed, false);
  const confirmed = await run(
    fake,
    { ...PLANS, confirm: true, previewHash: again.previewHash },
    saved,
  );
  assert.deepEqual(confirmed.results, []);
  assert.equal(fake.log.length, writes, "the rerun made no write");
});

test("existing Status options keep their ids, colors and names", async () => {
  const existing = blankProject(7, "Board", "example");
  existing.public = false;
  existing.fields.push({
    id: "F_release",
    databaseId: 9,
    name: "Release",
    dataType: "SINGLE_SELECT",
    options: [option("r-one", "one", "BLUE", "First")],
  });
  const fake = fakeGitHub({
      repositories: {
        ...APP,
        "example/plans": {
          private: true,
          has_issues: false,
          default_branch: "main",
        },
      },
      projects: [existing],
    }),
    before = structuredClone(fake.state),
    input = {
      ...PLANS,
      project: { owner: "example", number: 7 },
      iteration: true,
      tableByWave: true,
    },
    preview = await run(fake, input);
  assert.deepEqual(
    preview.writes
      .filter((write) => write.step !== "labels")
      .map((write) => [write.action, write.name]),
    [
      ["enable-issues", "example/plans"],
      ["add-options", "Status"],
      ["create-field", "Avoozl state"],
      ["add-options", "Release"],
      ["create-field", "Wave"],
      ["create-field", "Iteration"],
      ["create-view", BOARD_VIEW],
      ["create-view", STATE_VIEW],
      ["create-view", TABLE_VIEW],
      ["create-issue-type", "Epic"],
    ],
  );
  // An older board keeps its Todo as the first column: no Ready is added.
  assert.match(
    preview.writes[1].detail,
    /^Add options Deferred; keep Todo, In Progress, Done/,
  );
  const applied = await apply(fake, input);
  assertNoDeleteOrRename(fake, before);
  assert.equal(applied.settings.github.project.statusValues.todo, "Todo");
  const fields = fake.state.projects[0].fields;
  assert.deepEqual(
    fields
      .find((field) => field.name === "Release")
      .options.map((entry) => entry.name),
    ["one", "two"],
  );
  assert.equal(
    fields.find((field) => field.name === "Iteration").dataType,
    "ITERATION",
  );
  assert.equal(fake.state.repositories["example/plans"].has_issues, true);
});

test("a same-named field of the wrong kind is reported and left alone", async () => {
  const existing = blankProject(7, "Board", "example");
  existing.fields.push({
    id: "F_text",
    databaseId: 9,
    name: "Release",
    dataType: "TEXT",
  });
  const fake = fakeGitHub({ repositories: APP, projects: [existing] }),
    before = structuredClone(fake.state),
    input = { ...PLANS, project: { owner: "example", number: 7 } },
    result = await apply(fake, input);
  assert.equal(step(result, "fields").status, "failed");
  assert.match(
    step(result, "fields").reason,
    /Release is TEXT, not SINGLE_SELECT/,
  );
  assert.ok(!result.writes.some((write) => write.name === "Release"));
  assert.ok(!("release" in result.settings.github.project.fields));
  assertNoDeleteOrRename(fake, before);
  assert.equal(
    fake.state.projects[0].public,
    true,
    "a public Project is reused as is",
  );
  assert.match(step(result, "project").notes[0], /\(public\)/);
});

test("REST views with grouping leave no grouping click", async () => {
  const fake = fakeGitHub({ repositories: APP, restViews: true }),
    result = await apply(fake, { ...PLANS, tableByWave: true });
  assert.ok(!result.checklist.some((item) => item.id.startsWith("group-")));
  const project = fake.state.projects[0],
    board = project.views.find((view) => view.name === BOARD_VIEW),
    status = project.fields.find((field) => field.name === "Status"),
    release = project.fields.find((field) => field.name === "Release");
  assert.deepEqual(board.vertical_group_by, [status.databaseId]);
  assert.deepEqual(board.group_by, [release.databaseId]);
  assert.equal(board.layout, "BOARD_LAYOUT");
  // Board by Avoozl state: a column per Avoozl state, no swimlanes.
  const states = project.views.find((view) => view.name === STATE_VIEW),
    state = project.fields.find((field) => field.name === "Avoozl state");
  assert.deepEqual(states.vertical_group_by, [state.databaseId]);
  assert.equal(states.group_by, undefined);
  assert.equal(states.layout, "BOARD_LAYOUT");
  assert.equal(
    project.views.find((view) => view.name === TABLE_VIEW).layout,
    "TABLE_LAYOUT",
  );
});

test("a permission failure in one step is reported while the others run", async () => {
  const fake = fakeGitHub({ repositories: APP, deny: ["labels"] }),
    result = await apply(fake, PLANS);
  const labels = step(result, "labels");
  assert.equal(labels.status, "failed");
  assert.match(labels.reason, /not accessible/);
  assert.equal(labels.fix, "Ask for write access to example/plans.");
  for (const id of ["repository", "project", "fields", "views", "epic"])
    assert.equal(step(result, id).status, "done", id);
  // One refused label does not stop the next one in the same step.
  assert.equal(
    result.results.filter(
      (entry) => entry.step === "labels" && entry.status === "failed",
    ).length,
    6,
  );
  assert.ok(
    fake.state.projects[0].views.some((view) => view.name === BOARD_VIEW),
  );

  const project = fakeGitHub({ repositories: APP, deny: ["project"] }),
    refused = await apply(project, PLANS);
  assert.equal(step(refused, "project").status, "failed");
  assert.equal(step(refused, "project").fix, "gh auth refresh -s project");
  assert.ok(
    refused.results
      .filter((entry) => ["fields", "views"].includes(entry.step))
      .every((entry) => entry.status === "skipped"),
  );
  assert.equal(step(refused, "labels").status, "done");
  assert.equal(step(refused, "epic").status, "done");
});

test("without the project scope the wizard makes no Project call and shows the fix", async () => {
  const fake = fakeGitHub({ repositories: APP, scopes: "repo, read:org" }),
    result = await apply(fake, PLANS);
  assert.ok(
    !fake.log.some((entry) => entry.method === "GRAPHQL"),
    "no Project write",
  );
  assert.equal(step(result, "token").status, "missing");
  assert.equal(step(result, "token").fix, "gh auth refresh -s project");
  for (const id of ["project", "fields", "views", "workflows"]) {
    assert.equal(step(result, id).status, "skipped");
    assert.equal(step(result, id).fix, "gh auth refresh -s project");
  }
  assert.equal(step(result, "repository").status, "done");
  assert.equal(step(result, "labels").status, "done");
  // admin:org is missing too, so the Epic type is skipped with its fix.
  assert.equal(step(result, "epic").status, "skipped");
  assert.equal(step(result, "epic").fix, "gh auth refresh -s admin:org");
  assert.deepEqual(
    result.checklist
      .filter((item) => item.id.startsWith("fix-"))
      .map((item) => item.text),
    [
      "Run gh auth refresh -s project, then run Set up GitHub again.",
      "Run gh auth refresh -s admin:org, then run Set up GitHub again.",
    ],
  );
  assert.equal(result.settings.github.project, undefined);
});

test("the checklist lists each workflow that differs and every column it cannot read", async () => {
  const existing = blankProject(7, "Board", "example");
  existing.public = false;
  const fake = fakeGitHub({ repositories: APP, projects: [existing] }),
    result = await run(fake, {
      ...PLANS,
      project: { owner: "example", number: 7 },
    });
  const text = result.checklist.map((item) => item.text);
  assert.ok(text.includes("Auto-archive items: turn Off."));
  assert.ok(
    text.includes(
      "Auto-add to project: turn On, filter is:issue label:avoozl:managed (check the column or filter).",
    ),
  );
  assert.ok(
    text.includes(
      "Item closed is On, Status Done (check the column or filter).",
    ),
  );
  assert.ok(
    text.includes(
      "Auto-add sub-issues to project: set On. Avoozl cannot read this workflow.",
    ),
  );
  assert.ok(
    text.includes(
      "Item added to project: set On, Status Todo (check the column or filter). Avoozl cannot read this workflow.",
    ),
  );
  assert.ok(
    !text.some((line) => line.startsWith("Auto-close issue")),
    "Auto-close is already on",
  );
  for (const item of result.checklist.filter((entry) =>
    entry.id.startsWith("workflow-"),
  ))
    assert.equal(item.link, `${existing.url}/workflows`);
  assert.ok(result.checklist.some((item) => item.id === "template"));
  assert.ok(result.checklist.some((item) => item.id === "roadmap"));
  assert.ok(!result.writes.some((write) => /workflow/i.test(write.object)));
});

test("a confirm with a stale preview hash is refused and writes nothing", async () => {
  const fake = fakeGitHub({ repositories: APP }),
    preview = await run(fake, PLANS);
  fake.state.labels["example/plans"] = [];
  fake.state.repositories["example/plans"] = {
    private: true,
    has_issues: true,
  };
  await assert.rejects(
    run(fake, { ...PLANS, confirm: true, previewHash: preview.previewHash }),
    (error) => error.status === 409 && /Preview again/.test(error.message),
  );
  assert.equal(fake.log.length, 0);
});

test("single-repo mode turns issues on and labels each code repository", async () => {
  const fake = fakeGitHub({
      repositories: {
        "example/app": {
          private: false,
          has_issues: false,
          default_branch: "main",
        },
        "example/lib": {
          private: true,
          has_issues: true,
          default_branch: "main",
        },
      },
    }),
    input = {
      mode: "single-repo",
      repositories: ["example/app", "example/lib"],
      project: { owner: "example", title: "Code" },
    },
    preview = await run(fake, input, EMPTY_SETTINGS, []);
  assert.ok(
    !preview.writes.some((write) => write.action === "create-repository"),
  );
  assert.ok(!preview.writes.some((write) => write.name === "Release"));
  assert.equal(step(preview, "fields").status, "missing");
  assert.match(step(preview, "fields").reason, /Name a first release/);
  assert.equal(
    preview.writes.find(
      (write) =>
        write.action === "create-label" && write.owner === "example/app",
    ).visibility,
    "public",
  );
  const named = await apply(
    fake,
    { ...input, releases: ["first"] },
    EMPTY_SETTINGS,
    [],
  );
  assert.equal(fake.state.repositories["example/app"].has_issues, true);
  assert.equal(fake.state.labels["example/app"].length, 6);
  assert.equal(fake.state.labels["example/lib"].length, 6);
  assert.equal(named.settings.github.planningRepository, undefined);
  assert.equal(named.settings.error, null);
});

test("github.setup runs through Operations and its proposal saves through Settings", async (t) => {
  const { root, store } = fixture(t),
    fake = fakeGitHub({ repositories: APP }),
    ops = new Operations(store, { github: fake.github, workspaceRoot: root }),
    specs = path.join(root, ".kiro", "specs", "demo");
  fs.mkdirSync(path.join(specs, "avoozl"), { recursive: true });
  fs.writeFileSync(path.join(specs, "requirements.md"), "# Requirements\n");
  fs.writeFileSync(path.join(specs, "design.md"), "# Design\n");
  fs.writeFileSync(path.join(specs, "tasks.md"), "- [ ] 1 First task\n");
  fs.writeFileSync(
    path.join(specs, "avoozl", "manifest.json"),
    JSON.stringify({
      tasks: {
        1: { kind: "leaf", acceptance: ["Works."], milestone: "alpha" },
      },
    }),
  );
  const preview = await ops
    .execute("github.setup", {
      ...PLANS,
      mode: undefined,
      project: { owner: "example", title: "Plans" },
    })
    .catch((error) => error);
  assert.match(preview.message, /Choose plans-repo or single-repo/);
  const first = await ops.execute("github.setup", PLANS);
  assert.deepEqual(
    first.request.releases,
    ["alpha"],
    "Release comes from spec milestones",
  );
  const applied = await ops.execute("github.setup", {
    ...PLANS,
    confirm: true,
    previewHash: first.previewHash,
  });
  await ops.execute("github.settings.update", {
    github: applied.settings.github,
    expectedHash: applied.settings.expectedHash,
  });
  const saved = await ops.execute("github.settings.get");
  assert.equal(saved.error, null);
  assert.equal(saved.github.project.number, fake.state.projects[0].number);
  const again = await ops.execute("github.setup", PLANS);
  assert.equal(again.nothingToChange, true);
  assert.equal(again.settings.changed, false);
  assert.ok(WORKSPACE_TOOLS.some((tool) => tool.name === "plans_github_setup"));
});

test("Cancel during apply stops before the next write and reports the rest", async () => {
  const fake = fakeGitHub({ repositories: APP }),
    preview = await run(fake, PLANS);
  assert.ok(preview.writes.length > 1);
  const applying = run(fake, {
    ...PLANS,
    confirm: true,
    previewHash: preview.previewHash,
  });
  cancelSetup(preview.previewHash);
  const result = await applying;
  assert.equal(result.applied, true);
  assert.ok(result.results.every((r) => r.status === "skipped"));
  assert.ok(result.results.every((r) => r.reason === "Cancelled before this write."));
  assert.equal(fake.log.length, 0, "no write reached GitHub");
  // A new preview clears the cancel, so the next apply runs.
  const again = await apply(fake, PLANS);
  assert.ok(again.results.every((r) => r.status === "done"));
  assert.throws(() => cancelSetup("../x"), /previewHash/);
});

test("an Avoozl state field missing options gets them; its old ones stay", async () => {
  const existing = blankProject(7, "Board", "example");
  existing.public = false;
  existing.fields.push({
    id: "F_state",
    databaseId: 12,
    name: "Avoozl state",
    dataType: "SINGLE_SELECT",
    options: [option("s-ready", "Ready", "BLUE"), option("s-old", "Parked")],
  });
  const fake = fakeGitHub({ repositories: APP, projects: [existing] }),
    before = structuredClone(fake.state),
    input = { ...PLANS, project: { owner: "example", number: 7 } },
    preview = await run(fake, input),
    write = preview.writes.find((entry) => entry.name === "Avoozl state");
  assert.equal(write.action, "add-options");
  assert.match(
    write.detail,
    /^Add options Running, Reviewing, Needs you, Blocked or waiting, Done, Deferred; keep Ready, Parked\.$/,
  );
  await apply(fake, input);
  assertNoDeleteOrRename(fake, before);
  const again = await run(fake, input);
  assert.ok(!again.writes.some((entry) => entry.name === "Avoozl state"));
  assert.ok(
    step(again, "fields").notes.includes("Avoozl state has every option."),
  );
});

test("Cancel before Apply writes nothing", async () => {
  const fake = fakeGitHub({ repositories: APP }),
    preview = await run(fake, PLANS);
  cancelSetup(preview.previewHash);
  assert.equal(fake.log.length, 0);
  // Checking again after a cancel still only reads.
  await run(fake, PLANS);
  assert.equal(fake.log.length, 0);
});
