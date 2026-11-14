// The provenance marker (design D5.1, RC3.1): one HTML comment line in an
// issue body that names the approved spec, the tasks, the commit and the
// approver, so `verify-issue` can check them. It is not a signature. Values
// are IDs, a login, a commit and a repository name only; nothing in a
// refusal repeats a value, so a message is safe to post.
import { COMMIT, LOGIN, TASK_ID } from "./github-marker.mjs";
import { fail } from "./store.mjs";
import { secretReason } from "./workspace-repository.mjs";

const VERSION = "1";
const REQUIRED = ["spec", "tasks", "commit", "approved-by"];
const SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9._-]{1,100}$/;
const KEY = /^[a-z][a-z0-9-]{0,31}$/;
// An `avoozl` comment on one line. `avoozl-task` (the managed marker) does
// not match because a space or the end of the comment must follow the word.
const MARKER = /<!--[ \t]*avoozl(?:[ \t]+([^\r\n]*?))?[ \t]*-->/g;

const VALUES = {
  spec: (v) => SPEC.test(v) && !v.includes(".."),
  tasks: (v) => {
    const ids = v.split(",");
    return (
      ids.every((id) => TASK_ID.test(id)) && new Set(ids).size === ids.length
    );
  },
  commit: (v) => COMMIT.test(v),
  "approved-by": (v) => LOGIN.test(v),
  plans: (v) => REPOSITORY.test(v) && !v.includes(".."),
};

const bad = (key) => ({
  code: "bad-value",
  message: `The provenance marker has an invalid ${key}.`,
});

function checkValue(key, value) {
  return VALUES[key](value) && !secretReason(value);
}

// Returns { marker, problem }: exactly one is null. `problem.code` is
// missing, duplicate, malformed, version, missing-key or bad-value.
export function parseProvenance(body) {
  const found = [...String(body ?? "").matchAll(MARKER)];
  if (!found.length)
    return {
      marker: null,
      problem: {
        code: "missing",
        message: "The issue has no provenance marker.",
      },
    };
  if (found.length > 1)
    return {
      marker: null,
      problem: {
        code: "duplicate",
        message: "The issue has more than one provenance marker.",
      },
    };
  const fields = new Map();
  for (const token of (found[0][1] || "").split(/[ \t]+/).filter(Boolean)) {
    const at = token.indexOf("=");
    const key = at < 1 ? "" : token.slice(0, at);
    if (!KEY.test(key) || fields.has(key))
      return {
        marker: null,
        problem: {
          code: "malformed",
          message: "The provenance marker is not a list of key=value pairs.",
        },
      };
    fields.set(key, token.slice(at + 1));
  }
  if (fields.get("v") === undefined && !fields.size)
    return {
      marker: null,
      problem: {
        code: "malformed",
        message: "The provenance marker has no keys.",
      },
    };
  if (fields.get("v") !== VERSION)
    return {
      marker: null,
      problem: {
        code: "version",
        message: "The provenance marker has no known version.",
      },
    };
  for (const key of REQUIRED)
    if (!fields.has(key))
      return {
        marker: null,
        problem: {
          code: "missing-key",
          message: `The provenance marker has no ${key}.`,
        },
      };
  for (const key of [...REQUIRED, "plans"])
    if (fields.has(key) && !checkValue(key, fields.get(key)))
      return { marker: null, problem: bad(key) };
  const marker = {
    spec: fields.get("spec"),
    tasks: fields.get("tasks").split(","),
    commit: fields.get("commit"),
    approvedBy: fields.get("approved-by"),
  };
  if (fields.has("plans")) marker.plans = fields.get("plans");
  return { marker, problem: null };
}

// Writes the line, refusing any value the reader would refuse.
export function renderProvenance({ spec, tasks, commit, approvedBy, plans }) {
  const pairs = [
    ["spec", spec],
    ["tasks", Array.isArray(tasks) && tasks.length ? tasks.join(",") : ""],
    ["commit", commit],
    ["approved-by", approvedBy],
  ];
  if (plans !== undefined) pairs.push(["plans", plans]);
  for (const [key, value] of pairs)
    if (typeof value !== "string" || !checkValue(key, value))
      fail(`Invalid provenance marker: ${key}.`, 422);
  return `<!-- avoozl v=${VERSION} ${pairs.map(([k, v]) => `${k}=${v}`).join(" ")} -->`;
}
