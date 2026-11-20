// One row per role Avoozl starts (without-kirocrew D2, NK1). The `process`
// executor's brief, its folder rule and the way a finished child's result is
// recorded read these rows, so a role is described once. `setting` is the
// role's key in the `roles` table (Settings › Models); `roleRun` resolves the
// executor every dispatch uses: the task's `session.harness` pin, then the
// role's saved harness, then the repository's executor.
import { harnessExecutor, roleHarness } from "../settings/chat-models.mjs";
import { decideOutput } from "../plugins/decide-output.mjs";

// The executor a repository's sessions run on: its `executor` setting, else
// `kirocrew` (R93.5; a repository opts in, as the Nupp compiler's does).
export const repositoryExecutor = (repository) =>
  repository?.executor === "process" ? "process" : "kirocrew";

// What a child does instead of the Avoozl tools it cannot reach (R96.1): a
// sandboxed child has no database, so its report is the result file.
const RESULT_LIMIT =
  "Write no other file, keep the result file under 8 KB, then exit.";

// A verdict child runs unattended, so only the repository's allow-list runs in
// its shell, and a command line runs only when every part of it is listed
// (P59: a verifier that chained `od` and `cat` onto the check was refused
// and reported blocked).
export function allowedShell(allowCommands) {
  if (!allowCommands?.length)
    return "Your shell runs no command here: read files with your file tools.";
  return `Your shell runs only these commands, one per call, with no ; && | or $(...): ${allowCommands
    .map((command) => `\`${command.join(" ")}\``)
    .join(", ")}. Read files with your file tools.`;
}

const verdictFinish = (allowCommands) => [
  "You run without Avoozl's tools, so these steps replace the worktree and plans_report steps above.",
  "1. Avoozl already added the detached worktree at the commit: it is the current folder. Do not run git worktree add, and read only there.",
  allowedShell(allowCommands),
  '2. Instead of calling plans_report, write .avoozl/result.json in the current folder: {"state": "done", "report": {<every field of the plans_report input except taskId and commit>}}, or {"state": "blocked", "text": "<why>"} if you cannot judge the commit. Avoozl reads the commit from the folder itself.',
  RESULT_LIMIT,
];

// Fields of Rows:
//   setting  the role's key in the `roles` table
//   roles    the dispatch role names the row covers
//   prompt   the role's prompt file, put at the top of a child's brief
//   process  true once the role can run as a child; until then a repository's
//            `process` executor does not move it (a saved harness does)
//   access   what the child may do to files
//   folder   how the drain makes the child's folder: worktree (the task's),
//            detached (a worktree at the commit), scratch (an empty folder),
//            spec (the spec folder the request names), given (the folder the
//            request names, used as it is: the workspace root), snapshot (a
//            scratch folder `snapshot(store, request)` fills with {path: text})
//   scratch  the name prefix of a scratch or snapshot folder in the temp
//            folder, which the drain removes once the child exits
//   output   {limit, validate}: the one output file under .avoozl/output/ a
//            child may name in its result, at most `limit` bytes, checked
//            by `validate(text)`, which throws its reason (NK3)
//   hands    how the result is recorded: report (session.report), reply (the
//            retro's reply), folder (the stored folder; nothing to record),
//            post-reply (reply.post, as the session), decide (the plugin
//            check's answer)
//   finish   the lines that replace the Avoozl tools in a child's brief
//   offline  true when the child gets no network, whatever its repository
//            allows: it reads only its folder and brief
export const ROLE_TABLE = Object.freeze({
  worker: {
    setting: "worker",
    roles: ["worker"],
    process: true,
    access: "write",
    folder: "worktree",
    hands: "report",
  },
  verifier: {
    setting: "verifier",
    roles: ["verifier"],
    prompt: "verifier",
    process: true,
    access: "read",
    folder: "detached",
    hands: "report",
    verdict: true,
    finish: verdictFinish,
  },
  reviewer: {
    setting: "reviewer",
    roles: [/^review:/],
    prompt: "reviewer",
    process: true,
    access: "read",
    folder: "detached",
    hands: "report",
    verdict: true,
    finish: verdictFinish,
  },
  planner: {
    setting: "planner",
    roles: ["planner"],
    prompt: "planner",
    process: true,
    access: "write",
    folder: "spec",
    hands: "folder",
    // The model that wrote a revision must be proven for its plan review
    // to count (NK5.2), so a planner child's served model is read too.
    served: true,
    finish: () => [
      "You run without Avoozl's tools. Write the spec folder's files as above, but skip plans_create_plan, plans_save_plan and every other plans_* call: Avoozl stores the folder once it lints clean. Then exit.",
    ],
  },
  retro: {
    setting: "retro",
    roles: ["retro"],
    prompt: "retro",
    process: true,
    access: "read",
    folder: "scratch",
    scratch: "avoozl-retro-",
    hands: "reply",
    finish: () => [
      'You run without Avoozl\'s tools. Instead of answering in chat, write your one JSON reply to .avoozl/result.json in the current folder as {"state": "done", "report": <the reply object>}.',
      RESULT_LIMIT,
    ],
  },
  // The responder reads the repository at its base branch and hands back
  // the reply; Avoozl posts it after the checks a chat's reply gets (NK2.2).
  responder: {
    setting: "responder",
    roles: ["responder"],
    prompt: "responder",
    process: true,
    access: "read",
    folder: "detached",
    offline: true,
    hands: "post-reply",
    finish: () => [
      'You run without Avoozl\'s tools. Instead of calling plans_post_reply, write .avoozl/result.json in the current folder: {"state": "done", "report": {"body": "<your reply>"}}, or {"state": "blocked", "text": "<why>"} if you cannot draft one. Avoozl checks the reply and posts it.',
      RESULT_LIMIT,
    ],
  },
  // A plugin check's decide call (plugin-checks D5): the check author's
  // prompt and the task text or diff in a snapshot, read only and offline;
  // its one answer is a 1 KB output file.
  checkDecide: {
    setting: "checkDecide",
    roles: ["check-decide"],
    prompt: "check-decide",
    process: true,
    access: "read",
    folder: "snapshot",
    scratch: "avoozl-decide-",
    offline: true,
    snapshot: async (store, request) =>
      (await import("../plugins/check-decide.mjs")).decideSnapshot(
        store,
        request,
      ),
    hands: "decide",
    output: { limit: 1024, validate: decideOutput },
    finish: () => [
      "You run without Avoozl's tools or network. Read README.md and prompt.md in the current folder, then the input file. Do not run any command.",
      'Write your answer to .avoozl/output/decide.json as {"needed": true | false, "reason": "<one line, at most 300 characters>"}, then write .avoozl/result.json as {"state": "done", "output": "decide.json"}.',
      "Write no other file, then exit.",
    ],
  },
  // The page's Open chat on a machine with no Kiro Crew (standalone-web SW7):
  // a read-only child in the workspace root that answers and proposes.
  assist: {
    setting: "assist",
    roles: ["assist"],
    prompt: "assist",
    process: true,
    access: "read",
    folder: "given",
    hands: "folder",
    finish: () => [
      "You run without Avoozl's tools. Answer in your reply, then exit. Write no file.",
    ],
  },
});

export const ROLE_SETTINGS = Object.freeze(
  Object.values(ROLE_TABLE).map((row) => row.setting),
);

const matches = (row, role) =>
  row.roles.some((r) => (r instanceof RegExp ? r.test(role) : r === role));

// The row a dispatch role runs by, or null.
export const rowFor = (role) =>
  Object.values(ROLE_TABLE).find((row) => matches(row, role)) ?? null;

// The row a `process` child of this role follows, or null for a role that
// does not run as a child yet.
export const processRow = (role) => {
  const row = rowFor(role);
  return row?.process ? row : null;
};

// The executor a role's request names: the role's harness saved in
// Settings › Models, else the repository's executor; a row that cannot run as a child yet
// keeps `kirocrew` there, so a repository's setting never breaks it.
// Returns {executor, harness?}.
export function roleRun(setting, { config, repository } = {}) {
  const row = ROLE_TABLE[setting];
  if (!row) throw Error(`${setting} is not a role in the role table.`);
  const named = roleHarness(config, setting);
  if (named) return harnessExecutor(named);
  return {
    executor: row.process ? repositoryExecutor(repository) : "kirocrew",
  };
}
