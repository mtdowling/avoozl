// The spec journal (Requirement 102.9-102.11, design §4.32.4): compact,
// structured records of significant transitions, kept as comments on the
// spec's issue, or in a local file when the workspace has no GitHub.
//
// - Schema. Every field is on an explicit allowlist, and every value has a
//   narrow shape, so a record cannot carry prose, paths, URLs, command
//   arguments, environment values, output or spend. On a public surface
//   spec and task identifiers must be opaque and repositories must be named
//   as public by the caller. A hidden HTML comment has the issue's
//   visibility, so the same schema applies to it.
// - Actor. The comment's authenticated author and that login's permission,
//   never a name inside the record (there is no field for one). A record
//   that says which machine acted uses its public alias; there is no
//   hostname field.
// - Order. Records replay in ascending comment ID after every page is read
//   (the client's paginate refuses rather than truncates).
// - Links. Each record names the previous record's ID and digest. A changed
//   or missing linked record, a second root, two children of one record,
//   or one operation ID with two payloads holds the journal. A retried
//   write with an identical payload is one effective transition.
// - Generations. Only a generation record advances the driver generation,
//   by exactly one. A record from an older generation authorizes nothing.
//
// Limit: a deleted tail record cannot be detected from comments alone,
// because nothing after it links to it. A rebuilt spec therefore stays held
// and reconciles git and GitHub facts (§4.32.10). Comments are not an
// immutable audit log and not a compare-and-swap lock (R102.10).
import fs from "node:fs";
import path from "node:path";
import { digest } from "../model.mjs";
import { globalAvoozlConfigPath } from "./layered-config.mjs";
import { privacyHits, privacyRules } from "./privacy.mjs";
import { fail } from "./store.mjs";
import { OUTCOME_KINDS } from "./task-outcomes.mjs";

export const JOURNAL_VERSION = 1;
// Significant transitions only. Poll results, frontiers, rankings and
// routine checkpoint notices have no kind, so they cannot be written.
export const JOURNAL_KINDS = [
  "outcome",
  "checkpoint",
  "approval",
  "control",
  "generation",
  "claim",
  "intent",
  "void",
  "reanchor",
];
const CONTROL_FLAGS = ["hold", "stop", "resume", "release", "budget"];
const CONCLUSIONS = [
  "success",
  "failure",
  "neutral",
  "cancelled",
  "skipped",
  "timed_out",
  "not-run",
];
const WRITERS = ["admin", "maintain", "write"];
const MARKER = /<!-- avoozl-journal:v1 (\{.*?\}) -->/s;

const OPAQUE = /^[0-9a-f]{12,64}$/;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SPEC = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TASK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const ALIAS = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;
const CHECK = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,79}$/;

const count = (value, max = 1e9) =>
  Number.isSafeInteger(value) && value >= 0 && value <= max;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const key = (value) => JSON.stringify(canonical(value));
export const recordDigest = (record) => digest(key(record));

// Refuses any key outside `allowed` and any value `checks` rejects.
function shape(where, value, checks, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`Journal ${where} must be an object.`, 400);
  for (const name of Object.keys(value))
    if (!(name in checks))
      fail(`Journal ${where} has a field it may not carry: ${name}.`, 400);
  for (const name of required)
    if (value[name] === undefined) fail(`Journal ${where} needs ${name}.`, 400);
  for (const [name, check] of Object.entries(checks))
    if (value[name] !== undefined && !check(value[name]))
      fail(`Journal ${where} has an invalid ${name}.`, 400);
}
const matches = (pattern) => (value) =>
  typeof value === "string" && pattern.test(value);
const list = (item) => (value) =>
  Array.isArray(value) && value.length > 0 && value.length <= 50
    ? (value.forEach(item), true)
    : false;

// Validates one record against the schema for its surface. `visibility` is
// "public" or "private"; on a public surface `publicRepositories` names
// every repository a reference may name.
export function validateRecord(
  record,
  { visibility = "public", publicRepositories = [] } = {},
) {
  const open = visibility !== "private",
    spec = matches(open ? OPAQUE : SPEC),
    task = matches(open ? OPAQUE : TASK),
    repository = (value) =>
      REPOSITORY.test(String(value)) &&
      (!open ||
        publicRepositories.some(
          (name) => name.toLowerCase() === String(value).toLowerCase(),
        )),
    checks = list((entry) =>
      shape(
        "check",
        entry,
        {
          name: matches(CHECK),
          conclusion: (value) => CONCLUSIONS.includes(value),
          run: (value) => count(value, Number.MAX_SAFE_INTEGER) && value > 0,
        },
        ["name", "conclusion"],
      ),
    );
  shape(
    "record",
    record,
    {
      v: (value) => value === JOURNAL_VERSION,
      op: matches(OPERATION),
      kind: (value) => JOURNAL_KINDS.includes(value),
      spec,
      generation: (value) => count(value),
      prev: (value) =>
        value === null ||
        (shape(
          "link",
          value,
          {
            id: (id) => count(id, Number.MAX_SAFE_INTEGER) && id > 0,
            digest: matches(DIGEST),
          },
          ["id", "digest"],
        ),
        true),
      alias: matches(ALIAS),
      // The opaque driver a generation names, and the driver that wrote a
      // record (driver-generations.mjs).
      driver: matches(OPAQUE),
      // An intent's check evidence; a void names the intent it voids.
      checks,
      voids: matches(OPERATION),
      // The comment IDs a reanchor drops (R102.26).
      held: list((id) => {
        if (!count(id, Number.MAX_SAFE_INTEGER) || id < 1)
          fail("Journal reanchor has an invalid record ID.", 400);
      }),
      revision: matches(DIGEST),
      base: matches(COMMIT),
      outcomes: list((entry) =>
        shape(
          "outcome",
          entry,
          {
            task,
            kind: (value) => OUTCOME_KINDS.includes(value),
            definition: matches(DIGEST),
            revision: matches(DIGEST),
            commit: matches(COMMIT),
            checks,
          },
          ["task", "kind", "definition"],
        ),
      ),
      tasks: list((entry) =>
        shape("task", entry, { task, definition: matches(DIGEST) }, [
          "task",
          "definition",
        ]),
      ),
      refs: list((entry) =>
        shape(
          "reference",
          entry,
          {
            repository,
            branch: matches(BRANCH),
            commit: matches(COMMIT),
            pr: (value) => count(value, Number.MAX_SAFE_INTEGER) && value > 0,
          },
          ["repository", "commit"],
        ),
      ),
      // The Radar issues the spec came from (radar-backlinks.mjs); shown as
      // owner/repo#N so GitHub cross-references them.
      sources: list((entry) =>
        shape(
          "source",
          entry,
          {
            repository,
            number: (value) =>
              count(value, Number.MAX_SAFE_INTEGER) && value > 0,
          },
          ["repository", "number"],
        ),
      ),
      controls: list((entry) =>
        shape(
          "control",
          entry,
          {
            flag: (value) => CONTROL_FLAGS.includes(value),
            id: matches(OPERATION),
          },
          ["flag", "id"],
        ),
      ),
    },
    ["v", "op", "kind", "spec", "generation", "prev"],
  );
  const needs = {
    outcome: ["outcomes"],
    checkpoint: ["refs"],
    approval: ["revision"],
    control: ["controls"],
    claim: ["tasks"],
    intent: ["tasks", "refs", "base"],
    void: ["voids"],
    reanchor: ["held"],
  }[record.kind];
  for (const name of needs || [])
    if (record[name] === undefined)
      fail(`A ${record.kind} record needs ${name}.`, 400);
  if (record.kind === "outcome")
    for (const entry of record.outcomes)
      if (!entry.revision && !record.revision)
        fail("An outcome record needs the approved revision.", 400);
  return record;
}

export function renderRecord(record, options) {
  validateRecord(record, options);
  // GitHub renders nothing inside the hidden marker, so each source is
  // also a visible line, which GitHub turns into its cross-reference.
  const sources = (record.sources ?? []).map(
    (s) => `Source: ${s.repository}#${s.number}\n\n`,
  );
  return `Avoozl journal: ${record.kind}\n\n${sources.join("")}<!-- avoozl-journal:v1 ${key(record)} -->`;
}

// The record in a comment body, or null when the body has no journal marker.
// A marker that does not parse yields {invalid}.
export function parseRecord(body) {
  const found = MARKER.exec(String(body ?? ""));
  if (!found) return null;
  try {
    return { record: JSON.parse(found[1]) };
  } catch {
    return { invalid: "The record is not JSON." };
  }
}

const withoutLink = ({ prev: _prev, ...rest }) => key(rest);

// Replays journal entries: [{id, body, author, edited}] in any order.
// `permission(login)` answers that login's repository permission.
// Returns {held, reasons, records, rejected, generation, tail}.
export async function replayJournal(
  entries,
  { permission, visibility, publicRepositories, writers = WRITERS } = {},
) {
  const sorted = [...(entries ?? [])].sort((a, b) => a.id - b.id),
    granted = new Map(),
    known = new Map(),
    children = new Map(),
    operations = new Map(),
    result = {
      held: false,
      reasons: [],
      records: [],
      rejected: [],
      generation: 0,
      tail: null,
    },
    hold = (id, reason) => {
      result.held = true;
      result.reasons.push({ id, reason });
    };
  for (const entry of sorted) {
    const parsed = parseRecord(entry.body);
    if (!parsed) continue;
    const login = entry.author ?? null;
    if (!granted.has(login))
      granted.set(
        login,
        login ? String((await permission?.(login)) ?? "none") : "none",
      );
    if (!writers.includes(granted.get(login))) {
      result.rejected.push({ id: entry.id, reason: "unauthorized" });
      continue;
    }
    if (parsed.invalid) {
      hold(entry.id, "invalid");
      continue;
    }
    const record = parsed.record;
    try {
      validateRecord(record, { visibility, publicRepositories });
    } catch {
      hold(entry.id, "invalid");
      continue;
    }
    const before = result.reasons.length;
    if (entry.edited) hold(entry.id, "mutated");
    const own = recordDigest(record),
      payload = withoutLink(record),
      retried = operations.has(record.op);
    // A retried write may repeat the first one's root link.
    if (record.prev === null) {
      if (known.size && !retried) hold(entry.id, "conflict");
    } else if (!known.has(record.prev.id)) hold(entry.id, "missing");
    else if (known.get(record.prev.id) !== record.prev.digest)
      hold(entry.id, "mutated");
    known.set(entry.id, own);
    if (retried) {
      // The same payload is one transition; another payload is a conflict.
      if (operations.get(record.op) !== payload) hold(entry.id, "conflict");
      continue;
    }
    operations.set(record.op, payload);
    const parent = record.prev?.id ?? 0;
    if (children.has(parent)) hold(entry.id, "conflict");
    children.set(parent, record.op);
    if (record.kind === "generation") {
      if (record.generation !== result.generation + 1)
        hold(entry.id, "conflict");
      else result.generation = record.generation;
    } else if (record.generation < result.generation) {
      result.rejected.push({ id: entry.id, reason: "stale-generation" });
      result.tail = { id: entry.id, digest: own };
      continue;
    } else if (record.generation > result.generation) hold(entry.id, "invalid");
    // A person's reanchor (R102.26): its tail is the record replay reached,
    // with that exact digest, and it has no problem of its own. The named
    // records' contents are dropped and their holds cleared; every other
    // hold stays. shortcut: a named record's operation ID and generation
    // still count, so a named generation record keeps its number; reanchor
    // a journal like that by a new take over after review.
    if (record.kind === "reanchor" && result.reasons.length === before) {
      if (
        record.prev?.id !== result.tail?.id ||
        record.prev?.digest !== result.tail?.digest
      )
        hold(entry.id, "stale-reanchor");
      else {
        // Only records replay held on may be dropped.
        const named = new Set(
          record.held.filter((id) => result.reasons.some((r) => r.id === id)),
        );
        result.reasons = result.reasons.filter((r) => !named.has(r.id));
        result.records = result.records.filter((r) => !named.has(r.id));
        result.held = result.reasons.length > 0;
      }
    }
    result.records.push({ id: entry.id, author: login, record });
    result.tail = { id: entry.id, digest: own };
  }
  return result;
}

// The outcomes a replay carries, in the shape task-outcomes.mjs reduces.
export function journalOutcomes(replay) {
  return replay.records.flatMap(({ record }) =>
    record.kind === "outcome"
      ? record.outcomes.map((entry) => ({
          spec: record.spec,
          task: entry.task,
          kind: entry.kind,
          revision: entry.revision ?? record.revision,
          definition: entry.definition,
          ...(entry.commit ? { commit: entry.commit } : {}),
          ...(entry.checks ? { evidence: { checks: entry.checks } } : {}),
        }))
      : [],
  );
}

// Writes one record: replays first, refuses a held journal, links the tail
// and fills the current generation. A retry of an operation already written
// with the same payload writes nothing and returns that record.
export async function appendRecord(journal, fields, options = {}) {
  const replay = await replayJournal(await journal.list(), {
    ...options,
    permission: journal.permission,
  });
  if (replay.held)
    fail("This spec's journal is held; a person must reconcile it.", 409);
  const record = {
    v: JOURNAL_VERSION,
    generation: replay.generation,
    // The acting machine by its public alias only (privacy.mjs).
    ...(options.alias ? { alias: options.alias } : {}),
    ...fields,
    prev: replay.tail,
  };
  const body = renderRecord(record, options);
  scanBody(body, options);
  const done = replay.records.find((entry) => entry.record.op === record.op);
  if (done) {
    if (withoutLink(done.record) !== withoutLink(record))
      fail("That operation ID was already written with another payload.", 409);
    return { id: done.id, record: done.record, existing: true };
  }
  const written = await journal.create(body);
  return { id: written.id, record };
}

// The privacy scan before the first write (R102.25): the schema keeps
// prose out, and this keeps this machine's names out of what is left.
function scanBody(body, options) {
  const refused = privacyHits(
    body.split("\n"),
    privacyRules({
      scope: "text",
      machine: options.machine ?? null,
      configFile: options.configFile ?? globalAvoozlConfigPath(),
    }),
  );
  if (refused.length)
    fail(
      `The privacy scan refused this journal record, nothing was written: rule ${[
        ...new Set(refused.map((hit) => hit.rule)),
      ].join(", ")}.`,
      422,
    );
}

// A person's reanchor of a held journal (R102.26, §4.32.4). `held` names
// the record IDs to drop, each one replay held on; `tail` is the ID of the
// record the person reviewed, which must still be the journal's last, with
// its current digest. Without `apply` it previews: the record and what
// replay would give with it. Nothing is edited or deleted. Returns
// {record, before, after, written}.
export async function reanchorJournal(
  journal,
  { spec, held, tail, apply = false },
  options = {},
) {
  const entries = await journal.list(),
    replayOptions = { ...options, permission: journal.permission },
    replay = await replayJournal(entries, replayOptions);
  if (!replay.held) fail("This journal is not held; nothing to reanchor.", 409);
  const reasons = new Set(replay.reasons.map((r) => r.id)),
    ids = [...new Set((held ?? []).map(Number))];
  if (!ids.length) fail("Name the held record IDs to drop.", 400);
  const unheld = ids.filter((id) => !reasons.has(id));
  if (unheld.length)
    fail(
      `Replay did not hold on ${unheld.join(", ")}; name only held records (${[...reasons].join(", ")}).`,
      400,
    );
  if (Number(tail) !== replay.tail?.id)
    fail(
      `The journal's last record is ${replay.tail?.id ?? "none"}, not ${tail}. Review it again.`,
      409,
    );
  const record = {
      v: JOURNAL_VERSION,
      op: `reanchor.${replay.tail.id}`,
      kind: "reanchor",
      spec,
      generation: replay.generation,
      held: ids.sort((a, b) => a - b),
      ...(options.alias ? { alias: options.alias } : {}),
      prev: replay.tail,
    },
    body = renderRecord(record, options);
  scanBody(body, options);
  const next = Math.max(0, ...entries.map((e) => e.id)) + 1,
    preview = await replayJournal(
      [...entries, { id: next, body, author: options.author ?? null }],
      {
        ...replayOptions,
        permission: async (login) =>
          login === (options.author ?? null)
            ? "write"
            : journal.permission(login),
      },
    ),
    summary = (r) => ({ held: r.held, reasons: r.reasons });
  if (!apply)
    return {
      record,
      before: summary(replay),
      after: summary(preview),
      written: false,
    };
  const written = await journal.create(body),
    after = await replayJournal(await journal.list(), replayOptions);
  return {
    record,
    id: written.id,
    before: summary(replay),
    after: summary(after),
    written: true,
  };
}

// The journal on a spec issue. Every comment page is read before replay.
export function githubJournal(github, repository, number) {
  return {
    list: async () =>
      (await github.listIssueComments(repository, number)).map((comment) => ({
        id: Number(comment.id),
        body: comment.body,
        author: comment.user?.login ?? null,
        edited: Boolean(
          comment.updated_at &&
            comment.created_at &&
            comment.updated_at !== comment.created_at,
        ),
      })),
    create: (body) => github.createIssueComment(repository, number, body),
    permission: async (login) =>
      (await github.permission(repository, login))?.permission ?? "none",
  };
}

// The same protocol in a local file (one JSON line per entry) for a
// workspace without GitHub. The local operator is the only author.
export function localJournal(file, actor) {
  const read = () => {
    try {
      return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  };
  return {
    list: async () => read(),
    create: async (body) => {
      const id = Math.max(0, ...read().map((entry) => entry.id)) + 1;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(
        file,
        JSON.stringify({ id, body, author: actor }) + "\n",
      );
      return { id };
    },
    permission: async (login) => (login === actor ? "admin" : "none"),
  };
}
