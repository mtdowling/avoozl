// The rows of the role proof (machine-server D6): one scenario per role the
// process executor runs, and the result each reaches. A test fails when a
// ROLE_TABLE row with `process: true` is missing here, so a new role cannot
// skip the proof. `drives` names the role-table settings the scenario runs;
// `driven: false` says the proof cannot drive that role and why.
// One row: what it drives, its scenario and result, and why a row the
// proof cannot drive is skipped.
export type Row = {
  id: string;
  drives: string[];
  scenario: string;
  result: string;
} & ({ driven?: true; why?: undefined } | { driven: false; why: string });
export const ROWS: readonly Row[] = Object.freeze([
  {
    id: "worker",
    drives: ["worker"],
    scenario: "a one-file task",
    result: "a commit by Avoozl, landed",
  },
  {
    id: "reviewer",
    drives: ["reviewer"],
    scenario: "the review role every repository gets",
    result: "a verdict",
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
