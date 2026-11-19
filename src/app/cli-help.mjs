// What `avoozl help` prints. One table holds every command's usage lines,
// grouped by the job a person is doing; the overview, a group's page, one
// command's page and `help all` are all rendered from it, so a command is
// written down once. A test fails when the CLI dispatches a command this
// table does not hold.

import { TAGLINE } from "../work-split.mjs";

// The tagline as the help's heading, wrapped to a terminal's 80 columns.
const WIDTH = 80;
const HEADING = TAGLINE.split(" ").reduce((lines, word) => {
  const last = lines.at(-1);
  if (last && (last + " " + word).length <= WIDTH)
    lines[lines.length - 1] = last + " " + word;
  else lines.push(word);
  return lines;
}, []);

// The one name the help and error text use for the program.
export const PROGRAM = "avoozl";

// A usage line and what it does. `first` puts the entry in the overview's
// short list, with the shorter wording given there.
const entry = (usage, about = "", first = null) => ({ usage, about, first });

export const HELP_GROUPS = Object.freeze([
  {
    id: "setup",
    title: "Set up",
    summary: "Create a workspace, register it, connect repositories and GitHub",
    entries: [
      entry(
        "init PATH [--name NAME] [--port 9428]",
        "Create an empty workspace",
        { usage: "init PATH", about: "Create an empty workspace" },
      ),
      entry(
        "seed --workspace PATH [--example ID]",
        "Install an example once; with no ID, draft Recipe Box spec folders",
        {
          usage: "seed --workspace PATH",
          about: "Install the example pack (optional)",
        },
      ),
      entry("examples --workspace PATH", "List available example packs"),
      entry("workspace list", "The workspaces registered on this machine"),
      entry("workspace add ID --root PATH"),
      entry(
        "workspace adopt ID --root PATH",
        "Adopt an existing stopped workspace in place",
      ),
      entry("workspace remove|start|drain|resume|stop|set-default ID"),
      entry("workspace rebuild", "Rebuild the catalog from configuration"),
      entry(
        "project configure ID --root PATH [--branch main] [--worktrees PATH] [--json CONFIG]",
      ),
      entry(
        "github configure OWNER/REPO --project ID [--assignee LOGIN] [--allowed-actors LOGINS]",
      ),
      entry(
        "github setup --mode plans-repo|single-repo [--planning-repository OWNER/REPO]\n[--repositories A,B] [--project-owner LOGIN] [--project-number N | --project-title T]\n[--releases A,B] [--iteration] [--table-by-wave] [--no-epic]",
        "Preview the GitHub setup; add --confirm --preview-hash HASH to apply",
      ),
      entry(
        "mirror adopt|create OWNER/MIRROR --source OWNER/REPO [--ticked IDS]",
        "Dry run of the mirror setup; add --confirm --preview-hash HASH to apply",
      ),
      entry(
        "setup OWNER/REPO --project ID --checks NAME[,NAME] [--base BRANCH]\n[--methods merge,squash,rebase] [--landing pr|direct|off] [--yes]",
        "Preview repository setup for landing; --checks names the required GitHub checks, not the repository's own checks; --yes applies it",
      ),
      entry(
        "workspace-repo configure PATH [--branch avoozl-workspace] [--directory .avoozl]",
      ),
      entry(
        "workspace-repo publish [--dry-run]",
        "Safely publish portable planning state",
      ),
      entry("workspace-repo sync", "Hydrate from the configured private repo"),
      entry("workspace-repo status", "Show portable repository revisions"),
      entry("plugins [list]", "Declared plugins, their approval and health"),
      entry(
        "plugins add ID --path DIR|--package NAME|--git URL --ref REF [--subdir DIR] [--contract 1] [--config JSON] [--repository [--confirm-public]]",
      ),
      entry(
        "plugins update ID",
        "Resolve a git plugin's ref again and fetch that commit",
      ),
      entry(
        "plugins approve ID --hash HASH [--commit SHA]",
        "Approve the exact version, hash and commit `plugins list` shows",
      ),
      entry(
        "plugins disable|enable|remove ID",
        "Stop, restart, or remove a plugin; its tasks park as needs you",
      ),
      entry(
        "plugins pack-preview ID [--repo OWNER/REPO]",
        "What importing a plugin's pack would create, change, or keep",
      ),
      entry(
        "plugins pack-import ID --preview HASH [--repo OWNER/REPO] [--accept-lowered] [--confirm-public]",
        "Import the exact preview",
      ),
      entry("skill --workspace PATH", "Print the portable workflow skill"),
    ],
  },
  {
    id: "plan",
    title: "Plan",
    summary: "Bring work in, then review, approve and publish specs",
    entries: [
      entry(
        "plan batches [--writes]",
        "Draft specs in dependency order; any spec may be approved alone, and a task that waits on a draft spec stays held",
      ),
      entry(
        "plan review SPEC [--start] [--json]",
        "A spec's review findings: severity, state and anchor",
      ),
      entry(
        "plan finding ID accept|reject|defer|resolve|reopen [--note TEXT] [--revision HASH]",
        "Decide one review finding; reject needs --note (a person only)",
      ),
      entry(
        "plan approve PLAN... [--batch N] [--yes --expect HASHES] [--delegate NAME]",
        "Preview approving exactly these specs; --yes approves all or none (a person, or a delegate a person granted)",
      ),
      entry(
        "approval delegates",
        "Who may approve on a person's behalf, and every grant and revocation",
      ),
      entry(
        "approval delegate NAME [--on-behalf-of LOGIN] [--note TEXT]",
        "Let NAME (an agent) approve specs on your behalf (a person only)",
      ),
      entry(
        "approval revoke NAME",
        "Stop NAME approving on your behalf (a person only)",
      ),
      entry(
        "plan delete PLAN_OR_SPEC [--yes] [--retire] [--delete-spec-folder]",
        "Preview a plan delete; --yes deletes (a person only). --retire is for an approved plan",
      ),
      entry(
        "plan restore PLAN_ID",
        "Bring a deleted plan back (a person only)",
      ),
      entry("planning publish PLAN_ID", "Open a private planning pull request"),
      entry("planning reconcile", "Project tasks from merged planning PRs"),
      entry(
        "spec publish SPEC [--repository OWNER/REPO]",
        "Publish the spec issue, or its local journal without GitHub",
      ),
      entry(
        "spec takeover SPEC",
        "Take over a published spec: write the next driver generation",
      ),
      entry(
        "spec journal reanchor SPEC --held ID,... --tail ID [--yes]",
        "Preview, then with --yes restore a held journal; the spec stays held",
      ),
      entry(
        "spec journal resume SPEC --tail ID",
        "Resume a spec after its journal was reanchored",
      ),
      entry(
        "spec export-issues SPEC [--repository OWNER/REPO] [--confirm]",
        "Preview, then with --confirm create the spec's unfinished task issues and stop driving it",
      ),
      entry(
        "gap-report preview|accept SPEC (--path FILE | --issue OWNER/REPO#N)",
        "Turn a gap report into proposed tasks in the sub-specs of a parent spec",
      ),
      entry("github project PLAN_ID --repository OWNER/REPO"),
      entry("github preview PLAN_ID", "List projection writes, making none"),
      entry(
        "intake [list] [--source ID] [--kind KIND] [--state open|closed] [--untriaged]",
        "Incoming items",
      ),
      entry(
        "intake view SOURCE ID",
        "One incoming item, its route and history",
      ),
      entry(
        "intake submit --source ID --file ITEMS.json",
        "Send 1-100 items to an mcp intake source",
      ),
      entry("intake sources", "Declared intake sources and their read state"),
      entry(
        "intake deliver|plan SOURCE ID",
        "Deliver this or Plan this on an item (a person only)",
      ),
      entry(
        "intake confirm SOURCE ID --hash H",
        "Confirm an item's changed text, H from intake view (a person only)",
      ),
    ],
  },
  {
    id: "deliver",
    title: "Deliver",
    summary: "Run agents on ready tasks, steer them and stop the line",
    entries: [
      entry(
        "tick --workspace PATH",
        "Run one workspace tick and print its intents",
      ),
      entry(
        "next [--hook]",
        "Crew Mode buckets: ready, running, waiting, needsYou, done",
      ),
      entry(
        "claim TASK_ID [--release [--discard]]",
        "Take a ready task by hand: prints its worktree and the report command; --release gives it back",
      ),
      entry(
        "report TASK_ID --slot SESSION --kind done|blocked|question|progress [--commit SHA] [--text TEXT]",
      ),
      entry(
        "retry TASK_ID [--dismiss FINDING --reason TEXT]",
        "Resume a leaf that stopped for a decision",
      ),
      entry(
        "verify allow TASK_ID --reason TEXT",
        "Let one held commit's protected paths land",
      ),
      entry(
        "checks run --task TASK_ID",
        "Run the declared checks in this worktree and record the pass",
      ),
      entry("activity TASK_ID --action start|heartbeat|pause|finish ..."),
      entry("update TASK_ID --status STATUS"),
      entry("task links TASK_ID [list]", "A task's links, newest first"),
      entry("task links TASK_ID add --link URL --label LABEL"),
      entry(
        "task links TASK_ID edit LINK_ID --link URL --label LABEL",
        "(a person only)",
      ),
      entry(
        "task links TASK_ID remove LINK_ID",
        "Remove a link; it stays in the activity history (a person only)",
      ),
      entry(
        "task links TASK_ID show LINK_ID [--off]",
        "Show it on the task's issue, or stop (a person only)",
      ),
      entry(
        "task done TASK_ID [--skipped|--refused] [--link URL --label LABEL]",
        "Mark a manual task done, skipped or refused (a person only;\nrefused is a no-go and keeps its dependents held)",
      ),
      entry(
        "task reopen TASK_ID",
        "Reopen a manual task; its dependents wait again (a person only)",
      ),
      entry(
        "task supersede TASK_ID [--id NEW_ID] [--title TITLE] [--requires A,B] [--reason TEXT]",
        "Replace a local task; its dependents wait on the new one",
      ),
      entry(
        "flow stop --scope all|repo|spec|task [--repository ID] [--spec ID] [--task ID] --reason TEXT",
        "Pull the Andon cord: stop new work in a scope",
      ),
      entry(
        "flow stop --full --reason TEXT",
        "Stop all agents: also stop every running chat Avoozl opened (needs the app backend)",
      ),
      entry("flow resume STOP_ID", "Resume a pulled stop (a person only)"),
      entry(
        "flow run-anyway STOP_ID --confirm",
        "Resume dispatch while a line stop stays open (a person only)",
      ),
      entry(
        "content allow DECISION_ID --reason TEXT",
        "Allow one blocked write once (a person only)",
      ),
      entry(
        "github sync [--repository OWNER/REPO]",
        "Import assigned ready issues",
      ),
      entry(
        "rebuild [--repository OWNER/REPO]",
        "Rebuild GitHub tasks from their issues",
      ),
    ],
  },
  {
    id: "land",
    title: "Land",
    summary: "Merge verified work in merge batches",
    entries: [
      entry(
        "landing status [--json]",
        "Per base: who waits, the batch being tested, the last batches and the size limit, from stored records",
      ),
    ],
  },
  {
    id: "inspect",
    title: "Inspect",
    summary: "See what a workspace and this machine are doing",
    entries: [
      entry(
        "status [--workspace PATH]",
        "The named workspace, then the machine host, its workspaces, the supervisor and its children",
        {
          usage: "status --workspace PATH",
          about: "The workspace, then this machine",
        },
      ),
      entry("query [--q QUERY]", "Tasks, all or matching a query", {
        usage: "query --workspace PATH",
        about: "List tasks",
      }),
      entry("show TASK_ID", "One task", {
        usage: "show TASK_ID --workspace PATH",
        about: "One task",
      }),
      entry("check --workspace PATH", "Validate the task graph", {
        usage: "check --workspace PATH",
        about: "Validate the task graph",
      }),
      entry(
        "flow [--repository ID] [--epic ID] [--plan ID [--phase ID]] [--window N] [--stage STAGE]",
        "Where delivery time goes (§4.11)",
      ),
      entry(
        "epics",
        "Epics across plans, each with member plans and computed progress",
      ),
      entry(
        "epic ID",
        "One epic: goal, what done means, member plans, open decisions",
      ),
      entry("github status", "Show repository and machine registration"),
      entry(
        "review drafts [--repository OWNER/REPO] [--state STATE] [--json]",
        "Review drafts made from the review label, and the GitHub search for them",
      ),
      entry(
        "content [list]",
        "Content rule sets, open decisions and report findings",
      ),
      entry(
        "content show DECISION_ID",
        "Read the matched line again from its source",
      ),
      entry("health [--url URL]", "Ask a running app backend whether it is up"),
    ],
  },
  {
    id: "hooks",
    title: "Agent hooks",
    summary: "What an agent session or a git hook runs for itself",
    entries: [
      entry(
        "worktree prepare TASK_ID",
        "Create or return the task's worktree and print it",
      ),
      entry(
        "runner report TASK_ID done|blocked|findings [--token T] [--file PATH] [--text TEXT]",
        "Report from the task's worktree; a worker's brief gives the token",
      ),
      entry(
        "next --hook",
        "An AgentSpawn hook: brief a Crew Mode conductor whose session starts in this workspace",
      ),
      entry(
        "content hook",
        "A PreToolUse hook: refuse a crew write that matches a rule",
      ),
      entry(
        "content check --push --task TASK_ID",
        "The pre-push hook: refuse a push whose added lines match",
      ),
    ],
  },
  {
    id: "machine",
    title: "Servers and machines",
    summary: "MCP servers, the supervisor, and work on other machines",
    entries: [
      entry(
        "mcp --workspace PATH",
        "Stdio MCP server for the workspace database",
        { usage: "mcp --workspace PATH", about: "Stdio MCP server for agents" },
      ),
      entry("mcp --url URL", "Stdio bridge to a running server"),
      entry("mcp --kirocrew", "Kiro Crew app server: workspace per caller"),
      entry(
        "app-backend --workspace PATH",
        "Kiro Crew app backend on 127.0.0.1 ($PORT)",
      ),
      entry(
        "serve [--workspace PATH] [--port N]",
        "The standalone page on 127.0.0.1 only; prints a one-time owner link",
      ),
      entry("serve link", "A new owner link for the running standalone page"),
      entry(
        "supervisor [--tick-seconds N]",
        "This machine's owner of process children (one per machine); --tick-seconds runs the tick too (headless)",
      ),
      entry(
        "supervisor unit [launchd|systemd] [--write [--force]]",
        "Print or write the unit that runs the supervisor and tick at login",
      ),
      entry(
        "runner status --json",
        "This runner's tasks and workers; elsewhere the supervisor and its children",
      ),
      entry(
        "worker pull",
        "Worker mode: read this worker's offers from spec journals",
      ),
      entry(
        "worker claim",
        "Worker mode: ask for pulled offers, start the acknowledged ones",
      ),
      entry(
        "worker setup",
        "Worker mode: preview login, access, claims and executor",
      ),
      entry(
        "driver status [SPEC]",
        "Which machine drives each spec, and why one reads only here",
      ),
      entry(
        "driver handoff SPEC [--folder DIR [--unfinished]] [--cancel]",
        "Stop new work for SPEC; with --folder write the export (a person only)",
      ),
      entry(
        "driver takeover SPEC [--file EXPORT.json | --rebuild [--yes]]",
        "Drive SPEC here once its plan issue names you (a person only)",
      ),
      entry(
        "driver takeover SPEC --force --confirm SPEC [--file EXPORT.json | --yes]",
        "Assign the plan issue to you and take over by force (a person only)",
      ),
      entry(
        "driver set [--label LABEL] [--heartbeat MINUTES]",
        "This computer's machine label and heartbeat",
      ),
    ],
  },
  {
    id: "data",
    title: "Data",
    summary: "Back up, move and reindex a workspace; run any operation",
    entries: [
      entry(
        "backup --workspace PATH --output FILE",
        "Local-only; registered IDs are refused",
      ),
      entry(
        "export --workspace PATH [--output FILE]",
        "Local-only; registered IDs are refused",
      ),
      entry(
        "import SNAPSHOT.json --workspace PATH [--dry-run]",
        "Local-only; registered IDs are refused",
      ),
      entry("generate --workspace PATH", "Reindex Markdown"),
      entry(
        "OPERATION --json JSON [--revision N] --workspace PATH",
        "Run any application operation by name",
      ),
      entry("OPERATION --input FILE --workspace PATH"),
    ],
  },
]);

const OPTIONS = `Use --workspace PATH or AVOOZL_WORKSPACE to choose data independently
of the application checkout. --db, --documents, --port, --operator and --url
override workspace configuration. A person-only operation run inside an agent
session runs and is recorded as run there. UI, CLI and MCP share application
operations.`;

// The command words a usage line starts with: `plugins disable|enable ID`
// names plugins. An OPERATION line names no command.
const commandsOf = ({ usage }) => {
  const word = usage.split(/\s/)[0];
  return /^[a-z][a-z|-]*$/.test(word) ? word.split("|") : [];
};

// Every command the help holds, in the order it first appears.
export const helpCommands = () => [
  ...new Set(HELP_GROUPS.flatMap((group) => group.entries.flatMap(commandsOf))),
];

const INDENT = "      ";
function lines({ usage, about }) {
  const [first, ...rest] = usage.split("\n");
  return [
    `  ${PROGRAM} ${first}`,
    ...rest.map((line) => INDENT + line),
    ...(about ? about.split("\n").map((line) => INDENT + line) : []),
  ];
}

const heading = (group) => `${group.title}: ${group.summary}`;

// Words wrapped to `width`, each line after `indent`.
function wrapped(words, indent, width = 78) {
  const out = [];
  let line = "";
  for (const word of words) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      out.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(indent + line);
  return out;
}

function overview() {
  const first = HELP_GROUPS.flatMap((group) =>
      group.entries.filter((e) => e.first).map((e) => e.first),
    ),
    width = Math.max(...first.map((e) => e.usage.length)) + 2,
    pad = Math.max(...HELP_GROUPS.map((group) => group.id.length)) + 2;
  return [
    ...HEADING,
    "",
    `Usage: ${PROGRAM} COMMAND [ARGUMENTS] [--workspace PATH]`,
    "",
    "Start here:",
    ...first.map((e) =>
      `  ${PROGRAM} ${e.usage.padEnd(width)}${e.about}`.trimEnd(),
    ),
    "",
    `Every command, by job. ${PROGRAM} help GROUP shows a group in full:`,
    ...HELP_GROUPS.flatMap((group) => [
      `  ${group.id.padEnd(pad)}${group.summary}`,
      ...wrapped(
        [...new Set(group.entries.flatMap(commandsOf))],
        " ".repeat(pad + 4),
      ),
    ]),
    "",
    `  ${PROGRAM} help COMMAND   One command's usage, such as ${PROGRAM} help flow`,
    `  ${PROGRAM} help all       Every usage line`,
    "",
    `Most commands act on one workspace: pass --workspace PATH or set`,
    `AVOOZL_WORKSPACE. ${PROGRAM} help data lists the other shared options.`,
  ].join("\n");
}

const groupPage = (group) =>
  [heading(group), "", ...group.entries.flatMap(lines)].join("\n");

// The help for `topic`: nothing for the overview, a group ID, a command, or
// `all`. Returns null when there is no such topic.
export function helpText(topic) {
  if (topic === undefined || topic === null || topic === "") return overview();
  if (topic === "all")
    return [
      ...HEADING,
      "",
      ...HELP_GROUPS.flatMap((group) => [groupPage(group), ""]),
      OPTIONS,
    ].join("\n");
  const group = HELP_GROUPS.find(({ id }) => id === topic);
  if (group)
    return [
      groupPage(group),
      ...(group.id === "data" ? ["", OPTIONS] : []),
    ].join("\n");
  const found = HELP_GROUPS.flatMap((g) =>
    g.entries
      .filter((e) => commandsOf(e).includes(topic))
      .map((e) => ({ group: g, entry: e })),
  );
  if (!found.length) return null;
  const groups = [...new Set(found.map(({ group }) => group))];
  return [
    `${PROGRAM} ${topic} (${groups.map((g) => `${PROGRAM} help ${g.id}`).join(", ")})`,
    "",
    ...found.flatMap(({ entry }) => lines(entry)),
  ].join("\n");
}

// The line that sends a person to the right help after a refusal: the
// command's own page when the help holds it, else the overview.
export function helpPointer(command) {
  return helpCommands().includes(command)
    ? `Run ${PROGRAM} help ${command} for its usage.`
    : `Run ${PROGRAM} help for the commands.`;
}
