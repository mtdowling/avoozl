// rc-7.3: the Radar values screen and its re-read (RC7.2, RC7.3). Fake
// Issue Radar only; nothing is written anywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { CREW_PROMPT } from "../radar-crew-prompt.mjs";
import { radarReread, radarValues } from "../radar-values.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";
const values = () => radarValues({ repository: REPO, settings: {} });
const byId = (result, id) => result.items.find((item) => item.id === id);

test("every value has a name, a value and what it controls", () => {
  const list = values();
  assert.deepEqual(
    list.map((item) => item.id),
    [
      "repository",
      "crew-name",
      "agent",
      "model",
      "scope",
      "needs-human",
      "claim-limit",
      "prompt",
    ],
  );
  for (const item of list) {
    assert.ok(item.label && item.value && item.controls, item.id);
  }
  assert.equal(list.find((item) => item.id === "prompt").value, CREW_PROMPT);
  assert.equal(list.find((item) => item.id === "agent").value, "avoozl-crew");
  assert.equal(list.find((item) => item.id === "scope").value, "ready");
});

test("settings and a pack change the values they name", () => {
  const list = radarValues({
    repository: REPO,
    settings: {
      managedLabels: { ready: "go" },
      crewLabels: { needsHuman: "help" },
    },
    crew: { name: "sdk-crew", models: ["model-a", "model-b"] },
  });
  const get = (id) => list.find((item) => item.id === id).value;
  assert.equal(get("scope"), "go");
  assert.equal(get("needs-human"), "help");
  assert.equal(get("crew-name"), "sdk-crew");
  assert.equal(get("model"), "model-a");
});

test("with no grant every item says cannot verify and none is ticked", () => {
  const result = radarReread(values(), null, "Issue Radar is turned off.");
  assert.equal(result.grant, false);
  assert.ok(result.items.every((item) => item.status === "cannot-verify"));
  assert.match(result.items[0].note, /turned off/);
  assert.equal(result.link, "/issue-radar");
});

test("with the grant a fake Radar's items tick, and a wrong one is named", () => {
  const read = {
    connected: [REPO],
    needsHumanLabel: "crew: needs human",
    agents: ["avoozl-crew"],
    crews: [
      {
        id: "c1",
        name: "avoozl-code",
        agent: "avoozl-crew",
        labels: ["ready"],
        model: "anything",
        claimTtlHours: 48,
        prompt: CREW_PROMPT,
      },
    ],
  };
  const result = radarReread(values(), read);
  assert.equal(result.grant, true);
  for (const id of [
    "repository",
    "crew-name",
    "agent",
    "scope",
    "needs-human",
    "claim-limit",
    "prompt",
  ])
    assert.equal(byId(result, id).status, "ok", id);
  // "auto" means any model, so it cannot be ticked.
  assert.equal(byId(result, "model").status, "cannot-verify");
  const wrong = radarReread(values(), {
    ...read,
    crews: [{ ...read.crews[0], labels: ["other"], prompt: "old" }],
  });
  assert.equal(byId(wrong, "scope").status, "differs");
  assert.equal(byId(wrong, "prompt").status, "differs");
  assert.equal(byId(wrong, "repository").status, "ok");
});

test("a read that lacks a field leaves that item unverified", () => {
  const result = radarReread(values(), {
    connected: [REPO],
    crews: [{ id: "c1", name: "avoozl-code" }],
  });
  assert.equal(byId(result, "repository").status, "ok");
  assert.equal(byId(result, "crew-name").status, "ok");
  for (const id of ["scope", "needs-human", "claim-limit", "prompt"])
    assert.equal(byId(result, id).status, "cannot-verify", id);
  const none = radarReread(values(), { connected: [], crews: [] });
  assert.equal(byId(none, "repository").status, "differs");
  assert.equal(byId(none, "crew-name").status, "differs");
});

function workspace(t, crewReader) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: { baseBranch: "main", coder: "issue-radar" },
        },
      },
    }),
  );
  return new Operations(store, {
    github: { available: () => false },
    workspaceRoot: root,
    crewReader,
  });
}

test("radar.values reads Radar through the grant and refuses an unregistered repository", async (t) => {
  const reader = async () => ({
      status: 200,
      body: {
        settings: { needs_human_label: "crew: needs human" },
        crews: [{ id: "c1", name: "avoozl-code", labels: ["ready"] }],
      },
    }),
    granted = await workspace(t, reader).execute("radar.values", {
      repository: REPO,
    });
  assert.equal(granted.grant, true);
  assert.equal(byId(granted, "scope").status, "ok");
  assert.equal(byId(granted, "needs-human").status, "ok");
  const denied = await workspace(t, async () => ({
    status: 403,
    body: {},
  })).execute("radar.values", { repository: REPO });
  assert.equal(denied.grant, false);
  assert.ok(denied.items.every((item) => item.status === "cannot-verify"));
  const ops = workspace(t, null);
  assert.equal(
    (await ops.execute("radar.values", { repository: REPO })).grant,
    false,
  );
  await assert.rejects(
    ops.execute("radar.values", { repository: "other/repo" }),
    (error) => error.status === 404,
  );
});
