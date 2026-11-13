import assert from "node:assert/strict";
import test from "node:test";
import { formatMatch, parseMatch, triggerPreview } from "../issue-match.mjs";
import { matchingRules, normalizeGitHubPolicy } from "../github-policy.mjs";

const empty = {
  labelsAll: [],
  labelsAny: [],
  labelsNone: [],
  assignee: null,
  unassigned: false,
  source: null,
};

test("match parses each supported qualifier", () => {
  for (const [line, expected] of [
    ["label:a", { labelsAll: ["a"] }],
    ["label:a label:b", { labelsAll: ["a", "b"] }],
    ["label:a label:A", { labelsAll: ["a"] }],
    ["label:a,b", { labelsAny: ["a", "b"] }],
    ["label:a -label:x", { labelsAll: ["a"], labelsNone: ["x"] }],
    ["label:a -label:x,y", { labelsAll: ["a"], labelsNone: ["x", "y"] }],
    [
      'label:"needs triage" label:"a, b",c',
      { labelsAll: ["needs triage"], labelsAny: ["a, b", "c"] },
    ],
    ["  label:a   assignee:mona ", { labelsAll: ["a"], assignee: "mona" }],
    ["label:a no:assignee", { labelsAll: ["a"], unassigned: true }],
  ])
    assert.deepEqual(parseMatch(line), { ...empty, ...expected }, line);
});

test("match refuses every other token by name", () => {
  for (const [line, pattern] of [
    ["label:a is:open", /cannot use is:open/],
    ["label:a repo:o/r", /cannot use repo:o\/r/],
    ["label:a author:mona", /cannot use author:mona/],
    ["label:a crash", /cannot use crash: free text/],
    ["label:a Label:b", /cannot use Label:b/],
    ["label:a -assignee:mona", /cannot use -assignee:mona/],
    ["label:a no:label", /cannot use no:label/],
    ["label:a label:b,c label:d,e", /only one label:a,b group/],
    ["label:a assignee:x assignee:y", /only one assignee:/],
    ["label:a assignee:x,y", /takes one GitHub login/],
    ["label:a assignee:x no:assignee", /no:assignee with assignee:/],
    ['label:"open', /unclosed quote/],
    ["label:a,", /empty value/],
    ["label:", /empty value/],
    ['label:"a"b', /text after a closing quote/],
    ["-label:x", /at least one label:/],
    ["no:assignee", /at least one label:/],
    ["", /non-empty/],
  ])
    assert.throws(() => parseMatch(line), pattern, line);
});

test("formatMatch writes a line that parses back to the same fields", () => {
  const fields = {
    labelsAll: ["go", "needs triage"],
    labelsAny: ["a,b", "c"],
    labelsNone: ["hold"],
    assignee: "mona",
    unassigned: false,
    source: null,
  };
  const line = formatMatch(fields);
  assert.equal(
    line,
    'label:go label:"needs triage" label:"a,b",c -label:hold assignee:mona',
  );
  assert.deepEqual(parseMatch(line), fields);
  assert.equal(
    formatMatch({ labelsAll: ["x"], unassigned: true }),
    "label:x no:assignee",
  );
});

const policy = (rules) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: { "o/r": { baseBranch: "main", rules } },
  }).repositories["o/r"];

test("a rule refuses match together with the legacy keys", () => {
  assert.throws(
    () =>
      policy([
        { id: "go", action: "deliver", match: "label:x", labelsAll: ["x"] },
      ]),
    /both match and labelsAll; use only match/,
  );
  assert.throws(
    () => policy([{ id: "go", action: "deliver", match: "label:x is:open" }]),
    /rules\[0\]\.match cannot use is:open/,
  );
  // Legacy rules still read unchanged.
  const legacy = policy([
    { id: "go", action: "deliver", labelsAll: ["x"], assignee: "mona" },
  ]).rules[0];
  assert.deepEqual(
    [legacy.match, legacy.labelsAll, legacy.assignee, legacy.unassigned],
    [null, ["x"], "mona", false],
  );
});

test("match rules evaluate exactly like the equivalent legacy rules", () => {
  const pairs = [
    [{ labelsAll: ["go", "area:core"] }, "label:go label:area:core"],
    [{ labelsAny: ["go", "Ship"] }, "label:go,ship"],
    [{ labelsAll: ["go"], labelsNone: ["hold"] }, "label:go -label:hold"],
    [{ labelsAll: ["go"], assignee: "mona" }, "label:go assignee:mona"],
  ];
  const issues = [];
  for (const labels of [
    [],
    ["go"],
    ["GO", "area:core"],
    ["ship"],
    ["go", "hold"],
  ])
    for (const assignees of [[], ["mona"], ["hubot"]])
      issues.push({
        labels: labels.map((name) => ({ name })),
        assignees: assignees.map((login) => ({ login })),
        user: { login: "mona" },
      });
  for (const [legacy, match] of pairs) {
    const old = policy([{ id: "r", action: "deliver", ...legacy }]),
      next = policy([{ id: "r", action: "deliver", match }]);
    for (const issue of issues)
      assert.deepEqual(
        matchingRules(next, issue, []),
        matchingRules(old, issue, []),
        `${match} on ${JSON.stringify(issue)}`,
      );
  }
  // no:assignee has no legacy key: it matches only unassigned issues.
  const unassigned = policy([
    { id: "r", action: "deliver", match: "label:go no:assignee" },
  ]);
  const hit = (assignees) =>
    matchingRules(
      unassigned,
      {
        labels: [{ name: "go" }],
        assignees: assignees.map((login) => ({ login })),
      },
      [],
    ).length;
  assert.deepEqual([hit([]), hit(["mona"])], [1, 0]);
});

test("triggerPreview parses, then asks GitHub search read only", async () => {
  const calls = [];
  const github = {
    available: () => true,
    searchOpenIssues: async (...args) => {
      calls.push(args);
      return {
        total_count: 12,
        items: [
          {
            number: 3,
            title: "Three",
            html_url: "https://github.com/o/r/issues/3",
          },
        ],
      };
    },
  };
  const shown = await triggerPreview(github, {
    repository: "o/r",
    match: " label:go ",
  });
  assert.equal(shown.error, null);
  assert.deepEqual(shown.parsed.labelsAll, ["go"]);
  assert.equal(shown.total, 12);
  assert.deepEqual(shown.issues, [
    { number: 3, title: "Three", url: "https://github.com/o/r/issues/3" },
  ]);
  assert.deepEqual(calls, [["o/r", "label:go", { perPage: 10 }]]);

  const refused = await triggerPreview(github, {
    repository: "o/r",
    match: "label:go is:open",
  });
  assert.match(refused.error, /cannot use is:open/);
  assert.equal(calls.length, 1);

  const offline = await triggerPreview(
    { available: () => false },
    { repository: "o/r", match: "label:go" },
  );
  assert.match(offline.searchError, /not signed in/);
  await assert.rejects(
    triggerPreview(github, { repository: "nope", match: "label:go" }),
    /owner\/repository/,
  );
  // No repository yet: parse only, no search.
  const parseOnly = await triggerPreview(github, { match: "label:go" });
  assert.deepEqual(
    [parseOnly.parsed.labelsAll, parseOnly.total],
    [["go"], null],
  );
  assert.equal(calls.length, 1);
});
