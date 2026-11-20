// Radar back-links (task 44.6, R92.8, R92.10, design §4.27): the intake
// status comment names the spec issue, only where visibility permits, and
// only in a write Avoozl already makes. Fakes and scratch workspaces only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { startGitHubItem, statusComment } from "../github-intake.mjs";
import { intakeSpecIssue } from "../source-backlinks.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";

const RADAR = "o/app";
const SPECS = "o/plans";

// A store with the Radar repository and the spec home at the given
// visibilities (null: never read), and one spec plan that came from
// RADAR#7 with its spec issue SPECS#40.
function seed(t, { radar = false, specs = true } = {}) {
  const { store } = fixture(t);
  for (const [id, hidden] of [
    [RADAR, radar],
    [SPECS, specs],
  ]) {
    const [owner, repo] = id.split("/");
    store.put("github_repositories", {
      id,
      owner,
      repo,
      ...(hidden === null ? {} : { private: hidden }),
    });
  }
  store.put("plans", {
    id: "s",
    spec: "s",
    context: { newPlan: { source: { repository: RADAR, number: 7 } } },
  });
  store.put("receipts", {
    id: "github-parent:plan:s",
    kind: "github-parent",
    level: "plan",
    parentId: "s",
    repository: SPECS,
    number: 40,
  });
  return store;
}

const INPUT = { repository: RADAR, number: 7 };

test("the status comment names the spec issue only where visibility permits", (t) => {
  const cases = [
    // [radar private, specs private, named]
    [false, true, false], // a public Radar issue never names a private spec
    [false, false, true],
    [true, false, true],
    [true, true, true],
    [false, null, false], // unread visibility names nothing
    [null, false, false],
  ];
  for (const [radar, specs, named] of cases) {
    const store = seed(t, { radar, specs }),
      spec = intakeSpecIssue(store, INPUT);
    assert.deepEqual(
      spec,
      named ? { repository: SPECS, number: 40 } : null,
      `radar ${radar}, specs ${specs}`,
    );
    const text = statusComment("plan", spec);
    if (named) assert.match(text, /^Spec: o\/plans#40$/m);
    else assert.doesNotMatch(text, /o\/plans|#40|spec/i);
  }
});

test("an input that is its own spec issue, or no spec at all, names nothing", (t) => {
  const store = seed(t, { radar: false, specs: false });
  store.put("receipts", {
    ...store.get("receipts", "github-parent:plan:s"),
    repository: RADAR,
    number: 7,
  });
  assert.equal(intakeSpecIssue(store, INPUT), null);
  assert.equal(intakeSpecIssue(store, { repository: RADAR, number: 8 }), null);
});

function intake(t, visibility) {
  const store = seed(t, visibility),
    github = new FakeGitHub(),
    policy = normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { [RADAR]: { baseBranch: "main" } },
    });
  github.created.push({
    id: 7,
    node_id: "issue-7",
    number: 7,
    state: "open",
    title: "Fix 7",
    body: "The parser drops the last line.",
    labels: [],
    html_url: `https://example.test/${RADAR}/issues/7`,
    user: { login: "reporter" },
    assignees: [],
  });
  return { store, github, policy };
}

test("intake writes the same one comment and names a public spec only", async (t) => {
  for (const [specs, named] of [
    [true, false],
    [false, true],
  ]) {
    const w = intake(t, { radar: false, specs });
    const result = await startGitHubItem(w.store, w.github, w.policy, {
      id: `${RADAR}#7`,
      action: "plan",
    });
    assert.deepEqual(result.writes, ["comment"]);
    assert.equal(w.github.comments.length, 1);
    assert.equal(w.github.labels.length, 0);
    assert.equal(w.github.created.length, 1, "no issue is made");
    const body = w.github.comments[0].body;
    if (named) assert.match(body, /Spec: o\/plans#40/);
    else assert.doesNotMatch(body, /o\/plans|#40/);
  }
});

test("back-links import no Radar code and call no Radar API", () => {
  const here = path.dirname(fileURLToPath(import.meta.url)),
    source = fs.readFileSync(
      path.join(here, "..", "source-backlinks.mjs"),
      "utf8",
    ),
    code = source.replace(/^\s*\/\/.*$/gm, ""),
    imports = [...code.matchAll(/from "\.{1,2}\/(?:[^"]+\/)?([^"/]+)"/g)].map(
      (m) => m[1],
    );
  assert.deepEqual(imports, []);
  assert.doesNotMatch(code, /github\.|graphql|fetch\(|grant|radar-/i);
});
