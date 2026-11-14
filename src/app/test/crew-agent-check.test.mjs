import assert from "node:assert/strict";
import test from "node:test";
import { CREW_AGENT, crewAgentCheck } from "../crew-agent.mjs";

test("Set up shows the agent present, missing and not verified apart", () => {
  const crews = [];
  assert.equal(
    crewAgentCheck({ list: ["kirocrew", CREW_AGENT], crews }).state,
    "present",
  );
  assert.equal(
    crewAgentCheck({ list: ["kirocrew", "other"], crews }).state,
    "missing",
  );
  assert.equal(crewAgentCheck({ list: [], crews }).state, "missing");
  assert.equal(crewAgentCheck({ crews }).state, "not-verified");
  assert.equal(
    crewAgentCheck({ list: null, files: null, crews }).state,
    "not-verified",
  );
});

test("the installed agent files answer when the grant gives no list", () => {
  const files = ["avoozl--avoozl-crew.json", "avoozl--avoozl-planner.json"];
  assert.equal(crewAgentCheck({ files, crews: [] }).state, "present");
  assert.equal(
    crewAgentCheck({ files: ["avoozl--avoozl-planner.json"], crews: [] }).state,
    "missing",
  );
  // The grant outranks files: a list that lacks the agent stays missing.
  assert.equal(
    crewAgentCheck({ list: ["kirocrew"], files, crews: [] }).state,
    "missing",
  );
  // A lookalike file does not count.
  assert.equal(
    crewAgentCheck({ files: ["other--avoozl-crew.json.bak"], crews: [] }).state,
    "missing",
  );
});

test("a crew on another agent is not covered, with the unreliable-change note", () => {
  const result = crewAgentCheck({
    list: [CREW_AGENT],
    crews: [
      { name: "Draco", agent: CREW_AGENT },
      { name: "Lyra", agent: "kirocrew" },
      { name: "Vega" },
    ],
  });
  assert.deepEqual(
    result.crews.map((c) => [c.name, c.covered]),
    [
      ["Draco", true],
      ["Lyra", false],
      ["Vega", false],
    ],
  );
  assert.match(result.note, /changing .*agent.* unreliable/i);
  assert.match(result.note, /create/i);
  assert.equal(crewAgentCheck({ list: [CREW_AGENT], crews: [] }).note, null);
});

test("a list entry that only contains the name does not count", () => {
  assert.equal(
    crewAgentCheck({ list: ["avoozl-crew-two", "my-avoozl-crew"], crews: [] })
      .state,
    "missing",
  );
});

test("a malformed list or crew is Not verified or not covered, never a throw", () => {
  assert.equal(crewAgentCheck({ list: "avoozl-crew" }).state, "not-verified");
  const result = crewAgentCheck({
    list: [CREW_AGENT],
    crews: [null, { name: 5, agent: 7 }],
  });
  assert.equal(
    result.crews.every((c) => c.covered === false),
    true,
  );
});
