// Demo mode (design §6.11): a made-up sample workspace, a fake GitHub, and a
// gate that turns every change into a sentence saying what would happen.
// The sample lives in its own temporary folder. It is built once, in a
// staging folder beside it, and appears only when a rename moves the whole
// folder into place, so a failed build leaves nothing behind. Nothing here
// opens, reads or writes the person's own workspaces or machine settings.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "./store.mjs";
import { Operations } from "./operations.mjs";
import { workspaceConfig } from "./config.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import { captureIdea } from "./ideas.mjs";
import { recordActivity } from "./activity-log.mjs";
import { Lessons, lessonsPath, writeLesson } from "./lessons.mjs";
import { emptySnapshot } from "./workspace.mjs";

// The page's workspace ID for the sample. A catalog ID must start with a
// letter (host-config.mjs), so no real workspace can have this one.
export const DEMO_WORKSPACE_ID = "@demo";
export const DEMO_RECEIPT = "demo:sample";
export const DEMO_VERSION = 1;
export const DEMO_NAME = "Demo: Recipe Box";
export const DEMO_REPOSITORY = "example/recipe-box";
const OWNER = "Demo owner";

// The default sample folder: one per user, under the system temp folder.
export function defaultDemoRoot(tmp = os.tmpdir()) {
  let user = "user";
  try {
    user = os.userInfo().username.replace(/[^A-Za-z0-9_-]/g, "") || user;
  } catch {
    // No user record (some containers): one shared name is fine.
  }
  return path.join(tmp, `avoozl-demo-${user}`);
}

// The sample's own paths. Machine settings (plugins, driver, lessons) live
// inside it too, so nothing reaches the person's settings folder.
export function demoPaths(root) {
  return {
    root,
    settings: path.join(root, ".avoozl", "demo-machine"),
    pluginSettingsFile: path.join(
      root,
      ".avoozl",
      "demo-machine",
      "plugins.json",
    ),
  };
}

// The sample's workspace configuration. Its home is the sample folder, so
// no machine-wide Avoozl settings are read into it.
export function demoConfig(root) {
  return workspaceConfig({
    workspace: root,
    home: root,
    env: { AVOOZL_WORKSPACE: root },
  });
}

// The install receipt, or null when the folder holds no finished sample.
export function demoReceipt(root) {
  const config = demoConfig(root);
  if (!fs.existsSync(config.dbPath)) return null;
  const store = new Store(config.dbPath);
  try {
    return store.get("receipts", DEMO_RECEIPT) || null;
  } finally {
    store.close();
  }
}

// Install the sample once. A finished sample is returned as it is, edits
// and all; only a missing one is built. Returns {root, receipt, existing}.
// `build` is the sample builder; tests pass one that fails part way.
export async function installDemo(
  root = defaultDemoRoot(),
  { now = Date.now(), build = buildDemo } = {},
) {
  const existing = demoReceipt(root);
  if (existing) return { root, receipt: existing, existing: true };
  if (fs.existsSync(root))
    throw Object.assign(
      Error(
        `${root} exists but holds no finished demo. Move it away, then start the demo again.`,
      ),
      { status: 409 },
    );
  fs.mkdirSync(path.dirname(root), { recursive: true });
  const staging = fs.mkdtempSync(`${root}.staging-`);
  try {
    await build(staging, { finalRoot: root, now });
    try {
      fs.renameSync(staging, root);
    } catch (error) {
      // Another start won the race: keep its sample, drop this one.
      const raced = demoReceipt(root);
      if (!raced) throw error;
      fs.rmSync(staging, { recursive: true, force: true });
      return { root, receipt: raced, existing: true };
    }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { root, receipt: demoReceipt(root), existing: false };
}

// --- Fake GitHub ------------------------------------------------------------

const ISSUE = (number, title, state, extra = {}) => ({
  number,
  title,
  state,
  html_url: `https://github.com/${DEMO_REPOSITORY}/issues/${number}`,
  url: `https://api.github.com/repos/${DEMO_REPOSITORY}/issues/${number}`,
  body: "Made-up issue for the Avoozl demo.",
  labels: [],
  assignees: [{ login: "demo-owner" }],
  user: { login: "demo-owner" },
  updated_at: "2026-01-05T10:00:00Z",
  created_at: "2026-01-02T10:00:00Z",
  ...extra,
});
const PULL = (number, title, head, checks, state = "open") => ({
  number,
  title,
  state,
  merged: state === "merged",
  html_url: `https://github.com/${DEMO_REPOSITORY}/pull/${number}`,
  head: { ref: head, sha: `${number}`.repeat(40).slice(0, 40) },
  base: { ref: "main" },
  checks,
});

// Leaf titles, from the sample specs' tasks.md.
const LEAF_TITLES = {
  "recipe-import.1.1": "Import a recipe from a link",
  "recipe-import.1.2": "Parse ingredients into lines",
  "recipe-import.2.1": "Show import errors in plain words",
  "recipe-import.2.2": "Check the import on a phone",
  "meal-planner.1.1": "Week grid for the meal planner",
  "meal-planner.1.2": "Drag a recipe onto a day",
  "meal-planner.2.1": "Share the week with a link",
  "shopping-list.1.1": "Build the shopping list",
  "shopping-list.1.2": "Merge the same ingredient",
  "shopping-list.2.1": "Tick items off in the shop",
};
const DONE = new Set(["recipe-import.1.1", "recipe-import.1.2"]);
// Each pull request's checks: passing, failing, and still running.
const CHECKS = {
  20: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }],
  21: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }],
  22: [
    { name: "test", status: "COMPLETED", conclusion: "FAILURE" },
    { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
  ],
  23: [{ name: "test", status: "IN_PROGRESS", conclusion: null }],
};

// What the fake GitHub holds: an epic issue with one sub-issue per leaf, a
// Project, pull requests and their checks, and two issues for Intake.
// Every name is made up.
export function demoGitHubData() {
  const issues = [
    ISSUE(1, "Recipe Box: first release", "open", {
      labels: [{ name: "epic" }],
    }),
    ...Object.entries(DEMO_LINKS).map(([taskId, link]) =>
      ISSUE(
        link.issue,
        LEAF_TITLES[taskId],
        DONE.has(taskId) ? "closed" : "open",
        { parent: 1 },
      ),
    ),
    ISSUE(30, "Pantry photos crash the importer", "open", {
      labels: [{ name: "bug" }],
    }),
    ISSUE(31, "Dark mode for the meal grid", "open", {
      labels: [{ name: "idea" }],
    }),
  ];
  const pulls = Object.entries(DEMO_LINKS)
    .filter(([, link]) => link.pull)
    .map(([taskId, link]) =>
      PULL(
        link.pull,
        LEAF_TITLES[taskId],
        `task/${taskId}`,
        CHECKS[link.pull],
        DONE.has(taskId) ? "merged" : "open",
      ),
    );
  const project = {
    title: "Recipe Box",
    url: "https://github.com/orgs/example/projects/1",
    fields: [
      { name: "Status", options: ["Todo", "In progress", "Done"] },
      { name: "Wave", options: [] },
      { name: "Release", options: ["First release"] },
    ],
    items: issues.map((issue) => ({
      issue: issue.number,
      status:
        issue.state === "closed"
          ? "Done"
          : [4, 6].includes(issue.number)
            ? "In progress"
            : "Todo",
    })),
  };
  return { repository: DEMO_REPOSITORY, issues, pulls, project };
}

// GitHubClient methods that write. The fake refuses each one, so no path
// in demo mode can write to GitHub even past the operation gate.
export const GITHUB_WRITE_METHODS = Object.freeze([
  "addProjectItem",
  "updateProjectItem",
  "addIssueBlocker",
  "removeIssueBlocker",
  "ensureLabel",
  "createIssue",
  "createIssueComment",
  "updateIssueComment",
  "createCommitComment",
  "updateCommitComment",
  "addSubIssue",
  "removeSubIssue",
  "createIssueType",
  "setIssueType",
  "createLinkedBranch",
  "addDiscussionComment",
  "updateIssue",
  "addLabels",
  "removeLabel",
  "addAssignees",
  "removeAssignees",
  "requestReviewers",
  "createPullRequest",
  "createCommitStatus",
  // Raw calls could carry a write, so they are refused too.
  "request",
  "graphql",
  "paginate",
  "paginateCursor",
]);

function refuseWrite(name) {
  return Object.assign(
    Error(`Demo mode: GitHub is fake here, so ${name} wrote nothing.`),
    {
      status: 409,
      demo: true,
    },
  );
}

// A GitHub client over demoGitHubData(). Reads answer from the sample; a
// write, a raw call, or any method it does not know is refused.
export function demoGitHub(sample = demoGitHubData()) {
  const issue = (n) =>
    sample.issues.find((i) => i.number === Number(n)) || null;
  const pull = (n) => sample.pulls.find((p) => p.number === Number(n)) || null;
  const open = () => sample.issues.filter((i) => i.state === "open");
  const reads = {
    available: () => true,
    signedIn: () => true,
    rateLimit: async () => ({ remaining: 5000, limit: 5000 }),
    currentUser: async () => ({ login: "demo-owner" }),
    repository: async () => ({
      full_name: sample.repository,
      private: false,
      default_branch: "main",
      permissions: { admin: true, push: true, pull: true },
    }),
    permission: async () => "admin",
    listIssues: async () => sample.issues,
    listOpenIssues: async () => open(),
    searchOpenIssues: async () => open(),
    searchIssuesWithAnyLabel: async () => open(),
    issue: async (_repo, n) => issue(n),
    listSubIssues: async (_repo, n) =>
      sample.issues.filter((i) => i.parent === Number(n)),
    parentIssue: async (_repo, n) => issue(issue(n)?.parent),
    listIssueBlockers: async () => [],
    listIssueBlocking: async () => [],
    listLabels: async () => [
      { name: "epic" },
      { name: "bug" },
      { name: "idea" },
      { name: "avoozl" },
    ],
    listIssueComments: async () => [],
    issueEvents: async () => [],
    issueTimeline: async () => [],
    issueActivity: async () => [],
    issueLinks: async () => [],
    listIssueTypes: async () => [],
    listDiscussions: async () => [],
    projectFields: async () => sample.project.fields,
    projectItems: async () => sample.project.items,
    projectStatusChanges: async () => [],
    branchHead: async () => ({ sha: "0".repeat(40) }),
    branch: async () => ({ name: "main", protected: true }),
    branchRules: async () => [],
    branchProtection: async () => null,
    branchPullRequests: async () =>
      sample.pulls.filter((p) => p.state === "open"),
    listPullRequests: async () => sample.pulls,
    closingPullRequests: async () => [],
    pullRequest: async (_repo, n) => pull(n),
    pullRequestHeads: async () => [],
    pullRequestFeedback: async () => null,
    pullRequestReviews: async () => [],
    listPullRequestReviewComments: async () => [],
    listPullRequestFiles: async () => [],
    listCommits: async () => [],
    checkRuns: async (_repo, ref) => ({
      check_runs: (
        sample.pulls.find((p) => p.head.sha === ref || p.head.ref === ref)
          ?.checks || []
      ).map((c) => ({
        name: c.name,
        status: c.status.toLowerCase(),
        conclusion: c.conclusion?.toLowerCase() ?? null,
      })),
    }),
    commitStatus: async () => ({ state: "success", statuses: [] }),
  };
  // `calls` names every method asked for, so tests can see no write ran.
  const calls = [];
  return new Proxy(
    { demo: true, sample, calls },
    {
      get(target, name) {
        if (name in target) return target[name];
        if (typeof name !== "string" || name === "then") return undefined;
        if (Object.hasOwn(reads, name))
          return (...args) => {
            calls.push(name);
            return reads[name](...args);
          };
        // A write, a raw call, or a method this fake does not know.
        return () => {
          calls.push(name);
          return Promise.reject(refuseWrite(name));
        };
      },
    },
  );
}

// --- The gate ---------------------------------------------------------------

// Reads that still reach outside the sample (a folder picker, a scan of the
// disk) are previews too, even though they change nothing.
const OUTSIDE_READS = new Set([
  "onboarding.scan",
  "onboarding.inspect",
  "repositories.detect",
]);

// What a change would do, said plainly. The first matching prefix wins.
const SAYS = [
  [
    "workspace.tick",
    "check the graph, start ready tasks in Kiro Crew chats, and sync GitHub",
  ],
  ["task.start", "open a Kiro Crew worker chat for this task now"],
  ["task.", "change this task"],
  ["plan.approve", "approve this spec and turn its tasks into the graph"],
  ["plan.delete", "delete this spec"],
  ["plan.archive", "archive this spec"],
  ["plan.new", "open a planner chat to write a new spec"],
  ["plan.", "change this spec"],
  ["github.setup", "create labels, fields and a Project on GitHub"],
  ["github.", "write to GitHub"],
  ["intake.", "take this item into the graph"],
  ["idea.", "save this idea"],
  ["flow.stop", "stop the line: no new work starts until you resume"],
  ["flow.resume", "resume the line so new work can start"],
  ["flow.retro", "open a retro chat to learn from this run"],
  ["flow.", "change Flow settings"],
  ["route.", "change where this task runs"],
  ["routing.", "change where tasks run"],
  ["crews.", "change your crews"],
  ["provider", "switch a running chat to another model"],
  ["budget.", "change a budget"],
  ["delivery.", "change delivery"],
  ["driver.", "hand this workspace to another machine"],
  ["plugin", "change plugins"],
  ["content.", "change content rules"],
  ["lessons.", "share or export lessons"],
  ["review.chat", "open a review chat"],
  ["untriaged.handoff", "hand this item to Issue Radar"],
  ["conflicts.", "settle this conflict"],
  ["activity.settings", "change Activity settings"],
  ["onboarding.", "look at folders on this machine"],
];

export function demoPreview(operation) {
  const said =
    SAYS.find(([prefix]) => operation.startsWith(prefix))?.[1] ||
    `run ${operation}`;
  return `Demo mode: in your own workspace this would ${said}. Nothing changed here.`;
}

// Whether the demo runs an operation for real: only reads of the sample.
export function demoRuns(operation) {
  try {
    return (
      classifyOperation(operation) === "observe" &&
      !OUTSIDE_READS.has(operation)
    );
  } catch {
    return false;
  }
}

// An error the backend sends back as the preview. Status 409 so the page
// treats it like any refused change and shows its sentence.
export function demoRefusal(operation) {
  return Object.assign(Error(demoPreview(operation)), {
    status: 409,
    demo: true,
    preview: demoPreview(operation),
  });
}

// Operations over the sample with no reach outside it: the fake GitHub,
// no notifier, crew reader, session stopper or driver, and machine
// settings inside the sample folder.
export function demoOperations(root) {
  const config = demoConfig(root),
    paths = demoPaths(root),
    store = new Store(config.dbPath);
  const ops = new Operations(store, {
    operator: OWNER,
    github: demoGitHub(),
    workspaceRoot: config.workspaceRoot,
    plansRoot: null,
    configDirectory: paths.settings,
    pluginSettingsFile: paths.pluginSettingsFile,
    notifier: null,
    crewReader: null,
    sessionStopper: null,
    driver: null,
    models: () => ["demo-model-large", "demo-model-small"],
  });
  return {
    store,
    ops,
    github: ops.github,
    // Reads run; every other operation answers with its preview.
    async execute(operation, input = {}, expectedRevision) {
      if (!demoRuns(operation)) throw demoRefusal(operation);
      return ops.execute(operation, input, expectedRevision);
    },
    close: () => store.close(),
  };
}

// --- The sample -------------------------------------------------------------

const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  summary,
  acceptance: [summary],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});

// Three specs under one epic, each with phases from tasks.md headings.
function sampleSpecs() {
  const specs = {
    "recipe-import": {
      title: "Recipe import",
      goal: "Paste a link to a recipe and get a clean recipe card.",
      phases: [
        [
          "Read the page",
          [
            ["1.1", "Import a recipe from a link"],
            ["1.2", "Parse ingredients into lines"],
          ],
        ],
        [
          "Tell people what went wrong",
          [
            ["2.1", "Show import errors in plain words"],
            ["2.2", "Check the import on a phone"],
          ],
        ],
      ],
      manifest: {
        1.1: leaf("A pasted link becomes a recipe card."),
        1.2: leaf("Each ingredient is one line with an amount.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A failed import says why in one sentence.", {
          requires: ["1.2"],
        }),
        2.2: {
          kind: "leaf",
          repository: "app",
          summary: "A person imports three recipes on a phone.",
          acceptance: ["Three imports work on a phone."],
          completion: "answered",
          requires: ["2.1"],
        },
      },
    },
    "meal-planner": {
      title: "Meal planner",
      goal: "Drag recipes onto a week and see what to cook each day.",
      phases: [
        [
          "The week",
          [
            ["1.1", "Week grid for the meal planner"],
            ["1.2", "Drag a recipe onto a day"],
          ],
        ],
        ["Sharing", [["2.1", "Share the week with a link"]]],
      ],
      manifest: {
        1.1: leaf("A week shows seven days with meals."),
        1.2: leaf("A recipe dropped on a day stays there.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A link opens a read-only week.", { requires: ["1.2"] }),
      },
    },
    "shopping-list": {
      title: "Shopping list",
      goal: "Turn the week's meals into one shopping list.",
      phases: [
        [
          "The list",
          [
            ["1.1", "Build the shopping list"],
            ["1.2", "Merge the same ingredient"],
          ],
        ],
        ["In the shop", [["2.1", "Tick items off in the shop"]]],
      ],
      manifest: {
        1.1: leaf("The week's ingredients make one list."),
        1.2: leaf("Two eggs and three eggs make five eggs.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A ticked item moves to the bottom.", { requires: ["1.2"] }),
      },
    },
  };
  const files = {};
  for (const [name, spec] of Object.entries(specs)) {
    const lines = ["# Tasks", ""];
    for (const [phase, items] of spec.phases) {
      lines.push(`## ${phase}`, "");
      for (const [id, title] of items) lines.push(`- [ ] ${id} ${title}`);
      lines.push("");
    }
    files[name] = {
      "requirements.md": `---\nepic: recipe-box\n---\n# ${spec.title}\n\nMade-up demo spec. ${spec.goal}\n\n## Requirement 1\n\nWHEN a person uses ${spec.title.toLowerCase()} THEN it SHALL work as the tasks say.\n`,
      "design.md": `# ${spec.title} design\n\nMade-up demo design. ${spec.goal}\n`,
      "tasks.md": lines.join("\n"),
      "avoozl/manifest.json":
        JSON.stringify({ tasks: spec.manifest }, null, 2) + "\n",
    };
  }
  const members = Object.keys(specs);
  files["recipe-box"] = {
    "requirements.md":
      "# Recipe Box\n\nMade-up demo epic: a small app to import recipes, plan meals and shop.\n\n## What done means\n\nEvery member spec is done.\n",
    "design.md": "# Design\n\nImport first, then the planner, then the list.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] ${i + 1} ${specs[m].title}\n`).join("")}`,
    "avoozl/manifest.json":
      JSON.stringify(
        {
          kind: "epic",
          tasks: Object.fromEntries(
            members.map((m, i) => [
              String(i + 1),
              { plan: m, summary: specs[m].title + "." },
            ]),
          ),
        },
        null,
        2,
      ) + "\n",
  };
  // A draft spec the demo never approves.
  files["pantry-photos"] = {
    "requirements.md":
      "# Pantry photos\n\nMade-up demo draft. Take a photo of the pantry and list what is in it.\n",
    "design.md": "# Design\n\nNot written yet.\n",
    "tasks.md":
      "# Tasks\n\n## Try it\n\n- [ ] 1.1 Read one photo into a list\n",
    "avoozl/manifest.json":
      JSON.stringify(
        { tasks: { 1.1: leaf("A photo of three jars lists three items.") } },
        null,
        2,
      ) + "\n",
  };
  return { files, members };
}

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

const hoursAgo = (now, hours) => new Date(now - hours * 3600_000).toISOString();

// Build the sample in `root` (the staging folder). Stored paths name
// `finalRoot`, where the folder lands after the rename.
export async function buildDemo(
  root,
  { finalRoot = root, now = Date.now() } = {},
) {
  const paths = demoPaths(root);
  fs.mkdirSync(paths.settings, { recursive: true });
  // Single-repo mode on the fake repository: specs live in the code
  // repository and every leaf is a (fake) GitHub issue.
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify(
      {
        version: 1,
        name: DEMO_NAME,
        delivery: { runner: "tick", concurrency: 2 },
        github: {
          mode: "single-repo",
          repositories: { [DEMO_REPOSITORY]: { baseBranch: "main" } },
        },
      },
      null,
      2,
    ) + "\n",
  );
  // The code repository the leaves name, with one commit.
  const checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Demo");
  git(checkout, "config", "user.email", "demo@example.test");
  git(checkout, "config", "commit.gpgsign", "false");
  fs.writeFileSync(
    path.join(checkout, "README.md"),
    "# Recipe Box\n\nMade-up demo app.\n",
  );
  const { files, members } = sampleSpecs();
  for (const [name, folder] of Object.entries(files))
    for (const [file, text] of Object.entries(folder)) {
      const target = path.join(checkout, ".kiro", "specs", name, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
    }
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Start");

  const config = demoConfig(root),
    store = new Store(config.dbPath);
  try {
    store.importSnapshot(emptySnapshot(DEMO_NAME));
    const project = {
      id: "app",
      name: "Recipe Box app",
      root: fs.realpathSync.native(checkout),
      baseBranch: "main",
      github: DEMO_REPOSITORY,
    };
    store.put("projects", project);
    const ops = new Operations(store, {
      operator: OWNER,
      github: demoGitHub(),
      workspaceRoot: root,
      configDirectory: paths.settings,
      pluginSettingsFile: paths.pluginSettingsFile,
    });
    // The sample specs arrive approved: built through the same create and
    // approve path as a person's, inside this throwaway folder only. The
    // epic goes last, after its members. The pantry draft stays a draft.
    for (const name of [...members, "recipe-box"]) {
      const plan = await ops.execute("plan.create", { spec: name });
      await ops.execute("plan.approve", {
        id: plan.id,
        expectedHash: plan.hash,
        expectedRevision: store.read().revision,
        approvedBy: "Demo sample",
      });
    }
    await ops.execute("plan.create", { spec: "pantry-photos" });
    seedState(store, now);
    seedActivity(store, now);
    seedLessons(paths.settings, now);
    // The checkout as it reads after the rename.
    const finalReal = path.join(
      fs.realpathSync.native(path.dirname(finalRoot)),
      path.basename(finalRoot),
    );
    store.put("projects", { ...project, root: path.join(finalReal, "app") });
    store.put("receipts", {
      id: DEMO_RECEIPT,
      kind: "demo",
      version: DEMO_VERSION,
      at: new Date(now).toISOString(),
      specs: [...members, "recipe-box", "pantry-photos"],
    });
  } finally {
    store.close();
  }
}

// The fake issue and pull request behind each sample leaf.
export const DEMO_LINKS = Object.freeze({
  "recipe-import.1.1": { issue: 2, pull: 20 },
  "recipe-import.1.2": { issue: 3, pull: 21 },
  "recipe-import.2.1": { issue: 4, pull: 22 },
  "recipe-import.2.2": { issue: 5 },
  "meal-planner.1.1": { issue: 6, pull: 23 },
  "meal-planner.1.2": { issue: 7 },
  "meal-planner.2.1": { issue: 8 },
  "shopping-list.1.1": { issue: 9 },
  "shopping-list.1.2": { issue: 10 },
  "shopping-list.2.1": { issue: 11 },
});

// Task states, GitHub records, deliveries, intake, an idea, and Flow.
function seedState(store, now) {
  const at = (h) => hoursAgo(now, h);
  store.mutate("Demo sample state", (data) => {
    const states = {
      "recipe-import.1.1": { status: "accepted" },
      "recipe-import.1.2": { status: "accepted" },
      "recipe-import.2.1": { status: "review" },
      "meal-planner.1.1": { status: "partial" },
      "meal-planner.2.1": { needsReview: true },
      "shopping-list.1.2": {
        status: "blocked",
        decision: "Count by weight or by item? Pick one before this starts.",
      },
    };
    for (const task of data.tasks) {
      Object.assign(task, states[task.id] || {});
      const link = DEMO_LINKS[task.id];
      if (!link) continue;
      task.github = {
        repository: DEMO_REPOSITORY,
        number: link.issue,
        url: `https://github.com/${DEMO_REPOSITORY}/issues/${link.issue}`,
        parent: 1,
        ...(link.pull
          ? {
              pullRequests: [
                {
                  number: link.pull,
                  url: `https://github.com/${DEMO_REPOSITORY}/pull/${link.pull}`,
                },
              ],
            }
          : {}),
      };
    }
  });
  const running = "meal-planner.1.1",
    review = "recipe-import.2.1";
  store.transaction(() => {
    store.put("session_bindings", {
      id: "demo-slot-1",
      slot: "demo-slot-1",
      taskId: running,
      role: "worker",
      attempt: 1,
      title: "Week grid for the meal planner",
      status: "running",
      statusAt: at(0.2),
      boundAt: at(1),
      model: "demo-model-large",
      source: "tick",
    });
    store.put("task_deliveries", {
      id: running,
      taskId: running,
      state: "running",
      attempts: [],
      updatedAt: at(0.2),
    });
    store.put("task_deliveries", {
      id: review,
      taskId: review,
      state: "review",
      attempts: [],
      updatedAt: at(2),
    });
    store.put("evidence", {
      id: "demo-evidence-1",
      taskId: review,
      kind: "checks",
      argv: ["npm", "test"],
      exitCode: 1,
      startedAt: at(2),
    });
    store.put("pr_feedback", {
      id: review,
      taskId: review,
      repository: "app",
      rounds: 1,
      roundsFrom: 0,
      strangers: {},
      pull: { url: `https://github.com/${DEMO_REPOSITORY}/pull/22` },
      last: { kinds: ["check"], at: at(1.5), to: "worker" },
    });
    for (const [n, title, label] of [
      [30, "Pantry photos crash the importer", "bug"],
      [31, "Dark mode for the meal grid", "idea"],
    ])
      store.put("incoming_items", {
        id: `github\0${DEMO_REPOSITORY}#${n}`,
        source: "github",
        itemId: `${DEMO_REPOSITORY}#${n}`,
        firstSeenAt: at(5),
        seenAt: at(1),
        record: {
          source: "github",
          id: `${DEMO_REPOSITORY}#${n}`,
          kind: "issue",
          state: "open",
          title,
          body: "Made-up issue for the Avoozl demo.",
          labels: [label],
          assignees: [],
          author: "demo-owner",
          updatedAt: at(1),
          link: `https://github.com/${DEMO_REPOSITORY}/issues/${n}`,
          repository: DEMO_REPOSITORY,
          number: n,
        },
        route: { state: "untriaged", at: at(1) },
        taskId: null,
        findings: [],
        history: [],
      });
    // Flow history: queued, work and verify spans for four leaves.
    const spans = store.db.prepare(
      "INSERT INTO flow_spans(id,task_id,attempt,batch_id,role,stage,started_at,ended_at,source,detail) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    ["recipe-import.1.1", "recipe-import.1.2", review, running].forEach(
      (taskId, i) => {
        const start = now - (30 - i * 6) * 3600_000;
        for (const [stage, offset, length] of [
          ["queued", 0, 0.3],
          ["work", 0.3, 1.5 + i * 0.4],
          ["verify", 1.8 + i * 0.4, 0.4],
        ]) {
          if (taskId === running && stage === "verify") continue;
          const ended =
            taskId === running && stage === "work"
              ? null
              : new Date(start + (offset + length) * 3600_000).toISOString();
          spans.run(
            `demo:${taskId}:${stage}`,
            taskId,
            1,
            null,
            "worker",
            stage,
            new Date(start + offset * 3600_000).toISOString(),
            ended,
            "demo",
            null,
          );
        }
      },
    );
    // A stop the line opened and closed earlier: Flow's time to fix.
    store.put("flow_stops", {
      id: "stop:demo:1",
      manual: true,
      by: OWNER,
      reason: "Tests went red on main after the parser change.",
      scope: "repo",
      projectId: "app",
      planId: null,
      spec: null,
      taskId: null,
      check: null,
      culprit: null,
      fixTaskId: null,
      openedAt: at(20),
      closedAt: at(19),
      timeToFixMs: 3600_000,
      runAnyway: null,
    });
    // GitHub Project items, as the projection records them.
    for (const [taskId, link] of Object.entries(DEMO_LINKS))
      store.put("receipts", {
        id: `demo:project-item:${taskId}`,
        kind: "project-item",
        taskId,
        repository: DEMO_REPOSITORY,
        issue: link.issue,
        project: "Recipe Box",
        at: at(3),
      });
  });
  captureIdea(
    store,
    {
      title: "Suggest a meal from what is in the pantry",
      notes: "Made-up demo idea. Could use the pantry photos spec.",
    },
    { by: { kind: "person", name: OWNER }, now: at(4) },
  );
}

function seedActivity(store, now) {
  const rows = [
    ["local", "plan.approve", "Approved spec recipe-import", 26],
    ["mcp", "task.report", "Worker reported recipe-import 1.1 done", 22],
    ["github", "github.close", "Issue #2 closed by pull request #10", 21],
    ["local", "flow.stop", "Stopped the line: tests red on main", 20],
    ["local", "flow.resume", "Resumed the line", 19],
    ["mcp", "task.report", "Worker reported recipe-import 1.2 done", 12],
    ["github", "github.check", "Check test failed on pull request #12", 2],
    ["local", "task.start", "Started meal-planner 1.1", 1],
  ];
  for (const [source, kind, summary, hours] of rows)
    recordActivity(store, {
      source,
      actor:
        source === "local"
          ? OWNER
          : source === "github"
            ? "demo-owner"
            : "worker",
      kind,
      summary,
      at: hoursAgo(now, hours),
    });
}

function seedLessons(settings, now) {
  const lessons = new Lessons(lessonsPath(settings));
  try {
    for (const [stage, finding, change, hours] of [
      [
        "tests",
        "Tests ran before the build, so they read old files.",
        "Run the build before the tests.",
        18,
      ],
      [
        "coding",
        "Workers guessed the date format in imports.",
        "Say the date format in the task brief.",
        9,
      ],
    ]) {
      const written = writeLesson(lessons, {
        pattern: { stage, check: "test", tool: "npm", traits: [] },
        finding,
        change: { summary: change },
        evidence: [],
        context: { workspace: "demo" },
        source: "retro",
        by: OWNER,
        now: now - hours * 3600_000,
      });
      if (written.refused)
        throw Error(`Demo lesson refused: ${written.refused}`);
    }
  } finally {
    lessons.close();
  }
}
