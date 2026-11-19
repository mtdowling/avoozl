// mb-3.1 (MB8, design D7): the retro's facts hold each repository's median
// lead time and median time waiting to land, and its brief asks about the
// landing mode only when landing is more than half of the lead time.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { putSpan } from "../flow.mjs";
import { landingFacts, proposalProblem, retroBrief } from "../flow-retro.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const START = Date.parse("2026-01-01T00:00:00.000Z");
const at = (minutes) => new Date(START + minutes * 60_000).toISOString();

// Three finished tasks in `app`: each codes for `lead - land` minutes and
// then waits `land` minutes in the merge stage.
function seed(t, { lead, land }) {
  const store = new Store(
    path.join(temporaryDirectory("avoozl-retro-landing-"), "w.sqlite"),
  );
  t.after(() => store.close());
  const ids = ["a", "b", "c"],
    tasks = ids.map((id, n) => ({
      id,
      title: `Task ${id}`,
      kind: "leaf",
      scope: "catalog",
      status: "accepted",
      epic: "sample",
      track: "catalog",
      tags: [],
      acceptance: ["Works."],
      repository: "app",
      integration: { at: at(n * 200 + lead), commit: "c".repeat(40) },
    }));
  store.importSnapshot({ ...snapshot(), tasks, edges: [] });
  store.put("projects", { id: "app", landing: "pr" });
  ids.forEach((id, n) => {
    const from = n * 200;
    putSpan(store, {
      id: `coding-${id}`,
      taskId: id,
      stage: "coding",
      startedAt: at(from),
      endedAt: at(from + lead - land),
      source: "events",
    });
    putSpan(store, {
      id: `merge-${id}`,
      taskId: id,
      stage: "merge",
      startedAt: at(from + lead - land),
      endedAt: at(from + lead),
      source: "events",
    });
  });
  return store;
}

const ask = (brief) => /would another landing mode help/i.test(brief);

test("landing at 60% of lead time adds the question with both numbers; 30% does not", (t) => {
  const high = seed(t, { lead: 100, land: 60 }),
    [fact] = landingFacts(
      high,
      JSON.parse(
        JSON.stringify([
          {
            repository: "app",
            finishedAt: "x",
            leadMs: 6e6,
            stages: { merge: 3.6e6 },
          },
          {
            repository: "app",
            finishedAt: "x",
            leadMs: 6e6,
            stages: { merge: 3.6e6 },
          },
        ]),
      ),
    );
  assert.equal(fact.medianLeadMs, 6e6);
  assert.equal(fact.medianLandWaitMs, 3.6e6);
  assert.equal(fact.ask, true);
  const withQuestion = retroBrief(high, high.read(), {
    id: "r1",
    triggers: [],
  });
  assert.ok(ask(withQuestion));
  assert.match(withQuestion, /60 min to land of a 100 min median lead time/);
  assert.match(withQuestion, /landing mode pr/);
  const low = seed(t, { lead: 100, land: 30 }),
    without = retroBrief(low, low.read(), { id: "r1", triggers: [] });
  assert.ok(!ask(without));
  // The facts are still in the data for the retro to read.
  assert.match(without, /"medianLandWaitMs": 1800000/);
});

test("a proposal cannot change the landing mode by itself", () => {
  const settings = {
    type: "settings",
    metric: "lead time",
    direction: "down",
    file: "repository",
    repository: "acme/app",
    key: "github.repositories.acme/app.landing.mode",
    from: "pr",
    to: "direct",
    evidence: "Landing waits are 60% of lead time.",
  };
  assert.match(
    proposalProblem(settings),
    /not a setting the Settings page edits/,
  );
});
