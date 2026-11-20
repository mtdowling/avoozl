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
    scenario: "the review role every repository gets",
    result: "a verdict",
  },
  {
    id: "planner",
    drives: ["planner"],
    scenario: "a New plan request",
    result: "a spec folder that lints clean",
  },
  {
    id: "retro",
    drives: ["retro"],
    scenario: "a retrospective",
    result: "a reply",
    driven: false,
    why: "retros run as the avoozl-retro skill, so no tick or operation starts a retro child",
  },
  {
    id: "responder",
    drives: ["responder"],
    scenario: "a new discussion in the category the policy names",
    result: "a posted reply",
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
