// The `process` executor (R93.2, design §4.28): runs an agent CLI as a child
// of this machine's supervisor, in the task worktree, with an approved
// harness definition. It only writes requests to and reads records from the
// supervisor's database; the supervisor owns the children (R95).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createExecutor } from "./executors.ts";
import { fail, type Store } from "../store/store.ts";
import { rolePrompt } from "../agents/prompts.ts";
import { execFile } from "node:child_process";
import { cliReportCaller } from "../workers/report-match.ts";
import {
  childRecord,
  childResult,
  readChildOutput,
  childStatus,
  fieldsOf,
  messageOf,
  openSupervisorDatabase,
  requestChild,
  sendChild,
  setChildContext,
  stopChild,
  supervisorPaths,
} from "./supervisor.ts";
import {
  authorCounts,
  type ContextOps,
  processContext,
} from "../workers/epic-context.ts";
import { recordActivity } from "../store/activity-log.ts";
import { catalogWorkspaceRoots } from "./sandbox.ts";
import {
  completeSessionRequest,
  enqueueSessionRequests,
  pendingSessionRequests,
  releaseSessionRequest,
  type SessionRequest,
  takeSessionRequest,
} from "../sessions/session-requests.ts";
import {
  bindSession,
  recordSessionStatus,
  type SessionBinding,
} from "../sessions/session-bindings.ts";
import { branchTip, commitWorkerChanges, git, taskGit } from "../git/git.ts";
import { sessionStartHold } from "../sessions/session-request-eligibility.ts";
import { taskRepository } from "../../work-model.ts";
import { processRow, type RoleRow } from "../agents/role-table.ts";
import { loadHarnessDefinition } from "./harness-definitions.ts";
import { requireDiskSpace } from "../workspace/disk-space.ts";

const PROCESS_EXECUTOR = "process";
// The harness a `process` repository runs when it names none.
export const DEFAULT_HARNESS = "claude-code";
const CONSUMER = "supervisor";

export { repositoryExecutor } from "../agents/role-table.ts";

// A repository row, as far as a process session reads it.
interface ProcessRepository {
  id?: string;
  root?: string;
  github?: string | null;
  harness?: string;
  baseBranch?: string;
  sandbox?: {
    modelProxy?: unknown;
    network?: unknown;
    allowCommands?: string[][];
    writeRoots?: string[];
  };
  isolation?: { readable?: string[] };
}
// A request's lane (simplify §D22.2): where its harness keeps sessions.
interface RequestLane {
  id: string;
  workspace?: string;
  header?: string;
  resume?: boolean;
  session?: string;
  keepSince?: string;
}
// A session request, as the drain reads it.
type ProcessRequest = SessionRequest & {
  operation?: string;
  after?: string;
  from?: { login?: unknown };
  epicContext?: unknown;
  harness?: string | null;
  lane?: RequestLane | null;
  batch?: unknown;
  repository?: string;
};
// A finished child's result (childResult), with its output once read.
interface ProcessResult {
  state?: string | null;
  text?: string | null;
  problem?: string | null;
  worktree?: string;
  report?: unknown;
  output?: string;
  outputValue?: unknown;
}
// The operation a finished session reports through.
type ReportOps = {
  execute(
    name: string,
    input?: Record<string, unknown>,
    expectedRevision?: number,
    context?: { caller?: { sessionKey: string } | null },
  ): Promise<unknown>;
};
// The operations a drain runs with: a report, and the epic context's reads
// when it has them (Operations does; a test's fake may not).
type ProcessOps = ReportOps & Partial<ContextOps>;
const hasContextOps = (
  ops: ProcessOps | null | undefined,
): ops is ProcessOps & ContextOps =>
  typeof ops?.approvalCheckout === "function" &&
  typeof ops.approverOf === "function";
// The epic context a session passed the gate for.
type SessionContextGrant = {
  request?: unknown;
  brief?: string;
  binding?: unknown;
} | null;
// A stored session binding, which must be there.
const bindingOf = (store: Store, slot: string) =>
  store.get<SessionBinding>("session_bindings", slot) ??
  fail(`No session ${slot}.`, 404);

function withDatabase<T>(stateDirectory: string, use: (db: DatabaseSync) => T) {
  const db = openSupervisorDatabase(stateDirectory);
  try {
    return use(db);
  } finally {
    db.close();
  }
}

// `repositoryFor(task)` names the task's repository record, whose `harness` and
// `sandbox` ({writeRoots, allowCommands, network}) shape the child.
// `harnessFor(task, role)` names the harness a request asked for (R98.3,
// R98.4), or null for the repository's.
// The loopback ports a session may reach: the repository's model proxy for
// every role, and its network too unless the role reads only its folder
// (NK2.2). Without the proxy an offline role could never reach its model.
function sessionNetwork(
  sandbox: NonNullable<ProcessRepository["sandbox"]>,
  offline: boolean,
) {
  const ports = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];
  const list = [
    ...new Set([
      ...ports(sandbox.modelProxy),
      ...(offline ? [] : ports(sandbox.network)),
    ]),
  ];
  return list.length ? list : undefined;
}

// `contextFor()` gives the epic context this session passed the gate for:
// {request, brief} (workers/epic-context.mjs processContext), or null. A
// session without it is requested exactly as before (EC10.3).
export function processExecutor({
  stateDirectory,
  repositoryFor = () => null,
  harnessFor = () => null,
  contextFor = () => null,
  laneFor = () => null,
}: {
  stateDirectory: string;
  repositoryFor?: (task: string, worktree: string) => ProcessRepository | null;
  harnessFor?: (task: string, role: string) => string | null;
  contextFor?: () => SessionContextGrant;
  laneFor?: () => RequestLane | null;
}) {
  return createExecutor({
    start(role, task, worktree, brief, model, permissionClass) {
      if (!worktree) throw Error("A process session needs the task worktree.");
      const repository = repositoryFor(task, worktree) ?? {};
      const sandbox = repository.sandbox ?? {};
      const offline = processRow(role)?.offline === true;
      const sessionId = `process-${randomUUID()}`;
      const context = contextFor(),
        lane = laneFor();
      return withDatabase(stateDirectory, (db) =>
        requestChild(db, {
          executor: PROCESS_EXECUTOR,
          sessionId,
          role,
          task,
          worktree,
          harness:
            harnessFor(task, role) ?? repository.harness ?? DEFAULT_HARNESS,
          permissionClass,
          model,
          brief: processBrief(
            role,
            context?.brief ? `${brief}\n\n${context.brief}` : brief,
            { allowCommands: sandbox.allowCommands },
          ),
          values: {
            // The session's own temp folder, outside the shared one's other
            // checkouts and outside the state folder the child cannot reach.
            tmp: path.join(os.tmpdir(), `avoozl-${sessionId}`),
            repository_cache_dirs: sandbox.writeRoots ?? [],
          },
          allowCommands: sandbox.allowCommands,
          // Home paths the repository lets its checks and sessions read.
          readable: repository.isolation?.readable ?? [],
          network: sessionNetwork(sandbox, offline),
          ...(context?.request ? { context: context.request } : {}),
          ...(lane ? { lane: processLane(lane) } : {}),
        }),
      );
    },
    send: (sessionId, text) =>
      withDatabase(stateDirectory, (db) => sendChild(db, sessionId, text)),
    status: (sessionId) =>
      withDatabase(stateDirectory, (db) => childStatus(db, sessionId)),
    stop: (sessionId) =>
      withDatabase(stateDirectory, (db) => stopChild(db, sessionId)),
  });
}

// A lane's folder (simplify §D22.2): ~/.avoozl/lanes/<workspace>/<lane>/,
// the home its harness keeps sessions in.
export function laneHome(
  workspace: unknown,
  lane: string,
  home = os.homedir(),
) {
  const safe = String(workspace ?? "").replace(/[^A-Za-z0-9._-]/g, "-");
  if (!safe || /^\.+$/.test(safe) || !/^(?:worker|reviewer)-[0-9]+$/.test(lane))
    fail("A lane needs a workspace name and a lane id.", 500);
  return path.join(home, ".avoozl", "lanes", safe, lane);
}

// The lane settings a process child gets from its request's lane.
const processLane = (lane: RequestLane) => ({
  home: laneHome(lane.workspace, lane.id),
  header: lane.header,
  ...(lane.resume && lane.session ? { resume: lane.session } : {}),
  ...(lane.keepSince ? { keepSince: lane.keepSince } : {}),
});

// A message sent to a child that waits to be resumed opens its run again.
function reopenAfterSend(store: Store, slot: string | undefined) {
  const binding = store.get<SessionBinding & { awaitingResume?: unknown }>(
    "session_bindings",
    slot,
  );
  if (!binding?.awaitingResume) return;
  const { awaitingResume, ...open } = binding;
  void awaitingResume;
  store.put("session_bindings", {
    ...open,
    status: "working",
    statusAt: new Date().toISOString(),
  });
}

// The binding status an executor status reads as: an exited child closed
// its session; `gone` follows R88.4 as a vanished chat does.
export function bindingStatus(status: string) {
  if (status.startsWith("exited ")) return "closed";
  return status;
}

const FINISHED = new Set(["closed", "lost", "gone"]);

// R97.3: every role runs on `process`. A Kiro Crew chat gets its role's
// prompt from its agent file; a child gets the same prompt file at the top
// of its brief. A worker's brief already holds its steps (processSteps).
// The role table (role-table.mjs) holds each role's prompt and finish.
const reportsVerdict = (role: string) => processRow(role)?.verdict === true;

// The brief a `process` child reads: its role's prompt, the brief, then how
// it finishes. A worker's brief is passed as it is. `allowCommands` is the
// repository's allow-list, which a verdict child is told.
// Every child's brief says so: a harness keeps a cd for the rest of the
// session, and a refused command (in a read-only one) cannot move it back.
export const STAY_IN_FOLDER =
  "Do not run cd. Name every file by its path from the current folder, such as repo/lib.mjs.";

export function processBrief(
  role: string,
  brief: string,
  { allowCommands }: { allowCommands?: string[][] } = {},
) {
  const row = processRow(role);
  if (!row?.prompt) return brief;
  return [
    rolePrompt(row.prompt).trim(),
    "",
    brief,
    "",
    STAY_IN_FOLDER,
    ...(row.finish?.(allowCommands) ?? []),
  ]
    .join("\n")
    .trim();
}

// The repository a process session runs in: its task's repository, else the
// repository the request names, else the repository whose checkout is the
// session's folder.
function sessionRepository(
  store: Store,
  {
    task: taskId,
    repository,
    worktree,
  }: { task?: string; repository?: string; worktree?: string | null },
): ProcessRepository | null {
  const task = store.read().tasks.find((t) => t.id === taskId);
  const id = taskRepository(task) || repository;
  if (id) return store.get<ProcessRepository>("repositories", id) ?? null;
  if (!worktree) return null;
  // The repository whose checkout holds the folder, the nearest one first.
  const folder = path.resolve(worktree);
  const holds = (repository: ProcessRepository) => {
    const root = repository.root && path.resolve(repository.root);
    return root && (folder === root || folder.startsWith(root + path.sep));
  };
  return (
    store
      .list<ProcessRepository>("repositories")
      .filter(holds)
      .sort((a, b) => (b.root ?? "").length - (a.root ?? "").length)[0] ?? null
  );
}

// A verdict role reads one exact commit (R94.4: read-only). The child cannot
// write the git directory, so Avoozl adds the detached worktree its brief
// names before it starts, and removes it after the result is read.
async function prepareDetached(
  checkout: string | undefined,
  worktree: string,
  commit: string,
  store: Store | null = null,
) {
  if (!checkout)
    throw Error("A verdict session needs the repository checkout.");
  if (!fs.existsSync(worktree)) {
    requireDiskSpace(store, path.dirname(worktree), `The worktree ${worktree}`);
    await git(checkout, ["worktree", "add", "--detach", worktree, commit]);
  }
  const head = await taskGit(worktree, ["rev-parse", "HEAD"], { checkout });
  if (head !== commit)
    throw Error(
      `${worktree} is at ${head.slice(0, 12)}, not ${commit.slice(0, 12)}.`,
    );
  return worktree;
}

// A read session whose folder is its own detached worktree, not the
// checkout (the shape planReviewDispatches gives a `process` repository,
// and the responder's at its base branch).
const verdictSession = <
  S extends {
    role?: string;
    permissionClass?: unknown;
    commit?: string | null;
    worktree?: string | null;
  },
>(
  session: S,
  checkout: string | null | undefined,
): session is S & { commit: string; worktree: string } =>
  processRow(session.role ?? "")?.folder === "detached" &&
  session.permissionClass === "read" &&
  (session.commit && session.worktree && checkout
    ? path.resolve(session.worktree) !== path.resolve(checkout)
    : false);

// The main checkout a read session's detached worktree belongs to, from
// its `.git` file (`gitdir: {common}/worktrees/{name}`), or null. A read
// session writes only its result folder, so the file is Avoozl's own; no git
// runs in the folder to read it (D6).
async function checkoutOf(worktree: string) {
  try {
    const line = /^gitdir: (.+)\n?$/.exec(
      fs.readFileSync(path.join(worktree, ".git"), "utf8"),
    );
    const named = line && path.resolve(worktree, line[1]);
    if (!named || path.basename(path.dirname(named)) !== "worktrees")
      return null;
    return path.dirname(path.dirname(path.dirname(named)));
  } catch {
    return null;
  }
}

async function removeDetached(
  checkout: string | null | undefined,
  worktree: string,
) {
  if (!checkout || path.resolve(checkout) === path.resolve(worktree)) return;
  await git(checkout, ["worktree", "remove", "--force", worktree]).catch(
    () => {},
  );
  await git(checkout, ["worktree", "prune"]).catch(() => {});
}

// R94.4a: a write worker's worktree has its git directory in the main
// checkout, outside the child's write roots, so the child only edits and
// Avoozl commits the changed files once it exits. Only a linked worktree is
// committed in, never a main checkout. The commit then goes through Verify
// like any worker's (declared and protected paths, checks). Returns the
// commit, or null when nothing changed.
async function commitChildWork(
  binding: Pick<SessionBinding, "slot" | "taskId" | "attempt">,
  worktree: string | undefined,
  checkout: string | undefined,
) {
  if (!worktree) throw Error(`No supervisor session ${binding.slot}.`);
  if (!checkout)
    throw Error(
      `Avoozl has no checkout for ${worktree}, so it does not commit there.`,
    );
  const real = (file: string) => fs.realpathSync.native(file);
  if (real(worktree) === real(checkout))
    throw Error(
      `${worktree} is not a task worktree; Avoozl commits only there.`,
    );
  return commitWorkerChanges(
    worktree,
    `Avoozl task ${binding.taskId}, attempt ${binding.attempt ?? 1}`,
    { checkout },
  );
}

// A role's snapshot (NK4.1): a scratch folder of its own that the row's
// `snapshot(store, request, {github})` fills. It returns {files: {relative
// path: text}, head?}, where `head` is the commit it was read at, kept on
// the session. Its files are left read-only, and a read-only child's only
// write root in it is `.avoozl/` (harnessPermission), so the child cannot
// change what it reads. Avoozl reads with its own GitHub client; the child
// makes no call.
async function fillSnapshot(
  store: Store,
  row: RoleRow,
  request: ProcessRequest,
  github: unknown,
) {
  if (!row.snapshot || !row.scratch)
    throw Error(`Role ${row.setting} fills no snapshot.`);
  const folder = scratchFolder(row.scratch);
  try {
    const filled = await row.snapshot(store, request, { github });
    writeSnapshot(folder, filled.files);
    return { folder, head: filled.head ?? null };
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

// A new folder of a session's own, by its real path. The temp folder can be
// a symlink (/var to /private/var on macOS), and a harness resolves the
// paths it writes, so its rules (Claude Code's Edit(/{worktree}/...)) must
// name the real one.
export const scratchFolder = (prefix: string) =>
  fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

// Write {relative path: text} under `folder`, each file read-only. A path
// that leaves the folder, or names `.avoozl/`, is refused.
export function writeSnapshot(folder: string, files: Record<string, string>) {
  const root = path.resolve(folder);
  for (const [name, text] of Object.entries(files)) {
    const file = path.resolve(root, name);
    if (
      !file.startsWith(root + path.sep) ||
      path.relative(root, file).split(path.sep)[0] === ".avoozl"
    )
      throw Error(`The snapshot path ${name} is outside its folder.`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: 0o444 });
  }
  return root;
}

// A role whose row names an output file (NK3) reads it once, now that the
// child has exited, with the row's limit and validator. A done result that
// fails becomes blocked with the reason, so it takes the same path a bad
// result file does. A result naming an output for a role with none is
// refused the same way.
export function withChildOutput(
  row: Pick<RoleRow, "output"> | null | undefined,
  result: ProcessResult,
): ProcessResult {
  if (result.state !== "done") return result;
  const output = row?.output;
  if (!output && !result.output) return result;
  const read = !output
    ? { problem: "This role writes no output file." }
    : !result.output
      ? { problem: "The result names no output file." }
      : readChildOutput(result.worktree ?? "", result.output, output);
  return read.problem
    ? { ...result, state: "blocked", text: read.problem }
    : { ...result, outputValue: read.value };
}

// Record a child's result as its session's report, as `runner report` does
// for a chat (R96.2, R96.3): matched by the supervisor's record, the text
// kept as data, and a done report's commit read from the worktree's HEAD,
// never from the child. Avoozl's own commit of the child's edits (R94.4a)
// comes before this read. A verdict role's report fields come from the
// file's `report`, which session.report checks as it does plans_report.
const VERDICT_FIELDS = ["verdict", "findings", "closures", "text"];
export const NOTHING_COMMITTED =
  "The worker reported done, but nothing was committed: the worktree has no change since its base. Make the change with your file tools, check the files are there, then report done.";

// True when the worktree's HEAD holds nothing new: it is the commit the
// task's branch started from, or already in the repository's base branch.
async function nothingCommitted(
  store: Store,
  taskId: string,
  worktree: string | undefined,
) {
  if (!worktree) return false;
  const repository = sessionRepository(store, { task: taskId }),
    base =
      store.get<{ base?: { commit?: string } }>("task_worktrees", taskId)?.base
        ?.commit ??
      (repository?.root &&
        (await branchTip(repository.root, repository.baseBranch ?? "main"))
          ?.commit) ??
      "main";
  try {
    await taskGit(worktree, ["merge-base", "--is-ancestor", "HEAD", base], {
      checkout: repository?.root,
    });
    return true;
  } catch {
    // Not an ancestor (exit 1), or a base git cannot read: not refused.
    return false;
  }
}

export async function finishProcessSession(
  ops: ReportOps,
  binding: Pick<SessionBinding, "slot" | "taskId"> &
    Partial<Pick<SessionBinding, "role" | "permissionClass">>,
  result: ProcessResult,
  store: Store | null = null,
) {
  result = withChildOutput(processRow(binding.role ?? ""), result);
  const hands = processRow(binding.role ?? "")?.hands;
  if (hands === "folder") return null;
  // The same operation a chat's tool call runs, as the supervisor's record of
  // this session (NK5.1), so it gets the same checks. A blocked result
  // records nothing: no reply is posted and no summary stored.
  const asSession = () => ({ caller: cliReportCaller(binding) });
  const report = fieldsOf(result.report);
  if (hands === "post-reply")
    return result.state === "done"
      ? ops.execute(
          "reply.post",
          { body: report.body ?? result.text },
          undefined,
          asSession(),
        )
      : null;
  // A decide call's answer; a blocked or bad one counts as needed.
  if (hands === "decide") {
    if (result.state !== "done") {
      if (store) {
        const { failDecide } = await import("../plugins/check-decide.ts");
        failDecide(
          store,
          binding.taskId,
          result.text || "the call was blocked",
        );
      }
      return null;
    }
    return ops.execute(
      "check.decide.submit",
      fieldsOf(result.outputValue),
      undefined,
      asSession(),
    );
  }
  const head = () =>
    new Promise<string>((resolve, reject) =>
      execFile(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: result.worktree },
        (error, out) => (error ? reject(error) : resolve(out.trim())),
      ),
    );
  const commit = result.state === "done" ? await head() : null;
  // A write worker's done with nothing committed since its base is refused,
  // as a runner's is: it is recorded blocked
  // with that reason, so the next attempt reads why (R96.4, R8).
  if (
    commit &&
    store &&
    binding.permissionClass === "write" &&
    processRow(binding.role ?? "")?.folder === "worktree" &&
    (await nothingCommitted(store, binding.taskId, result.worktree))
  )
    return ops.execute(
      "session.report",
      { taskId: binding.taskId, kind: "blocked", text: NOTHING_COMMITTED },
      undefined,
      { caller: cliReportCaller(binding) },
    );
  const input =
    result.state === "done"
      ? {
          taskId: binding.taskId,
          kind: "done",
          commit,
          ...(reportsVerdict(binding.role ?? "") && result.report
            ? Object.fromEntries(
                VERDICT_FIELDS.filter((key) => report[key] !== undefined).map(
                  (key) => [key, report[key]],
                ),
              )
            : {}),
        }
      : {
          taskId: binding.taskId,
          kind: "blocked",
          text: result.text || "The worker reported blocked.",
        };
  return ops.execute("session.report", input, undefined, {
    caller: cliReportCaller(binding),
  });
}

// The epic context a worker session passed the gate for, or null (epic-context
// EC1 to EC7). A failure reading it gives no context: the session then runs
// exactly as it would with none.
async function workerContext(
  store: Store,
  {
    ops,
    stateDirectory,
  }: { ops: ProcessOps | null | undefined; stateDirectory: string },
  {
    taskId,
    role,
    harness,
    resumed = false,
    slot = null,
    withheld = false,
    attempt = 1,
  }: {
    taskId: string;
    role: string;
    harness?: string | null;
    resumed?: boolean;
    slot?: string | null;
    withheld?: boolean;
    attempt?: number;
  },
) {
  if (!hasContextOps(ops) || role !== "worker") return null;
  const repository = sessionRepository(store, { task: taskId });
  let definition: ReturnType<typeof loadHarnessDefinition> | null;
  try {
    definition = loadHarnessDefinition({
      configDirectory: ops.configDirectory ?? "",
      name: harness ?? repository?.harness ?? DEFAULT_HARNESS,
    });
  } catch {
    definition = null;
  }
  return processContext(
    store,
    { taskId, role, repository, resumed, slot, withheld, attempt },
    {
      ops,
      definition,
      places: {
        home: os.homedir(),
        env: process.env,
        configDirectory: ops.configDirectory ?? undefined,
        stateDirectory,
        workspaceRoots: catalogWorkspaceRoots(
          path.join(path.resolve(stateDirectory), "catalog.sqlite"),
        ),
      },
    },
  );
}

// The tool calls a finished session's MCP servers answered, as Activity
// rows: alias, tool, time, size and error, never an argument or a reply
// (EC7.5).
function importContextCalls(
  store: Store,
  stateDirectory: string,
  binding: Pick<SessionBinding, "slot" | "taskId">,
) {
  const file = path.join(
    supervisorPaths(stateDirectory).children,
    binding.slot,
    "context-calls.jsonl",
  );
  let lines: string[];
  try {
    lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return;
  }
  const seen =
    store.get<{ contextCallsRead?: number }>("session_bindings", binding.slot)
      ?.contextCallsRead ?? 0;
  if (lines.length === seen) return;
  for (const [index, line] of lines.entries()) {
    if (index < seen) continue;
    try {
      // One line the broker wrote (context-broker.ts).
      const call: {
        at?: string;
        alias?: string;
        tool?: string;
        bytes?: number;
        ms?: number;
        error?: string;
      } = JSON.parse(line);
      recordActivity(store, {
        source: "tick",
        kind: "epic-context.call",
        targetId: binding.taskId,
        at: call.at,
        key: `context-call:${binding.slot}:${index}`,
        summary: `MCP ${call.alias} ${call.tool}: ${call.bytes} bytes, ${call.ms} ms${call.error ? `, error ${call.error}` : ""}.`,
      });
    } catch {}
  }
  store.put("session_bindings", {
    ...bindingOf(store, binding.slot),
    contextCallsRead: lines.length,
  });
}

// Consume this workspace's `process` requests (R93.3: the tick only writes
// them): start each claimed one, bind its session, and queue each message.
// Then record the status of each live `process` session. A write worker
// gets its own task worktree (R88.6), never the main checkout. Never throws
// for one request; returns the errors it saw.
// The harness a request runs on: the one it names, else its repository's.
export const requestHarness = (store: Store, request: ProcessRequest) =>
  request.harness ??
  sessionRepository(store, request)?.harness ??
  DEFAULT_HARNESS;

// `blocked` maps a harness name to why it cannot start here (MS5.3); a start
// for one stays queued, so a failed start is not repeated.
export async function drainProcessRequests(
  store: Store,
  {
    stateDirectory,
    prepareWorktree,
    ops = null,
    blocked = new Map(),
  }: {
    stateDirectory: string;
    prepareWorktree?: (
      store: Store,
      input: { taskId?: string },
    ) => Promise<{ path: string }>;
    ops?: ProcessOps | null;
    blocked?: Map<string, string>;
  },
) {
  // Sends, status and stop name only a session; no repository is needed.
  const executor = processExecutor({ stateDirectory });
  const owner = { executor: PROCESS_EXECUTOR, consumer: CONSUMER };
  const errors: { id: string; error: string }[] = [];
  for (const pending of pendingSessionRequests(store, PROCESS_EXECUTOR)) {
    if (
      pending.operation === "start" &&
      blocked.has(requestHarness(store, pending))
    )
      continue;
    const taken = takeSessionRequest(store, pending, {
      ...owner,
      eligible: (request, queued) =>
        sessionStartHold(
          store,
          { task: String(request.task), role: String(request.role) },
          queued,
        ),
    });
    if (!taken) continue;
    const { claimToken } = taken,
      request: ProcessRequest = taken.request;
    try {
      // A follow-up that replaces a stopped session waits until that
      // session has ended, so two never write one folder (EC1.7).
      if (
        request.operation === "start" &&
        request.after &&
        !FINISHED.has(
          store.get<SessionBinding>("session_bindings", request.after)
            ?.status ?? "",
        )
      ) {
        releaseSessionRequest(
          store,
          { id: request.id, claimToken, reason: "before-open" },
          owner,
        );
        continue;
      }
      if (request.operation === "send") {
        // A resume runs the three tests again and carries only what they
        // give this time (EC1.6).
        const slot =
            request.slot ??
            request.sessionId ??
            fail("A message request names no session.", 422),
          held = store.get<SessionBinding>("session_bindings", slot);
        // Text from a login that does not count never reaches a session
        // that holds epic context: the session stops where it is and a new
        // one with none carries the text on (EC1.7).
        if (
          held?.epicContext &&
          hasContextOps(ops) &&
          typeof request.from?.login === "string" &&
          !(await authorCounts(
            ops,
            sessionRepository(store, { task: held.taskId }),
            request.from.login,
          ))
        ) {
          await executor.stop?.(slot);
          enqueueSessionRequests(store, {
            starts: [
              {
                executor: PROCESS_EXECUTOR,
                role: held.role,
                task: held.taskId,
                attempt: (held.attempt ?? 1) + 1,
                brief: request.text,
                worktree: held.worktree ?? null,
                permissionClass: held.permissionClass ?? "write",
                epicContext: false,
                after: slot,
              },
            ],
          });
          recordActivity(store, {
            source: "tick",
            kind: "epic-context.comment",
            summary: `Text from ${request.from.login}, who does not count, was not sent to ${held.taskId}'s session; it stopped and a new one without epic context follows`,
            targetId: held.taskId,
          });
          completeSessionRequest(
            store,
            { id: request.id, claimToken, outcome: "refused" },
            owner,
          );
          continue;
        }
        if (held?.role === "worker") {
          const again = await workerContext(
            store,
            { ops, stateDirectory },
            {
              taskId: held.taskId,
              role: held.role,
              resumed: true,
              slot,
              withheld: request.epicContext === false,
            },
          );
          if (again || held.epicContext) {
            withDatabase(stateDirectory, (db) =>
              setChildContext(db, slot, again?.request ?? null),
            );
            store.put("session_bindings", {
              ...bindingOf(store, slot),
              epicContext: again?.binding ?? null,
            });
          }
        }
        const outcome = await executor.send(
          slot,
          request.text ?? fail("A message request has no text.", 422),
        );
        if (outcome === "accepted") reopenAfterSend(store, request.slot);
        completeSessionRequest(
          store,
          {
            id: request.id,
            claimToken,
            outcome: outcome === "accepted" ? "sent" : "refused",
          },
          owner,
        );
        continue;
      }
      const task = request.task ?? fail("A start names no task.", 422),
        role = request.role ?? fail("A start names no role.", 422);
      const repository = sessionRepository(store, request);
      const row = processRow(role);
      // A snapshot role reads a folder Avoozl fills before it starts (NK4.1).
      const snapshot =
        row?.folder === "snapshot" && !request.worktree
          ? await fillSnapshot(store, row, request, ops?.github).catch(
              (error) => {
                releaseSessionRequest(
                  store,
                  { id: request.id, claimToken, reason: "before-open" },
                  owner,
                );
                throw error;
              },
            )
          : null;
      const worktree = snapshot
        ? snapshot.folder
        : row?.folder === "worktree" &&
            request.permissionClass === "write" &&
            prepareWorktree
          ? (
              await prepareWorktree(store, { taskId: request.task }).catch(
                (error) => {
                  // A full volume holds the start: the request is released
                  // and tried again on a later tick.
                  if (error.lowDisk)
                    releaseSessionRequest(
                      store,
                      { id: request.id, claimToken, reason: "before-open" },
                      owner,
                    );
                  throw error;
                },
              )
            ).path
          : verdictSession(request, repository?.root)
            ? await prepareDetached(
                repository?.root,
                request.worktree,
                request.commit,
                store,
              ).catch((error) => {
                releaseSessionRequest(
                  store,
                  { id: request.id, claimToken, reason: "before-open" },
                  owner,
                );
                throw error;
              })
            : (request.worktree ?? null);
      let sessionId: string,
        context: SessionContextGrant = null;
      try {
        context = await workerContext(
          store,
          { ops, stateDirectory },
          {
            taskId: task,
            role,
            harness: request.harness ?? null,
            withheld: request.epicContext === false,
            attempt: request.attempt ?? 1,
          },
        ).catch((error: unknown) => {
          errors.push({ id: request.id, error: messageOf(error) });
          return null;
        });
        sessionId = await processExecutor({
          stateDirectory,
          repositoryFor: () => repository,
          // The harness the request names (R98.3, R98.4), else the repository's.
          harnessFor: () => request.harness ?? null,
          contextFor: () => context,
          laneFor: () => request.lane ?? null,
        }).start(
          role,
          task,
          worktree,
          request.brief ?? fail("A start has no brief.", 422),
          request.model ?? null,
          request.permissionClass ??
            fail("A start has no permission class.", 422),
        );
      } catch (error) {
        // Nothing opened: the request waits for the next pass.
        releaseSessionRequest(
          store,
          { id: request.id, claimToken, reason: "before-open" },
          owner,
        );
        throw error;
      }
      bindSession(
        store,
        {
          slot: sessionId,
          taskId: request.task,
          role: request.role,
          attempt: request.attempt ?? 1,
          ...(request.title ? { title: request.title } : {}),
          source: "tick",
          ...(request.model ? { model: request.model } : {}),
          ...(request.commit ? { commit: request.commit } : {}),
          ...(request.batch ? { batch: request.batch } : {}),
          ...(request.worktree ? { worktree: request.worktree } : {}),
          ...(request.context ? { context: request.context } : {}),
          // Its lane, and the harness session a review round resumes there.
          ...(request.lane
            ? {
                lane: request.lane.id,
                harnessSession:
                  (request.lane.resume && request.lane.session) ||
                  sessionId.slice("process-".length),
              }
            : {}),
          permissionClass: request.permissionClass,
          executor: PROCESS_EXECUTOR,
          requestId: request.id,
          claimToken,
        },
        { consumer: CONSUMER },
      );
      // What epic context this session got, for its chip and Settings (EC9).
      if (context?.binding)
        store.put("session_bindings", {
          ...bindingOf(store, sessionId),
          epicContext: context.binding,
        });
      // The head a snapshot was read at, kept on the session (NK4.1).
      if (snapshot?.head)
        store.put("session_bindings", {
          ...bindingOf(store, sessionId),
          snapshotHead: snapshot.head,
        });
    } catch (error) {
      errors.push({ id: request.id, error: messageOf(error) });
    }
  }
  for (const binding of store.list<SessionBinding>("session_bindings"))
    if (
      binding.executor === PROCESS_EXECUTOR &&
      !FINISHED.has(binding.status ?? "")
    )
      try {
        const status = await executor.status(binding.slot);
        // Commit before the exit is recorded, so whatever reads the result
        // reads HEAD with the child's work in it. A failed commit keeps the
        // files in the worktree and closes the session unreported, so the
        // retry path resumes there instead of a done at the old HEAD.
        let committed = true;
        if (
          status.startsWith("exited ") &&
          processRow(binding.role ?? "")?.folder === "worktree" &&
          binding.permissionClass === "write"
        )
          await commitChildWork(
            binding,
            withDatabase(
              stateDirectory,
              (db) => childRecord(db, binding.slot)?.worktree,
            ),
            sessionRepository(store, { task: binding.taskId })?.root,
          ).catch((error: unknown) => {
            committed = false;
            errors.push({ id: binding.slot, error: messageOf(error) });
          });
        // A finished run's result file is its report (R96.1, R96.3); one
        // with none, a bad one, or done with a non-zero exit closes the
        // session unreported, which takes the retry path (R96.4).
        if (
          status.startsWith("exited ") &&
          ops &&
          committed &&
          !binding.report
        ) {
          const result = withDatabase(stateDirectory, (db) =>
            childResult(db, binding.slot),
          );
          if (result?.state)
            await finishProcessSession(ops, binding, result, store).catch(
              (error: unknown) =>
                errors.push({ id: binding.slot, error: messageOf(error) }),
            );
        }
        if (status.startsWith("exited ")) {
          // A responder's task is its response, not a task: its checkout is
          // the one its detached worktree belongs to.
          const checkout =
            sessionRepository(store, { task: binding.taskId })?.root ??
            (binding.worktree && binding.commit
              ? await checkoutOf(binding.worktree)
              : null);
          if (verdictSession(binding, checkout))
            await removeDetached(checkout, binding.worktree);
          const row = processRow(binding.role ?? "");
          if (row?.scratch && !binding.worktree) {
            const scratch = withDatabase(
              stateDirectory,
              (db) => childRecord(db, binding.slot)?.worktree,
            );
            if (
              scratch &&
              path.basename(scratch).startsWith(row.scratch) &&
              // By real paths: scratchFolder names it by its real path.
              path.dirname(scratch) === fs.realpathSync.native(os.tmpdir())
            )
              fs.rmSync(scratch, { recursive: true, force: true });
          }
        }
        // A child that exited waiting to be resumed is idle, not closed.
        const now = store.get<SessionBinding & { awaitingResume?: unknown }>(
          "session_bindings",
          binding.slot,
        );
        const waiting =
          status.startsWith("exited ") && now?.awaitingResume === true;
        if (status.startsWith("exited "))
          importContextCalls(store, stateDirectory, binding);
        recordSessionStatus(store, {
          slot: binding.slot,
          status: waiting ? "idle" : bindingStatus(status),
        });
      } catch (error) {
        // An unreadable record is not evidence the child is gone.
        errors.push({ id: binding.slot, error: messageOf(error) });
      }
  return { errors };
}
