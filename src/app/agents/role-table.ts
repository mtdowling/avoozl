// One row per role Avoozl starts (without-kirocrew D2, NK1, simplify §D10):
// the worker, the reviewer, the responder, a plugin check's decide call, and
// the standalone page's assistant. The `process` executor's brief, its folder
// rule and the way a finished child's result is recorded read these rows, so
// a role is described once. `setting` is the role's key in the `roles` table
// (Settings › Models); `roleRun` resolves the executor every dispatch uses:
// the task's `session.harness` pin, then the role's saved harness, then the
// repository's executor.
import { decideOutput } from "../plugins/decide-output.ts";
import { fail, type Store } from "../store/store.ts";

// The field comments above ROLE_TABLE describe each one.
export interface RoleRow {
  setting: string;
  roles: (string | RegExp)[];
  prompt?: string;
  process: boolean;
  access: "read" | "write";
  folder: "worktree" | "detached" | "given" | "snapshot";
  scratch?: string;
  offline?: boolean;
  verdict?: boolean;
  snapshot?: (
    store: Store,
    request: Record<string, unknown>,
    options?: { github?: unknown },
  ) => Promise<{ files: Record<string, string>; head?: string | null }>;
  hands: "report" | "folder" | "post-reply" | "decide";
  output?: { limit: number; validate: (text: string) => unknown };
  finish?: (allowCommands?: string[][] | null) => string[];
}
// A config with a `roles` table: `.avoozl.json` or a layer of it.
export type RolesConfig =
  | { roles?: unknown; [key: string]: unknown }
  | null
  | undefined;
// Saved role settings: role -> field -> value.
export type RoleSettings = Record<string, Record<string, string>>;

// The executor a repository's sessions run on: its `executor` setting, else
// `kirocrew` (R93.5; a repository opts in, as the Nupp compiler's does).
export const repositoryExecutor = (
  repository: { executor?: unknown } | null | undefined,
) => (repository?.executor === "process" ? "process" : "kirocrew");

// What a child does instead of the Avoozl tools it cannot reach (R96.1): a
// sandboxed child has no database, so its report is the result file.
const RESULT_LIMIT =
  "Write no other file, keep the result file under 8 KB, then exit.";

// A verdict child runs unattended, so only the repository's allow-list runs in
// its shell, and a command line runs only when every part of it is listed.
export function allowedShell(allowCommands?: string[][] | null) {
  if (!allowCommands?.length)
    return "Your shell runs no command here: read files with your file tools.";
  return `Your shell runs only these commands, one per call, with no ; && | or $(...): ${allowCommands
    .map((command) => `\`${command.join(" ")}\``)
    .join(", ")}. Read files with your file tools.`;
}

const verdictFinish = (allowCommands?: string[][] | null) => [
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
//            detached (a worktree at the commit), given (the folder the
//            request names, used as it is: the workspace root), snapshot (a
//            scratch folder `snapshot(store, request)` fills with {path: text})
//   scratch  the name prefix of a snapshot folder in the temp
//            folder, which the drain removes once the child exits
//   output   {limit, validate}: the one output file under .avoozl/output/ a
//            child may name in its result, at most `limit` bytes, checked
//            by `validate(text)`, which throws its reason (NK3)
//   hands    how the result is recorded: report (session.report), folder
//            (nothing to record), post-reply (reply.post, as the session),
//            decide (the plugin check's answer)
//   finish   the lines that replace the Avoozl tools in a child's brief
//   offline  true when the child gets no network, whatever its repository
//            allows: it reads only its folder and brief
export const ROLE_TABLE: Readonly<Record<string, RoleRow>> = Object.freeze({
  worker: {
    setting: "worker",
    roles: ["worker"],
    process: true,
    access: "write",
    folder: "worktree",
    hands: "report",
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
  // The reviewer is adversarial and on by default (simplify §D10): a separate
  // session that never saw the worker's reasoning judges the exact head.
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
      (await import("../plugins/check-decide.ts")).decideSnapshot(
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

// Each row's key in the `roles` table, in table order.
export const ROLES = Object.freeze(
  Object.values(ROLE_TABLE).map((row) => row.setting),
);

const matches = (row: RoleRow, role: string) =>
  row.roles.some((r) => (r instanceof RegExp ? r.test(role) : r === role));

// The row a dispatch role runs by, or null.
export const rowFor = (role: string) =>
  Object.values(ROLE_TABLE).find((row) => matches(row, role)) ?? null;

// The row a `process` child of this role follows, or null for a role that
// does not run as a child yet.
export const processRow = (role: string) => {
  const row = rowFor(role);
  return row?.process ? row : null;
};

// The executor a role's request names: the role's harness saved in
// Settings › Models, else the repository's executor; a row that cannot run as a child yet
// keeps `kirocrew` there, so a repository's setting never breaks it.
// Returns {executor, harness?}.
// shortcut: every row runs as a child (`process: true`); drop the field if no
// role is added that cannot.
export function roleRun(
  setting: string,
  {
    config,
    repository,
  }: {
    config?: RolesConfig;
    repository?: { executor?: unknown } | null;
  } = {},
): { executor: string; harness?: string } {
  const row = ROLE_TABLE[setting];
  if (!row) throw Error(`${setting} is not a role in the role table.`);
  const named = roleHarness(config, setting);
  if (named) return harnessExecutor(named);
  return {
    executor: row.process ? repositoryExecutor(repository) : "kirocrew",
  };
}

// The `roles` table (Settings › Models, R98.6), saved in .avoozl.json: each
// role's harness, and for the worker its agent and model, and for the decide
// call its model. A role left out, or "auto", runs on its repository's
// executor and its agent's own model. A task's `session.harness` pin wins
// over both (R98.4). `kirocrew` is a Kiro Crew chat; any other harness name
// is a `process` child of that definition.
export const KIROCREW_HARNESS = "kirocrew";
const HARNESS = /^[a-z][a-z0-9-]{0,60}$/;
const MODEL = /^(?:auto|[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isHarnessName = (value: unknown): value is string =>
  typeof value === "string" && HARNESS.test(value);
// The fields a row may set, by role.
export const ROLE_FIELDS = Object.freeze(["harness", "model"]);
export const AGENT_ROLE_FIELDS = Object.freeze(["harness", "agent", "model"]);
export const HARNESS_ROLE_FIELDS = Object.freeze(["harness"]);
const FIELDS: Record<string, readonly string[]> = {
  worker: AGENT_ROLE_FIELDS,
  checkDecide: ROLE_FIELDS,
};
const fieldsOf = (role: string) => FIELDS[role] ?? HARNESS_ROLE_FIELDS;

// The saved `roles` table, field by field. Values are as saved, `auto`
// included.
export function resolveRoles(config: RolesConfig) {
  const table: RoleSettings = {};
  const roles = config?.roles;
  if (record(roles))
    for (const role of ROLES) {
      const row = roles[role];
      if (record(row))
        for (const field of fieldsOf(role)) {
          const value = row[field];
          if (typeof value === "string" && value)
            (table[role] ??= {})[field] = value;
        }
    }
  return table;
}

// Tables merged field by field, later over earlier.
export function mergeRoles(...tables: (RoleSettings | null | undefined)[]) {
  const merged: RoleSettings = {};
  for (const table of tables)
    for (const [role, row] of Object.entries(table || {}))
      merged[role] = { ...merged[role], ...row };
  return merged;
}

// The model a role's chat opens on, or null for the agent's own.
export function chatModel(config: RolesConfig, role: string) {
  const model = resolveRoles(config)[role]?.model;
  return typeof model === "string" && model !== "auto" && MODEL.test(model)
    ? model
    : null;
}

// The harness a role's saved setting names, or null for its repository's.
export function roleHarness(config: RolesConfig, role: string) {
  const harness = resolveRoles(config)[role]?.harness;
  return isHarnessName(harness) && harness !== "auto" ? harness : null;
}

// The executor a named harness runs on.
export function harnessExecutor(harness: string) {
  return harness === KIROCREW_HARNESS
    ? { executor: KIROCREW_HARNESS }
    : { executor: "process", harness };
}

// Check a config's `roles` value; throws naming the key. A role that is not
// a row of the table is refused by name. Returns the checked `roles`.
export function validateRoles(config: RolesConfig, where = "roles") {
  const value = config?.roles;
  if (value === undefined) return {};
  if (!record(value)) fail(`${where} must be an object.`);
  for (const [role, row] of Object.entries(value)) {
    const at = `${where}.${role}`;
    if (!ROLES.includes(role))
      fail(`${at} is not a role; use ${ROLES.join(", ")}.`);
    if (!record(row)) fail(`${at} must be an object.`);
    const fields = fieldsOf(role);
    for (const [field, v] of Object.entries(row)) {
      if (!fields.includes(field))
        fail(`${at}.${field} is not a role setting; use ${fields.join(", ")}.`);
      if (field === "harness" && !isHarnessName(v))
        fail(
          `${at}.harness must be ${KIROCREW_HARNESS}, a harness name or "auto".`,
        );
      if (field === "model" && (typeof v !== "string" || !MODEL.test(v)))
        fail(`${at}.model must be a model name or "auto".`);
      if (field === "agent" && (typeof v !== "string" || !AGENT.test(v)))
        fail(`${at}.agent must be an agent name.`);
    }
  }
  return structuredClone(value);
}
