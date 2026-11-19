// Facts bullets in tasks.md (Requirement 111, design §4.40): each key, each
// refusal at its line, defaults, packages, epic folders, and the revision
// hash a pure conversion keeps.
import assert from "node:assert/strict";
import test from "node:test";
import { factsLines, readFacts } from "../spec-facts.mjs";
import { parseSpec, specHash, specItems } from "../spec-plans.mjs";
import { workerBrief } from "../../delivery/delivery.mjs";
import { foldManifest, legacyHash } from "../../test/legacy-facts.mjs";
import { legacySpecFiles } from "../../test/spec-fixture.mjs";

const prose = {
  "requirements.md": "# Config\n\nRead config.json.\n",
  "design.md": "# Design\n\nA loader.\n",
};
const parse = (tasks) =>
  parseSpec({
    name: "config",
    exists: true,
    files: { ...prose, "tasks.md": tasks },
  });
const codes = (parsed) =>
  parsed.diagnostics.map((d) => `${d.code} ${d.file}:${d.lineStart}`);
const lines = (...rows) => rows.join("\n") + "\n";

test("the owner's example reads defaults, own facts and nested lists", () => {
  const parsed = parse(
    lines(
      "---",
      "repo: avoozl",
      "completion: integrated",
      "---",
      "- [ ] lt-1.2 Queue table and records",
      "  - Facts:",
      "    - kind: package",
      "    - after: lt-1.2.1",
      "    - done:",
      "      - Tests load a valid file and get every default",
      "      - An unknown key is refused, and the message names the key",
      "  - [ ] lt-1.2.1 Add the queue migration",
      "    - Facts:",
      "      - repo: nupp",
      "      - completion: integrated",
      "      - done:",
      "        - The migration runs twice with no change the second time",
      "    - A free note stays a note.",
    ),
  );
  assert.deepEqual(codes(parsed), []);
  const [parent, child] = parsed.proposals;
  assert.equal(parent.kind, "package");
  assert.equal(parent.repository, undefined, "a package takes no default");
  assert.deepEqual(parent.requires, ["lt-1.2.1"]);
  assert.equal(child.parent, "lt-1.2");
  assert.equal(child.repository, "nupp", "a task's own fact wins");
  assert.equal(child.checks, undefined, "a task never names checks");
  assert.deepEqual(child.acceptance, [
    "The migration runs twice with no change the second time",
  ]);
});

test("every key the reader uses round-trips through Facts bullets", () => {
  const entry = {
    kind: "leaf",
    repository: "app",
    acceptance: ["It reads, with commas, in one line."],
    completion: "integrated",
    requires: ["0.1", { task: "0.2", condition: "merged-pr" }],
    sequence: ["0.3"],
    supports: ["0.4"],
    unblocks: ["other.1"],
    investigate: false,
    phase: "w1",
    authority: "local",
    route: "local",
    type: "test",
    milestone: "v1",
    iteration: "i1",
    scope: "crew",
    track: "t",
    acceptFrom: "validation",
    verify: "agent",
    ship: "manual",
    tags: ["a", "b"],
    resources: ["db"],
    paths: ["src/**"],
    labels: ["x"],
    needs: ["gpu"],
    session: { agent: "coder" },
  };
  const text = lines("- [ ] 1.1 Read", ...factsLines(entry)),
    { manifest, problems } = readFacts(text, specItems("config", text));
  assert.deepEqual(problems, []);
  assert.deepEqual(manifest.tasks["1.1"], entry);
});

test("each wrong shape is refused at its line in tasks.md", () => {
  const cases = [
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - colour: blue",
        "    - done: It reads",
        "    - repo: app",
      ),
      ["facts.unknown-key tasks.md:3"],
      /Unknown fact key "colour"/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - done: It reads twice",
        "    - repo: app",
      ),
      ["facts.duplicate-key tasks.md:4"],
      /written twice/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - A note first",
        "  - Facts:",
        "    - done: It reads",
        "    - repo: app",
      ),
      ["facts.missing tasks.md:1", "facts.misplaced tasks.md:3"],
      /no Facts: bullet/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - repo: app",
        "  - Facts:",
        "    - done: Again",
      ),
      ["facts.misplaced tasks.md:5"],
      /first child of a task item, and a task has one/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - repo: app",
        "  - repo: app",
      ),
      ["facts.stray tasks.md:5"],
      /"repo:" is a fact/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - manual: yes",
      ),
      ["facts.value tasks.md:4"],
      /manual is true or false/,
    ],
    [
      lines(
        "---",
        "colour: blue",
        "---",
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - repo: app",
      ),
      ["facts.unknown-key tasks.md:2"],
      /Unknown front-matter key "colour"/,
    ],
  ];
  for (const [text, expected, message] of cases) {
    const parsed = parse(text);
    assert.deepEqual(codes(parsed).sort(), [...expected].sort(), text);
    assert.ok(
      parsed.diagnostics.some((d) => message.test(d.message)),
      parsed.diagnostics.map((d) => d.message).join("; "),
    );
  }
});

test("a manual leaf takes no completion default", () => {
  const parsed = parse(
    lines(
      "---",
      "repo: app",
      "completion: integrated",
      "---",
      "- [ ] 1.1 Review with the team",
      "  - Facts:",
      "    - manual: true",
      "    - repo: app",
      "    - done: The team agreed",
    ),
  );
  assert.deepEqual(codes(parsed), []);
  assert.equal(parsed.proposals[0].checks, undefined);
  assert.equal(parsed.proposals[0].completion, undefined);
});

test("completion person is refused in facts and front-matter, naming manual", () => {
  const fact = parse(
      lines(
        "- [ ] 1.1 Review with the team",
        "  - Facts:",
        "    - manual: true",
        "    - completion: person",
        "    - repo: app",
        "    - done: The team agreed",
      ),
    ),
    front = parse(
      lines(
        "---",
        "completion: person",
        "---",
        "- [ ] 1.1 Review with the team",
        "  - Facts:",
        "    - manual: true",
        "    - repo: app",
        "    - done: The team agreed",
      ),
    );
  assert.deepEqual(codes(fact), ["facts.person-completion tasks.md:4"]);
  assert.deepEqual(codes(front), ["facts.person-completion tasks.md:2"]);
  assert.match(fact.diagnostics[0].message, /manual: true/);
});

// A task's own summary bullets say what it delivers.
const described = lines(
  "---",
  "repo: app",
  "completion: integrated",
  "---",
  "- [ ] 1 Load configuration",
  "  - Facts:",
  "    - kind: package",
  "    - after: 1.1",
  "  - The loader and its tests.",
  "  - [ ] 1.1 Read the config file",
  "    - Facts:",
  "      - done:",
  "        - A missing file yields defaults.",
  "    - Per file: read config.json from the working directory,",
  "      then parse it.",
  "      - Keep comments out.",
  "    - Done when: A missing file yields defaults.",
  "    - A missing file is not an error.",
);

test("a task's summary is its bullets as written, without facts, Done when or sub-items", () => {
  const parsed = parse(described),
    summary = (key) => parsed.proposals.find((p) => p.specKey === key).summary;
  assert.deepEqual(codes(parsed), []);
  assert.equal(
    summary("1.1"),
    [
      "- Per file: read config.json from the working directory,",
      "  then parse it.",
      "  - Keep comments out.",
      "- A missing file is not an error.",
    ].join("\n"),
  );
  assert.equal(summary("1"), "- The loader and its tests.");
  // The summary is not a fact: the manifest the revision hash reads has none.
  const facts = readFacts(described, specItems("config", described));
  assert.equal(facts.manifest.tasks["1.1"].summary, undefined);
});

test("a summary that repeats the title is refused and never reaches the brief", () => {
  const repeating = parse(
      described.replace(
        "    - A missing file is not an error.",
        "    - Read the config file.",
      ),
    ),
    repository = { id: "app", root: "/repo", baseBranch: "main" },
    brief = (proposal) =>
      workerBrief(
        { ...proposal, id: `config.${proposal.specKey}` },
        repository,
        {
          attempt: 1,
          worktree: "/wt",
          steps: [],
        },
      );
  assert.deepEqual(codes(repeating), [
    "task.summary-repeats-title tasks.md:18",
  ]);
  assert.match(repeating.diagnostics[0].message, /repeats the title/);
  const kept = repeating.proposals.find((p) => p.specKey === "1.1");
  assert.doesNotMatch(kept.summary, /Read the config file/);
  // One that adds context passes and reaches the brief.
  const adds = parse(described).proposals.find((p) => p.specKey === "1.1");
  assert.match(
    brief(adds),
    /\nSummary:\n- Per file: read config\.json[\s\S]*\nAcceptance: A missing file/,
  );
  // A stored summary that repeats the title stays out of the brief too.
  assert.doesNotMatch(
    brief({ ...adds, summary: "Read the config file." }),
    /Summary:/,
  );
});

test("a checks fact or front-matter default is refused: tasks run the repository's", () => {
  const fact = parse(
      described.replace(
        "      - done:",
        "      - checks: npm test\n      - done:",
      ),
    ),
    front = parse(
      described.replace("completion: integrated", "checks: npm test"),
    );
  assert.deepEqual(codes(fact), ["facts.removed-key tasks.md:12"]);
  assert.deepEqual(codes(front), ["facts.removed-key tasks.md:3"]);
  for (const parsed of [fact, front])
    assert.match(
      parsed.diagnostics[0].message,
      /Every task runs the repository's checks; delete this line\./,
    );
});

test("a summary fact is refused, naming the line to delete", () => {
  const parsed = parse(
    described.replace(
      "      - done:",
      "      - summary: Read it.\n      - done:",
    ),
  );
  assert.deepEqual(codes(parsed), ["facts.removed-key tasks.md:12"]);
  assert.match(parsed.diagnostics[0].message, /Delete this line/);
});

test("a long title stays whole and is refused over the limit", () => {
  const long = "Read the config file: " + "and report each problem. ".repeat(8),
    whole = parse(described.replace("1.1 Read the config file", `1.1 ${long}`));
  assert.ok(long.trim().length <= 240);
  assert.equal(
    whole.proposals.find((p) => p.specKey === "1.1").title,
    long.trim(),
  );
  const over = parse(
    described.replace("1.1 Read the config file", `1.1 ${long.repeat(2)}`),
  );
  assert.deepEqual(codes(over), ["task.title-length tasks.md:10"]);
});

test("an epic folder reads its rows from facts", () => {
  const parsed = parse(
    lines(
      "---",
      "kind: epic",
      "---",
      "- [ ] 1 Native runtime",
      "  - Facts:",
      "    - plan: native-runtime",
      "  - Direction and work",
      "- [ ] 2 Review it",
      "  - Facts:",
      "    - plan: native-runtime",
      "    - step: review",
    ),
  );
  assert.equal(parsed.kind, "epic");
  assert.deepEqual(
    parsed.members.map((m) => [m.key, m.plan, m.step, m.summary]),
    [
      ["1", "native-runtime", "implement", "- Direction and work"],
      ["2", "native-runtime", "review", ""],
    ],
  );
});

test("a pure conversion keeps the revision hash; a changed fact changes it", () => {
  // The old layout as Avoozl's writers left it: version 1, each task's keys
  // in the usual order.
  const leaf = (acceptance, extra = {}) => ({
    kind: "leaf",
    acceptance: [acceptance],
    completion: "integrated",
    ...extra,
  });
  const old = {
      ...legacySpecFiles(),
      "avoozl/manifest.json":
        JSON.stringify(
          {
            version: 1,
            tasks: {
              1: {
                kind: "package",
                acceptance: [
                  "The CLI reads, validates, and reports its config.",
                ],
                requires: ["1.1", "1.2"],
              },
              1.1: leaf("A missing file yields defaults."),
              1.2: leaf("An unknown key is reported with its path.", {
                requires: ["1.1"],
              }),
            },
          },
          null,
          2,
        ) + "\n",
    },
    converted = foldManifest(old).files;
  assert.equal(converted["avoozl/manifest.json"], undefined);
  assert.equal(specHash(converted), legacyHash(old));
  // Defaults hoisted to front-matter, or written on each task, hash the same.
  const spelled = foldManifest(old, { defaults: false }).files;
  assert.notEqual(spelled["tasks.md"], converted["tasks.md"]);
  assert.equal(specHash(spelled), specHash(converted));
  // An inline list and nested bullets are the same content.
  const nested = {
    ...converted,
    "tasks.md": converted["tasks.md"].replace(
      "      - after: 1.1",
      "      - after:\n        - 1.1",
    ),
  };
  assert.notEqual(nested["tasks.md"], converted["tasks.md"]);
  assert.equal(specHash(nested), specHash(converted));
  // Marks stay outside the hash.
  const marked = {
    ...converted,
    "tasks.md": converted["tasks.md"].replace("- [ ] 1.1", "- [x] 1.1"),
  };
  assert.equal(specHash(marked), specHash(converted));
  // A changed fact is a changed revision.
  const changed = {
    ...converted,
    "tasks.md": converted["tasks.md"].replace(
      "- An unknown key is reported with its path.",
      "- An unknown key is reported with its JSON path.",
    ),
  };
  assert.notEqual(specHash(changed), specHash(converted));
  // Summary beside the facts is tasks.md text, not a fact: the hash reads it
  // as the text it is, and the facts text stays the manifest's.
  const described = {
      ...old,
      "tasks.md": old["tasks.md"].replace(
        "  - [ ] 1.1 Read the config file",
        "  - [ ] 1.1 Read the config file\n    - Read it from the working directory.",
      ),
    },
    withSummary = foldManifest(described).files;
  assert.equal(specHash(withSummary), legacyHash(described));
});

test("an old record's summary folds into the item's summary", () => {
  const old = legacySpecFiles(),
    converted = foldManifest(old).files,
    parsed = parseSpec({ name: "config", exists: true, files: converted });
  assert.match(
    converted["tasks.md"],
    /1\.1 Read the config file\n {4}- Facts:\n(?: {6}.*\n)+ {4}- Parse config\.json from the working directory\./,
  );
  assert.deepEqual(codes(parsed), []);
  assert.equal(
    parsed.proposals.find((p) => p.specKey === "1.1").summary,
    "- Parse config.json from the working directory.",
  );
});
