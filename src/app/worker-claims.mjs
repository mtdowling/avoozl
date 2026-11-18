// Canonical claim reservation and generation acknowledgment (Requirement
// 90.4, 102.14, design §4.32.3a and §4.32.8, task 43.3).
//
// - Namespace. A spec names one canonical claim repository. A task's claim is
//   one branch there, `avoozl/<spec>/claim/<task>`. A branch of the same name
//   in a fork has no authority.
// - Reserve, then acknowledge. The driver creates the claim branch, and only
//   if GitHub accepts the create (a second create is refused: that is the
//   compare-and-swap) does it write a `claim` record naming the worker and
//   the current generation. A comment is never the lock.
// - Request. A worker asks by a comment on the spec issue that names only
//   spec, task, definition and generation. Who asked is the comment's
//   authenticated author, never a name in the text.
// - Start. A worker starts only on a `claim` record from the current
//   generation's driver that names it. A lost or over-cap request gets no
//   record and starts no agent.
// shortcut: a reservation made but not acknowledged (a crash between the two
// writes) is reported as `orphaned` and left; 43.4's person-only release
// clears it.
import {
  driverState,
  openControls,
  revalidate,
} from "./driver-generations.mjs";
import { appendRecord, githubJournal, replayJournal } from "./spec-journal.mjs";
import { fail } from "./store.mjs";
import { workerId } from "./worker-offers.mjs";
import { fetchExact, sourceRegistry } from "./working-heads.mjs";

const REQUEST = /<!-- avoozl-claim-request:v1 (\{.*?\}) -->/s;
const SPEC = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TASK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DIGEST = /^[0-9a-f]{64}$/;

export const claimBranch = (spec, task) => `avoozl/${spec}/claim/${task}`;

export const requestBody = ({ spec, task, definition, generation }) =>
  `Avoozl claim request\n\n<!-- avoozl-claim-request:v1 ${JSON.stringify({ v: 1, spec, task, definition, generation })} -->`;

// A request comment's fields, or null. Anything but the exact shape is not a
// request.
export function parseRequest(body) {
  const found = REQUEST.exec(String(body ?? ""));
  if (!found) return null;
  let value;
  try {
    value = JSON.parse(found[1]);
  } catch {
    return null;
  }
  const keys = Object.keys(value ?? {})
    .sort()
    .join();
  if (
    keys !== "definition,generation,spec,task,v" ||
    value.v !== 1 ||
    !SPEC.test(String(value.spec)) ||
    !TASK.test(String(value.task)) ||
    !DIGEST.test(String(value.definition)) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1
  )
    return null;
  return value;
}

// --- Driver side ------------------------------------------------------------

// Publishes one offer: this task, this worker login, this exact working head.
export async function publishOffer(
  journal,
  { driver, owner, login, spec, task, definition, worker, ref, base },
  options = {},
) {
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok) fail(`Cannot offer work now: ${check.reason}.`, 409);
  const id = workerId(worker);
  return appendRecord(
    journal,
    {
      op: `offer.${task}.${id}.${ref.commit.slice(0, 12)}`,
      kind: "offer",
      spec,
      driver,
      worker: id,
      base,
      tasks: [{ task, definition }],
      refs: [ref],
    },
    options,
  );
}

// Handles every pending request in comment order. For each: the author must
// hold a current offer for exactly that task and definition; a task already
// claimed, or a worker already at `cap`, is declined; otherwise the claim
// branch is created, and only if that succeeds the acknowledgment is
// written. Returns {ok, reason?, acknowledged, declined}.
export async function reserveClaims({
  github,
  journal,
  options = {},
  driver,
  owner,
  login,
  spec,
  claims,
  base,
  cap = 1,
}) {
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok)
    return { ok: false, reason: check.reason, acknowledged: [], declined: [] };
  const state = check.state,
    taken = new Map(
      state.claims
        .filter((claim) => claim.generation === state.generation)
        .map((claim) => [claim.tasks[0].task, claim.worker]),
    ),
    held = new Map(),
    settled = new Set(state.outcomes.map((outcome) => outcome.task));
  for (const claim of state.claims)
    if (
      claim.generation === state.generation &&
      !settled.has(claim.tasks[0].task)
    )
      held.set(claim.worker, (held.get(claim.worker) ?? 0) + 1);
  const result = { ok: true, acknowledged: [], declined: [] };
  const decline = (task, reason) => result.declined.push({ task, reason });
  let head = null;
  for (const entry of await journal.list()) {
    const request = parseRequest(entry.body);
    if (!request || request.spec !== spec || !entry.author) continue;
    if (request.generation !== state.generation) continue;
    const worker = workerId(entry.author),
      offered = state.offers.some(
        (offer) =>
          offer.generation === state.generation &&
          offer.driver === state.driver &&
          offer.worker === worker &&
          offer.tasks[0].task === request.task &&
          offer.tasks[0].definition === request.definition,
      );
    if (!offered) {
      decline(request.task, "not-offered");
      continue;
    }
    if (taken.has(request.task)) {
      // Already won: by this worker earlier (nothing to say) or another.
      if (taken.get(request.task) !== worker) decline(request.task, "claimed");
      continue;
    }
    if ((held.get(worker) ?? 0) >= cap) {
      decline(request.task, "over-cap");
      continue;
    }
    head ??= (await github.branch(claims, base))?.commit?.sha;
    if (!head) fail(`Cannot read ${base} in ${claims}.`, 502);
    try {
      await github.createBranch(claims, claimBranch(spec, request.task), head);
    } catch (error) {
      if (error.status !== 422) throw error;
      // Someone else's reservation holds the name.
      decline(request.task, "taken");
      continue;
    }
    const written = await appendRecord(
      journal,
      {
        op: `claim.${request.task}.g${state.generation}`,
        kind: "claim",
        spec,
        driver,
        worker,
        tasks: [{ task: request.task, definition: request.definition }],
      },
      options,
    );
    taken.set(request.task, worker);
    held.set(worker, (held.get(worker) ?? 0) + 1);
    result.acknowledged.push({
      task: request.task,
      worker,
      record: written.id,
      generation: state.generation,
    });
  }
  return result;
}

// --- Worker side ------------------------------------------------------------

const REQUESTED = "worker.requested";

// Asks for each pulled offer once, and keeps the offer: a claimed task
// leaves the next pull, but this worker still has to start it. The comment
// names no login; GitHub supplies the author. Returns the offers asked now.
export async function requestClaims(store, { pools, github }) {
  const pulled = store.getMeta("worker.offers")?.offers ?? [],
    asked = store.getMeta(REQUESTED) ?? {},
    sent = [];
  for (const offer of pulled) {
    const key = `${offer.spec}:${offer.task}:${offer.generation}`,
      pool = pools.find((candidate) => candidate.spec === offer.spec);
    if (asked[key] || !pool) continue;
    const comment = await github.createIssueComment(
      pool.repository,
      pool.issue,
      requestBody(offer),
    );
    asked[key] = { offer, comment: Number(comment?.id ?? 0) };
    store.setMeta(REQUESTED, asked);
    sent.push({ spec: offer.spec, task: offer.task });
  }
  return sent;
}

export function forgetRequest(store, offer) {
  const asked = store.getMeta(REQUESTED) ?? {};
  delete asked[`${offer.spec}:${offer.task}:${offer.generation}`];
  store.setMeta(REQUESTED, asked);
}

// The requested offers this worker may now start: a `claim` record from the
// current generation's driver names this worker and the same task and
// definition, and no hold or stop is open. Reads only.
export async function acknowledged(store, { pools, github, login }) {
  const me = workerId(login),
    asked = Object.values(store.getMeta(REQUESTED) ?? {}).map((e) => e.offer),
    ready = [],
    waiting = [],
    states = new Map();
  for (const offer of asked) {
    const pool = pools.find((candidate) => candidate.spec === offer.spec);
    if (!pool) continue;
    if (!states.has(pool.spec)) {
      const journal = githubJournal(github, pool.repository, pool.issue);
      states.set(
        pool.spec,
        driverState(
          await replayJournal(await journal.list(), {
            permission: journal.permission,
            visibility: pool.visibility,
          }),
        ),
      );
    }
    const state = states.get(pool.spec),
      ack =
        !state.held &&
        state.driver === offer.driver &&
        state.generation === offer.generation &&
        !openControls(state).length &&
        state.claims.find(
          (claim) =>
            claim.generation === state.generation &&
            claim.driver === state.driver &&
            claim.worker === me &&
            claim.tasks[0].task === offer.task &&
            claim.tasks[0].definition === offer.definition,
        );
    (ack ? ready : waiting).push({ ...offer, pool, ack: ack?.id ?? null });
  }
  return { ready, waiting };
}

// Fetches each acknowledged offer's exact source commit into the worker's
// checkout and builds the IDs-only envelope. A commit that cannot be fetched
// exactly stays waiting.
export async function envelopeFor(offer, { config }) {
  const repo = offer.pool.repo ?? Object.keys(config.repos)[0];
  if (!repo || !config.repos[repo]) return { held: "no-local-checkout" };
  const fetched = await fetchExact(
    config.repos[repo].path,
    offer.ref,
    sourceRegistry(config.sources),
  );
  if (fetched.state !== "exact") return { held: fetched.state };
  return {
    envelope: {
      version: 1,
      taskId: offer.task,
      repo,
      baseCommit: offer.ref.source.commit,
      checks: Object.keys(config.checks).slice(0, 10),
      spec: offer.spec,
    },
  };
}
