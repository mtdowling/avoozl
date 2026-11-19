// A worker machine pulls minimal offers (Requirement 90.3, design §4.32.8,
// task 43.2).
//
// - Source. The offers come from the spec journal on the spec's issue, read
//   with the same replay as everything else, never from ready issues and
//   never from a second copy of the task graph. A held journal offers
//   nothing.
// - Authority. An offer counts only when its author passed replay (write
//   access), it names the current generation's driver and generation, it
//   names this worker's login by opaque id, and no hold or stop is open. A
//   task already granted or settled is not offered.
// - References. An offer's source repository, branch and commit become a
//   qualified reference, apart from the pool's target and base. The source
//   must be in this machine's own registry; an offer cannot add a URL, a
//   path or a command (R102.7).
// - Lanes. At most one offer per free lane. Pulling accepts nothing and
//   starts nothing: the worker waits for the driver's acknowledgment
//   (task 43.3).
import { createHash } from "node:crypto";
import { driverState, openControls } from "./driver-generations.mjs";
import { githubJournal, replayJournal } from "./spec-journal.mjs";
import { fail } from "./store.mjs";
import { qualifiedRef, sourceRegistry } from "./working-heads.mjs";

const NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SPEC = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SETTLED = new Set(["landed", "done", "skipped", "refused"]);

// The opaque id a journal record uses for a worker login. Both sides derive
// it, so the journal never carries the login.
export const workerId = (login) =>
  createHash("sha256")
    .update(`worker\0${String(login).toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);

// `runner.pools` of a worker: where each spec's journal lives and what it
// lands on. [{spec, repository, issue, target, grants?, base, visibility?}]
export function poolsOf(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("runner.pools must be a list.");
  return value.map((pool, index) => {
    const where = `runner.pools[${index}]`;
    if (!pool || typeof pool !== "object" || Array.isArray(pool))
      fail(`${where} must be an object.`);
    if (!SPEC.test(String(pool.spec))) fail(`${where}.spec is a spec ID.`);
    for (const key of ["repository", "target"])
      if (!NAME.test(String(pool[key]))) fail(`${where}.${key} is owner/name.`);
    // The spec's one canonical grant namespace (R90.4); the target by default.
    if (pool.grants !== undefined && !NAME.test(String(pool.grants)))
      fail(`${where}.grants is owner/name.`);
    if (!Number.isSafeInteger(pool.issue) || pool.issue < 1)
      fail(`${where}.issue is an issue number.`);
    if (typeof pool.base !== "string" || !pool.base.trim())
      fail(`${where}.base is a branch name.`);
    if (
      pool.visibility !== undefined &&
      !["public", "private"].includes(pool.visibility)
    )
      fail(`${where}.visibility is public or private.`);
    return {
      spec: pool.spec,
      repository: pool.repository,
      issue: pool.issue,
      target: pool.target,
      grants: pool.grants ?? pool.target,
      base: pool.base,
      visibility: pool.visibility ?? "public",
    };
  });
}

// `runner.lanes`: how many tasks this worker runs at once (default 1).
export function lanesOf(value) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1 || value > 16)
    fail("runner.lanes is a whole number from 1 to 16.");
  return value;
}

// The offers for `login` in one pool, in journal order. Returns
// {offers, held, refused}. `held` is set when the journal cannot be trusted.
function offersFrom(replay, { pool, login, registry }) {
  const state = driverState(replay);
  if (state.held) return { offers: [], held: replay.reasons, refused: [] };
  if (!state.driver || openControls(state).length)
    return { offers: [], held: false, refused: [] };
  const me = workerId(login),
    settled = new Map(),
    granted = new Set(
      state.grants
        .filter((grant) => grant.generation === state.generation)
        .flatMap((grant) => grant.tasks.map((t) => t.task)),
    ),
    seen = new Set(),
    offers = [],
    refused = [];
  // The latest outcome decides whether a task is settled.
  for (const outcome of state.outcomes)
    settled.set(`${outcome.task}\0${outcome.definition}`, outcome.kind);
  for (const offer of state.offers) {
    if (offer.worker !== me) continue;
    if (offer.generation !== state.generation || offer.driver !== state.driver)
      continue;
    const [{ task, definition }] = offer.tasks;
    if (offer.tasks.length !== 1 || offer.refs.length !== 1) {
      refused.push({ task, reason: "an offer names one task and one head" });
      continue;
    }
    if (granted.has(task) || SETTLED.has(settled.get(`${task}\0${definition}`)))
      continue;
    let ref;
    try {
      const [head] = offer.refs;
      ref = qualifiedRef({
        source: head,
        target: { repository: pool.target, base: pool.base },
      });
      registry.get(ref.source.repository);
      registry.get(ref.target.repository);
    } catch (error) {
      refused.push({ task, reason: String(error.message).slice(0, 200) });
      continue;
    }
    // A repeated offer for one task is one offer: the newest wins.
    const key = `${offer.spec}\0${task}`;
    if (seen.has(key))
      offers.splice(
        offers.findIndex((o) => o.key === key),
        1,
      );
    seen.add(key);
    offers.push({
      key,
      spec: offer.spec,
      task,
      definition,
      generation: offer.generation,
      driver: offer.driver,
      record: offer.id,
      base: offer.base,
      ref,
    });
  }
  return {
    offers: offers.map(({ key: _key, ...rest }) => rest),
    held: false,
    refused,
  };
}

// Reads every pool's journal and returns at most `free` offers across them,
// first come first served. Reads only; nothing is written or started.
export async function pullOffers({
  github,
  pools,
  sources,
  login,
  free,
  journalFor = (pool) => githubJournal(github, pool.repository, pool.issue),
}) {
  const registry = sourceRegistry(sources),
    result = { login, offers: [], held: [], refused: [] };
  for (const pool of pools) {
    const journal = journalFor(pool),
      replay = await replayJournal(await journal.list(), {
        permission: journal.permission,
        visibility: pool.visibility,
        publicRepositories: [
          pool.target,
          pool.repository,
          ...Object.keys(sources ?? {}),
        ],
      }),
      found = offersFrom(replay, { pool, login, registry });
    if (found.held) result.held.push({ spec: pool.spec, reasons: found.held });
    result.refused.push(
      ...found.refused.map((r) => ({ spec: pool.spec, ...r })),
    );
    result.offers.push(...found.offers);
  }
  result.offers = result.offers.slice(0, Math.max(0, free));
  return result;
}
