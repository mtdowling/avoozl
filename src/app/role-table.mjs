// One row per role Avoozl starts (without-kirocrew D2, NK1). The `process`
// executor's brief, its folder rule and the way a finished child's result is
// recorded read these rows, so a role is described once. `setting` is the
// role's key in the `roles` table (Settings › Models); `roleRun` resolves the
// executor every dispatch uses: the task's `session.harness` pin, then the
// role's saved harness, then the project's executor.
import { harnessExecutor, roleHarness } from "./chat-models.mjs";

// The executor a project's sessions run on: its `executor` setting, else
// `kirocrew` (R93.5; a repository opts in, as the Nupp compiler's does).
export const projectExecutor = (project) =>
  project?.executor === "process" ? "process" : "kirocrew";

// What a child does instead of the Avoozl tools it cannot reach (R96.1): a
// sandboxed child has no database, so its report is the result file.
const RESULT_LIMIT =
  "Write no other file, keep the result file under 8 KB, then exit.";

// A verdict child runs unattended, so only the project's allow-list runs in
// its shell, and a command line runs only when every part of it is listed
// (P59: a verifier that chained `od` and `cat` onto the check was refused
// and reported blocked).
function allowedShell(allowCommands) {
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
//   process  true once the role can run as a child; until then a project's
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
//            post-reply (reply.post, as the session), summary
//            (tasksummary.submit, as the session), falsifier
//            (session.report with the verdict and no commit)
//   finish   the lines that replace the Avoozl tools in a child's brief
//   offline  true when the child gets no network, whatever its project
//            allows: it reads only its folder and brief
// A plan review's output file: {findings: [...], summary?}. The findings'
// own rules are plans_submit_review's.
function planReviewOutput(text) {
  const value = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.findings) ||
    Object.keys(value).some((key) => !["findings", "summary"].includes(key))
  )
    throw Error('write {"findings": [...], "summary"?: "..."}');
  return value;
}

// A review draft's snapshot: the pull request its receipt names, read with
// Avoozl's own GitHub client before the child starts (NK4.1).
async function reviewDraftSnapshot(store, request, { github }) {
  const receipt = store.get("receipts", request.task);
  if (!receipt || !github)
    throw Error("The review draft has no pull request to read.");
  const { pullRequestSnapshot } = await import("./pull-request-snapshot.mjs");
  return pullRequestSnapshot(github, receipt.repository, {
    number: receipt.number,
    title: receipt.title ?? null,
    head: receipt.headSha ?? null,
  });
}

// A pull request review's snapshot: the pull request its receipt names.
async function pullReviewSnapshot(store, request, { github }) {
  const receipt = store.get("receipts", request.task);
  if (!receipt || !github)
    throw Error("The pull request review has no pull request to read.");
  const { pullRequestSnapshot } = await import("./pull-request-snapshot.mjs");
  return pullRequestSnapshot(github, receipt.repository, {
    number: receipt.number,
    title: receipt.title ?? null,
    head: receipt.headSha ?? null,
  });
}

// A pull request review's output file: the review as text.
const REVIEW_TEXT = 65536;
function pullReviewOutput(text) {
  const review = text.trim();
  if (!review || review.length > REVIEW_TEXT)
    throw Error(`write a review of 1–${REVIEW_TEXT} characters`);
  return review;
}

// A review draft's output file: {body, comments?}. Each field's own rules
// are plans_post_review_draft's.
function reviewDraftOutput(text) {
  const value = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.body !== "string" ||
    (value.comments !== undefined && !Array.isArray(value.comments)) ||
    Object.keys(value).some((key) => !["body", "comments"].includes(key))
  )
    throw Error('write {"body": "...", "comments"?: [...]}');
  return value;
}

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
  // The rows below run as Kiro Crew chats until their tasks land.
  // The falsifier judges a worker's findings in a detached copy of the
  // task's code; its verdict is recorded with no commit (NK2.1).
  falsifier: {
    setting: "falsifier",
    roles: ["falsifier"],
    prompt: "falsifier",
    process: true,
    access: "read",
    folder: "detached",
    hands: "falsifier",
    finish: (allowCommands) => [
      "You run without Avoozl's tools, so this replaces the plans_report step above.",
      "Avoozl already added a detached copy of the task's code: it is the current folder. Read only there, not in the checkout the brief names.",
      allowedShell(allowCommands),
      'Instead of calling plans_report, write .avoozl/result.json in the current folder: {"state": "done", "report": {"verdict": "stands" | "refuted", "evidence": "<what you found, with paths>", "confidence": "low" | "medium" | "high"}}, or {"state": "blocked", "text": "<why>"} if you cannot judge the findings. Name no commit.',
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
  // The summary reads only its brief; Avoozl stores it on the task (NK2.3).
  taskSummary: {
    setting: "taskSummary",
    roles: ["task-summary"],
    prompt: "task-summary",
    process: true,
    access: "read",
    folder: "scratch",
    scratch: "avoozl-summary-",
    offline: true,
    hands: "summary",
    finish: () => [
      'You run without Avoozl\'s tools. Instead of calling plans_submit_task_summary, write .avoozl/result.json in the current folder: {"state": "done", "report": {"summary": "<your summary>"}}.',
      RESULT_LIMIT,
    ],
  },
  // The issue planner's sessions are `planner` sessions, so a child runs by
  // the planner row. Its critique runs as a child in the spec folder's
  // `avoozl/` folder, its one write root (NK2.4); its breakdown in the spec
  // folder, handing back its kind and reason (NK5.4).
  issuePlanner: {
    setting: "issuePlanner",
    roles: [],
    process: true,
    access: "write",
  },
  // Plan review reads the plan snapshot Avoozl prepares and hands back its
  // findings and summary in an output file. A round counts only with a
  // served model the harness output names (NK3.3, NK5.2).
  planReviewer: {
    setting: "planReviewer",
    roles: ["plan-review"],
    prompt: "plan-review",
    process: true,
    access: "read",
    hands: "plan-review",
    served: true,
    // shortcut: a byte limit for the file only; the 50 findings and every
    // field limit are plans_submit_review's own, applied when it is recorded.
    output: { limit: 1_048_576, validate: planReviewOutput },
    finish: () => [
      'You run without Avoozl\'s tools. Instead of calling plans_submit_review, write your findings to .avoozl/output/review.json in the current folder as {"findings": [<each finding as plans_submit_review takes it>], "summary": "<optional>"}, then write .avoozl/result.json as {"state": "done", "output": "review.json"}. Avoozl fills in the plan and revision.',
      "Write no other file, then exit.",
    ],
  },
  // The plan answer edits only its spec folder; on exit Avoozl stores the
  // revision as this session's and records each answer (NK5.3).
  planAnswer: {
    setting: "planAnswer",
    roles: ["plan-answer"],
    prompt: "planner",
    process: true,
    access: "write",
    folder: "spec",
    hands: "plan-answer",
    finish: () => [
      "You run without Avoozl's tools, so skip plans_plan_review, plans_save_plan and plans_answer_review: the findings are in your brief, and the current folder is your spec folder.",
      'Edit the spec files here for each finding you fix. Then write .avoozl/result.json as {"state": "done", "report": {"answers": [{"id": "<finding id>", "action": "fixed" | "answered", "text": "<what you changed, or why not>"}]}}. Avoozl stores your edited folder as the new revision and names it on each fixed answer. If you changed no file, answer every finding "answered".',
      RESULT_LIMIT,
    ],
  },
  // A review draft reads the pull request snapshot and hands back its body
  // and line comments; Avoozl posts the pending review for the recorded
  // head only, and never submits it (NK4.3).
  reviewDraft: {
    setting: "reviewDraft",
    roles: ["review-draft"],
    prompt: "review-draft",
    process: true,
    access: "read",
    folder: "snapshot",
    scratch: "avoozl-draft-",
    offline: true,
    snapshot: reviewDraftSnapshot,
    hands: "review-draft",
    // shortcut: a byte limit for the file only; the 65,536-character body,
    // the 50 comments and each comment's limit are plans_post_review_draft's.
    output: { limit: 4_194_304, validate: reviewDraftOutput },
    finish: () => [
      "You run without Avoozl's tools or network. The pull request is in pull-request/ in the current folder: read pull-request/README.md first. Do not run gh.",
      'Instead of calling plans_post_review_draft, write your draft to .avoozl/output/draft.json as {"body": "<summary>", "comments": [{"path": "<file>", "line": <line in the new file>, "body": "<comment>"}]}, then write .avoozl/result.json as {"state": "done", "output": "draft.json"}. Use only lines shown in pull-request/diff/; Avoozl drops a comment outside the diff. Avoozl posts the pending review; it is never submitted.',
      "Write no other file, then exit.",
    ],
  },
  // A pull request review reads the snapshot and hands back its review in
  // an output file; Avoozl stores it with the session and posts nothing
  // (NK4.4).
  prReview: {
    setting: "prReview",
    roles: ["pr-review"],
    prompt: "code-review",
    process: true,
    access: "read",
    folder: "snapshot",
    scratch: "avoozl-review-",
    offline: true,
    snapshot: pullReviewSnapshot,
    hands: "pr-review",
    // 65,536 characters, at up to four bytes each.
    output: { limit: 262_144, validate: pullReviewOutput },
    finish: () => [
      "You run without Avoozl's tools or network. The pull request is in pull-request/ in the current folder: read pull-request/README.md first. Do not run gh.",
      'Write your whole review, each comment with its file and line, to .avoozl/output/review.md, then write .avoozl/result.json as {"state": "done", "output": "review.md"}. Avoozl keeps it with this session and posts nothing.',
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

// The executor a role's request names: the task's `session.harness` pin
// (where the role has a task), else the role's harness saved in Settings ›
// Models, else the project's executor; a row that cannot run as a child yet
// keeps `kirocrew` there, so a project's setting never breaks it.
// Returns {executor, harness?}.
export function roleRun(setting, { config, task, project } = {}) {
  const row = ROLE_TABLE[setting];
  if (!row) throw Error(`${setting} is not a role in the role table.`);
  const named = task?.session?.harness ?? roleHarness(config, setting);
  if (named) return harnessExecutor(named);
  return { executor: row.process ? projectExecutor(project) : "kirocrew" };
}
