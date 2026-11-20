// The rows of the role proof (machine-server D6): one scenario per role the
// process executor runs, and the result each reaches. A test fails when a
// ROLE_TABLE row with `process: true` is missing here, so a new role cannot
// skip the proof. `drives` names the role-table settings the scenario runs;
// `driven: false` says the proof cannot drive that role and why.
export const ROWS = Object.freeze([
  {
    id: "worker",
    drives: ["worker"],
    scenario: "a one-file task",
    result: "a commit by Avoozl, landed",
  },
  {
    id: "verifier",
    drives: ["verifier"],
    scenario: "a task in a repository with no checks",
    result: "a verdict",
    driven: false,
    why: "the scratch repository has checks, which Avoozl runs itself; a verifier opens only for a repository with none",
  },
  {
    id: "reviewer",
    drives: ["reviewer"],
    scenario: "one review role a spec adds",
    result: "a verdict",
    driven: false,
    why: "the scratch spec adds no review role, so none runs",
  },
  {
    id: "falsifier",
    drives: ["falsifier"],
    scenario: "investigate first on",
    result: "a verdict on the findings",
  },
  {
    id: "planner",
    drives: ["planner", "planAnswer"],
    scenario: "a New plan request, then one plan review finding",
    result: "a spec folder; the answers",
  },
  {
    id: "plan-reviewer",
    drives: ["planReviewer"],
    scenario: "plan review on that spec, on a second model",
    result: "findings",
  },
  {
    id: "retro",
    drives: ["retro"],
    scenario: "after the task lands",
    result: "a reply",
  },
  {
    id: "responder",
    drives: ["responder"],
    scenario: "a reply request on an issue",
    result: "a posted reply",
  },
  {
    id: "task-summary",
    drives: ["taskSummary"],
    scenario: "a person asks for the landed task's summary",
    result: "a stored summary",
  },
  {
    id: "pull-request-review",
    drives: ["prReview"],
    scenario: "a labeled pull request",
    result: "a stored review",
  },
  {
    id: "assist",
    drives: ["assist"],
    scenario: "Ask for help on the page",
    result: "an answer, no file",
  },
  {
    id: "check-decide",
    drives: ["checkDecide"],
    scenario: "a plugin check that needs a decision",
    result: "an answer",
    driven: false,
    why: "it needs a plugin check on the scratch repository, which this proof does not install",
  },
  {
    id: "line-watch",
    drives: [],
    scenario: "a red head on main",
    result: "the line stops; no session request",
  },
]);
