// Variant A of Observe (rc-8.6): Issue Radar's crew list and credits through
// one gateway grant. A fake GitHub and fake Kiro Crew answers; nothing here
// reaches either.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { costOf } from "../radar-crews.mjs";
import { SESSIONS_ROUTE, issueRadarSessionsReader } from "../radar-handoff.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const RECORDED = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/radar-scratch.json", import.meta.url),
    "utf8",
  ),
);
const REPO = RECORDED.repository;
const POLICY = {
  mode: "single-repo",
  repositories: {
    [REPO]: {
      baseBranch: "main",
      coder: "issue-radar",
      minimumPermission: "write",
      managedLabels: { managed: "avoozl:managed", ready: "ready" },
      crewLabels: { needsHuman: "plan me" },
      acceptedLabel: "accepted",
      rules: [],
    },
  },
};
const CREWS = {
  crews: [
    { id: "c1", name: "Draco", labels: [], status: "working" },
    { id: "c2", name: "Bode", labels: [], status: "paused" },
  ],
  settings: {},
  counts: { on_duty: 2, working: 1, paused: 1 },
};
const SESSIONS = {
  number: 16,
  count: 3,
  sessions: [
    { slot: "a", lastPhase: "implementing", credits: 10, turns: 4 },
    { slot: "b", lastPhase: "implementing", credits: 2.5, turns: 1 },
    { slot: "c", lastPhase: "investigating", credits: 1, turns: 2 },
    { slot: "d", lastPhase: "", credits: "x", turns: -1 },
  ],
};

function workspace(t, readers = {}) {
  const issues = [16].map((number) => structuredClone(RECORDED.issues[number])),
    github = {
      available: () => true,
      async listIssues() {
        return issues;
      },
      async listIssueComments(_repository, number) {
        return issues.find((issue) => issue.number === number).comments;
      },
    },
    { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: POLICY,
    }),
  );
  store.put("github_repositories", {
    id: REPO,
    owner: "mtdowling",
    repo: "avoozl-radar-test",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  return new Operations(store, { github, workspaceRoot: root, ...readers });
}

test("without the grant radar.crews is the GitHub-only view", async (t) => {
  const refused = async () => ({
      status: 403,
      body: { error: "not permitted" },
    }),
    none = await workspace(t).execute("radar.crews", {}),
    denied = await workspace(t, {
      crewReader: refused,
      sessionsReader: refused,
    }).execute("radar.crews", {});
  for (const view of [none, denied]) {
    assert.equal("crewStrip" in view, false);
    assert.deepEqual(view.unseen, ["paused", "machine", "chat"]);
  }
  assert.deepEqual(
    none.rows.map((row) => row.number),
    denied.rows.map((row) => row.number),
  );
});

test("with the grant the strip shows crews and counts, and cost per stage", async (t) => {
  const asked = [],
    view = await workspace(t, {
      crewReader: async (repository) => {
        asked.push(repository);
        return { status: 200, body: CREWS };
      },
      sessionsReader: async (repository, number) => {
        asked.push(`${repository}#${number}`);
        return { status: 200, body: SESSIONS };
      },
    }).execute("radar.crews", {});
  assert.deepEqual(view.crewStrip.crews, [
    { repository: REPO, id: "c1", name: "Draco", status: "working" },
    { repository: REPO, id: "c2", name: "Bode", status: "paused" },
  ]);
  assert.deepEqual(view.crewStrip.counts, { onDuty: 2, working: 1, paused: 1 });
  assert.deepEqual(view.unseen, ["machine", "chat"]);
  assert.deepEqual(asked, [REPO, `${REPO}#16`]);
  assert.deepEqual(view.crewStrip.cost[`${REPO}#16`], {
    credits: 13.5,
    turns: 7,
    stages: [
      { stage: "implementing", credits: 12.5, turns: 5 },
      { stage: "investigating", credits: 1, turns: 2 },
      { stage: "unknown", credits: 0, turns: 0 },
    ],
  });
});

test("a failed cost read leaves that issue without a cost, not the strip", async (t) => {
  const view = await workspace(t, {
    crewReader: async () => ({ status: 200, body: CREWS }),
    sessionsReader: async () => {
      throw Error("gateway down");
    },
  }).execute("radar.crews", {});
  assert.equal(view.crewStrip.crews.length, 2);
  assert.deepEqual(view.crewStrip.cost, {});
});

test("costOf tolerates a malformed answer", () => {
  assert.deepEqual(costOf(null), { credits: 0, turns: 0, stages: [] });
});

test("the sessions reader calls the pipeline route with the app token", async () => {
  const { createHmac } = await import("node:crypto"),
    origin = "http://127.0.0.1:9",
    secret = "s3cret",
    calls = [],
    reader = issueRadarSessionsReader(
      {
        KIROCREW_GATEWAY_ORIGIN: origin,
        KIROCREW_PROXY_SECRET: secret,
        KIROCREW_GATEWAY_ORIGIN_PROOF: createHmac("sha256", secret)
          .update(origin)
          .digest("hex"),
      },
      async (url, init) => {
        calls.push([url, init.method]);
        if (url.endsWith("/token"))
          return new Response(JSON.stringify({ token: "t" }));
        return new Response(JSON.stringify(SESSIONS));
      },
    );
  assert.equal((await reader("o/app", 16)).status, 200);
  assert.deepEqual(calls[1], [
    `${origin}${SESSIONS_ROUTE}?number=16&owner=o&repo=app&token=t`,
    "GET",
  ]);
  assert.equal(issueRadarSessionsReader({}), null);
});
