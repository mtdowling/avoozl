// R103.1-R103.3: every issue Avoozl creates carries crew:avoozl in its create
// call, only export opts out, and the label is Avoozl's own. Fake fetch and
// fake GitHub only; no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AVOOZL_CREW_LABEL,
  GitHubClient,
  ownedIssueInput,
} from "../github.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { attachHandoffs } from "../radar-plan-me.mjs";
import { labelProblem } from "../radar-handoff.mjs";
import { isUntriaged, linkedItems } from "../untriaged.mjs";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function client() {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const { pathname } = new URL(url),
          body = options.body ? JSON.parse(options.body) : undefined;
        requests.push({ method: options.method, pathname, body });
        if (pathname === "/graphql")
          return new Response(
            JSON.stringify({
              data: {
                createIssue: {
                  issue: {
                    id: "I1",
                    databaseId: 1,
                    number: 7,
                    url: "u",
                    state: "OPEN",
                    title: "t",
                    body: "b",
                    labels: { nodes: [] },
                    assignees: { nodes: [] },
                    subIssuesSummary: { total: 0 },
                  },
                },
              },
            }),
          );
        if (pathname.startsWith("/repos/o/r/labels/"))
          return new Response(
            JSON.stringify({
              node_id: "L:" + decodeURIComponent(pathname.split("/").pop()),
            }),
          );
        return new Response(JSON.stringify({ node_id: "R1", number: 7 }));
      },
    });
  return { github, requests };
}

test("the REST create carries crew:avoozl once, with no edit after", async () => {
  const { github, requests } = client();
  await github.createIssue("o/r", { title: "t", body: "b", labels: ["a"] });
  await github.createIssue("o/r", {
    title: "t",
    body: "b",
    labels: ["crew:avoozl"],
  });
  assert.deepEqual(
    requests.map(({ method, pathname, body }) => [
      method,
      pathname,
      body.labels,
    ]),
    [
      ["POST", "/repos/o/r/issues", ["a", AVOOZL_CREW_LABEL]],
      ["POST", "/repos/o/r/issues", [AVOOZL_CREW_LABEL]],
    ],
  );
});

test("the GraphQL create carries crew:avoozl in its labelIds", async () => {
  const { github, requests } = client();
  await github.createIssue("o/r", {
    title: "t",
    body: "b",
    parentIssueId: "P1",
  });
  const mutation = requests.find((request) => request.pathname === "/graphql");
  assert.deepEqual(mutation.body.variables.input.labelIds, [
    "L:" + AVOOZL_CREW_LABEL,
  ]);
  assert.equal(
    requests.filter((request) => request.pathname === "/graphql").length,
    1,
    "one mutation, no label edit after",
  );
});

test("only export opts out, by name", async () => {
  assert.deepEqual(
    ownedIssueInput({ title: "t", labels: ["a"], withoutCrewLabel: "export" }),
    { title: "t", labels: ["a"] },
  );
  const { github, requests } = client();
  await assert.rejects(
    github.createIssue("o/r", { title: "t", withoutCrewLabel: "mirror" }),
    /Only export may create an issue without crew:avoozl/,
  );
  await assert.rejects(
    github.createIssue("o/r", { title: "t", withoutCrewLabel: true }),
    /Only export/,
  );
  assert.deepEqual(requests, [], "a refused opt-out sends nothing");
});

// The source rule: every createIssue in src/ goes through the client, and no
// caller but export names the opt-out.
test("no createIssue caller in src/ opts out except export", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test" && entry.name !== "node_modules") walk(file);
      } else if (/\.mjs$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name))
        files.push(file);
    }
  };
  walk(SRC);
  const callers = [],
    optOuts = [],
    rawCreates = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8"),
      name = path.relative(SRC, file);
    if (/\.createIssue\(/.test(text)) callers.push(name);
    // The client defines the opt-out; it is not a caller.
    if (name === path.join("app", "github.mjs")) continue;
    for (const match of text.matchAll(/withoutCrewLabel\s*:\s*([^,}\n]+)/g))
      optOuts.push([name, match[1].trim()]);
    if (/"POST",\s*`\/repos\/[^`]*\/issues`/.test(text)) rawCreates.push(name);
  }
  assert.ok(callers.length >= 4, "the create callers are found");
  assert.deepEqual(rawCreates, [], "an issue is made only by createIssue");
  for (const [name, value] of optOuts)
    assert.ok(
      /export/i.test(path.basename(name)) && value === '"export"',
      `${name} opts out of crew:avoozl; only export may`,
    );
});

const settings = (extra = {}) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "o/r": { baseBranch: "main", ...extra },
    },
  }).repositories["o/r"];

test("Untriaged leaves out an issue carrying crew:avoozl", () => {
  const repo = settings(),
    linked = linkedItems([]),
    entry = (labels) => ({ kind: "issue", number: 3, labels, assignees: [] });
  assert.equal(isUntriaged(entry(["bug"]), "o/r", repo, linked), true);
  assert.equal(
    isUntriaged(entry(["bug", "Crew:Avoozl"]), "o/r", repo, linked),
    false,
  );
});

test("the plan-me hand-off leaves out an issue carrying crew:avoozl", async () => {
  const repo = settings(),
    reads = [],
    github = new Proxy(
      {},
      {
        get: (_target, name) => () => {
          reads.push(name);
          return Promise.resolve([]);
        },
      },
    ),
    item = {
      kind: "issue",
      number: 3,
      labels: [repo.crewLabels.needsHuman, repo.radar.planLabel, "crew:avoozl"],
    };
  await attachHandoffs(github, "o/r", repo, [item]);
  assert.equal(item.planMe, undefined);
  assert.equal(item.planLabel, undefined);
  assert.deepEqual(reads, [], "nothing is read for Avoozl's own issue");
});

test("Settings refuses crew:avoozl as the name of any other label", () => {
  for (const extra of [
    { managedLabels: { ready: "crew:avoozl" } },
    { managedLabels: { managed: "crew:avoozl" } },
    { radar: { planLabel: "crew:avoozl" } },
    { crewLabels: { claim: "crew:avoozl" } },
    { crewLabels: { needsHuman: "CREW:AVOOZL" } },
    {
      rules: [{ id: "go", labelsAll: ["crew:avoozl"], action: "pause" }],
    },
  ])
    assert.throws(
      () => settings(extra),
      /crew:avoozl|managed label|Issue Radar's label/i,
      JSON.stringify(extra),
    );
  assert.match(labelProblem(settings(), "crew:avoozl"), /crew:/);
  assert.ok(settings({ managedLabels: { ready: "avoozl:ready" } }));
});
