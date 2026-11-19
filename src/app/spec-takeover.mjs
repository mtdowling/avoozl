// Take over a published spec's journal (task 42.5, R102.13, R102.14,
// design §4.32.7). A person's own act: it appends the next generation with
// a new driver id and keeps that id in this workspace, so dispatch and
// landing here may write for the spec. A held or concurrent journal refuses.
//
// The owner of a GitHub journal is the spec issue's single assignee; of a
// local journal, this workspace's operator.
//
// shortcut: the epic issue's assignee does not stand in for a spec issue
// with none; upgrade when epic journals are read here.
import {
  driverState,
  effectiveOwner,
  takeOver,
} from "./driver-generations.mjs";
import { replayJournal } from "./spec-journal.mjs";
import { journalSources } from "./radar-backlinks.mjs";
import { driverIdOf, journalOf, rememberDriver } from "./spec-scheduler.mjs";
import { fail } from "./store.mjs";
import { isFixSpec } from "./fix.mjs";

const LOCAL_OWNERS = "specLocalOwners";

// The spec's writable journal, its replay options and its owner.
export async function specAuthority(
  store,
  { github, workspaceRoot, actor },
  planId,
) {
  if (!store.get("plans", planId) && !isFixSpec(store, planId))
    fail("Plan not found.", 404);
  // The tick has no operator name: a local journal acts as the person who
  // took it over here.
  actor ||= store.getMeta(LOCAL_OWNERS)?.[planId] ?? "";
  const journal = journalOf(store, { github, workspaceRoot, actor }, planId);
  if (!journal)
    fail("Publish the spec first: it has no journal to take over.", 409);
  if (journal.unreadable)
    fail("This spec's journal is on GitHub, which is not signed in.", 503);
  if (journal.local && !actor)
    fail("A local take over needs this workspace's operator name.", 409);
  const options = {
      visibility: await journal.visibility(),
      publicRepositories: journal.publicRepositories ?? [],
      names: journal.names,
    },
    login = journal.local
      ? actor || ""
      : String((await github.currentUser())?.login ?? ""),
    owner = journal.local
      ? { login, from: "local" }
      : effectiveOwner({
          spec: (
            (await github.issue(journal.issue.repository, journal.issue.number))
              ?.assignees ?? []
          ).map((a) => a?.login ?? a),
        });
  return { journal, options, login, owner };
}

export async function takeOverSpec(
  store,
  { github, workspaceRoot, actor },
  planId,
) {
  const { journal, options, login, owner } = await specAuthority(
      store,
      { github, workspaceRoot, actor },
      planId,
    ),
    state = driverState(
      await replayJournal(await journal.list(), {
        ...options,
        permission: journal.permission,
      }),
    );
  // A retry when this workspace already drives writes nothing.
  if (state.generation > 0 && state.driver === driverIdOf(store, planId))
    return {
      ok: true,
      existing: true,
      generation: state.generation,
      driver: state.driver,
    };
  const result = await takeOver(
    journal,
    {
      by: { kind: "person", login },
      owner,
      spec: planId,
      // A GitHub journal names its Radar sources so GitHub links back.
      sources: journal.local
        ? []
        : journalSources(store, planId, {
            specPrivate: options.visibility === "private",
          }),
    },
    options,
  );
  if (!result.ok)
    fail(
      "Another take over wrote at the same time; the journal is held until a person reconciles it.",
      409,
    );
  store.transaction(() => {
    rememberDriver(store, planId, result.driver);
    if (journal.local)
      store.setMeta(LOCAL_OWNERS, {
        ...(store.getMeta(LOCAL_OWNERS) ?? {}),
        [planId]: login,
      });
  });
  return { ...result, existing: false };
}
