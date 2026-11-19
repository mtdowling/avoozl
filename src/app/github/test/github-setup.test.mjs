// Task 3.18: the Set up GitHub wizard (design §8.2, Requirement 32). Fake
// GitHub only: a fetch that answers the REST and GraphQL calls the wizard
// makes and logs every write.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { cancelSetup, githubSetup } from "../github-setup.mjs";
import { groupedCall } from "../../mcp/mcp-tools.mjs";
import { Operations } from "../../api/operations.mjs";
import { fixture } from "../../test/fixtures.mjs";

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
      ["epic", "create-issue-type", "Epic"],
    ],
  );
  for (const write of preview.writes) {
    assert.ok(write.owner, "each write names its owner");
    assert.ok("visibility" in write);
    assert.equal(typeof write.run, "undefined");
  }
  assert.equal(preview.writes[0].visibility, "private");
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
  assert.ok(fake.state.issueTypes.example.some((type) => type.name === "Epic"));
  assert.equal(fake.state.labels["example/plans"], undefined, "no label");

  // The proposed .avoozl.json: valid.
  assert.equal(first.settings.error, null);
  assert.equal(first.settings.changed, true);
  assert.equal("project" in first.settings.github, false);
  assert.equal(first.settings.github.epicIssueType, "Epic");
  assert.equal(
    first.settings.github.repositories["example/app"].baseBranch,
    "trunk",
  );
  assert.equal(
    "managedLabels" in first.settings.github.repositories["example/plans"],
    false,
  );
  assert.match(first.settings.diff, /"role": "planning"/);
  assert.doesNotMatch(first.settings.diff, /"mode"/);

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

test("a permission failure in one step is reported while the others run", async () => {
  const fake = fakeGitHub({ repositories: APP, deny: ["epic"] }),
    result = await apply(fake, PLANS);
  assert.equal(step(result, "epic").status, "failed");
  assert.equal(step(result, "repository").status, "done");
});

test("single-repo mode turns issues on in each code repository", async () => {
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
    },
    preview = await run(fake, input, EMPTY_SETTINGS, []);
  assert.ok(
    !preview.writes.some((write) => write.action === "create-repository"),
  );
  assert.ok(!preview.writes.some((write) => write.action === "create-label"));
  const named = await apply(fake, input, EMPTY_SETTINGS, []);
  assert.equal(fake.state.repositories["example/app"].has_issues, true);
  assert.equal(named.settings.github.planningRepository, undefined);
  assert.equal(named.settings.error, null);
  // Onboarding sets up no triage (triage-agent TA12.1): no label anywhere,
  // and no triage key in the proposed .avoozl.json.
  assert.deepEqual(fake.state.labels, {});
  for (const entry of Object.values(named.settings.github.repositories))
    assert.equal("triage" in entry, false);
  assert.doesNotMatch(named.settings.diff, /triage/);
});

test("github.setup runs through Operations and its proposal saves through Settings", async (t) => {
  const { root, store } = fixture(t),
    fake = fakeGitHub({ repositories: APP }),
    ops = new Operations(store, { github: fake.github, workspaceRoot: root }),
    specs = path.join(root, ".kiro", "specs", "demo");
  // The apply makes over a dozen paced writes, one a second; the pacer's own
  // tests cover the waits, so this one skips sleeping through them.
  fake.github.pacer.sleep = async () => {};
  fs.mkdirSync(path.join(specs, "avoozl"), { recursive: true });
  fs.writeFileSync(path.join(specs, "requirements.md"), "# Requirements\n");
  fs.writeFileSync(path.join(specs, "design.md"), "# Design\n");
  fs.writeFileSync(
    path.join(specs, "tasks.md"),
    "- [ ] 1 First task\n  - $done: Works.\n  - $milestone: alpha\n",
  );
  const preview = await ops
    .execute("github.setup", { ...PLANS, mode: undefined })
    .catch((error) => error);
  assert.match(preview.message, /Choose plans-repo or single-repo/);
  const first = await ops.execute("github.setup", PLANS);
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
  assert.equal(saved.github.epicIssueType, "Epic");
  const again = await ops.execute("github.setup", PLANS);
  assert.equal(again.nothingToChange, true);
  assert.equal(again.settings.changed, false);
  assert.equal(
    groupedCall("plans_github", { action: "setup_preview" }).operation,
    "github.setup",
  );
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
  assert.ok(
    result.results.every((r) => r.reason === "Cancelled before this write."),
  );
  assert.equal(fake.log.length, 0, "no write reached GitHub");
  // A new preview clears the cancel, so the next apply runs.
  const again = await apply(fake, PLANS);
  assert.ok(again.results.every((r) => r.status === "done"));
  assert.throws(() => cancelSetup("../x"), /previewHash/);
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
