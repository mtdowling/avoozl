// `$key:` fact bullets in tasks.md (Requirement 111, design §4.40): each
// key, each refusal at its line, defaults, packages, epic folders, and what
// the revision hash reads.
import assert from "node:assert/strict";
import test from "node:test";
import { factsLines, readFacts, withoutFacts } from "../spec-facts.mjs";
import { parseSpec, specHash, specItems } from "../spec-plans.mjs";
import { workerBrief } from "../../delivery/delivery.mjs";
import { specFiles } from "../../test/spec-fixture.mjs";

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

test("the owner's example reads defaults, own facts and repeated lists", () => {
  const parsed = parse(
    lines(
      "---",
      "repo: avoozl",
      "completion: integrated",
      "---",
      "- [ ] `lt-1.2` Queue table and records",
      "  - $kind: package",
      "  - $after: lt-1.2.1",
      "  - $done: Tests load a valid file and get every default",
      "  - $done: An unknown key is refused, and the message names the key",
      "  - [ ] `lt-1.2.1` Add the queue migration",
      "    - $repo: nupp",
      "    - A free note stays a note.",
      "    - $completion: integrated",
      "    - $done: The migration runs twice with no change the second time",
    ),
  );
  assert.deepEqual(codes(parsed), []);
  const [parent, child] = parsed.proposals;
  assert.equal(parent.kind, "package");
  assert.equal(parent.repository, undefined, "a package takes no default");
  assert.deepEqual(parent.requires, ["lt-1.2.1"]);
  assert.deepEqual(parent.acceptance, [
    "Tests load a valid file and get every default",
    "An unknown key is refused, and the message names the key",
  ]);
  assert.equal(child.parent, "lt-1.2");
  assert.equal(child.repository, "nupp", "a task's own fact wins");
  assert.equal(child.checks, undefined, "a task never names checks");
  assert.deepEqual(child.acceptance, [
    "The migration runs twice with no change the second time",
  ]);
  assert.equal(child.summary, "- A free note stays a note.");
});

test("a list fact written again adds to it; $done keeps its commas", () => {
  const text = lines(
      "- [ ] 1.1 Read",
      "  - $after: 0.1, 0.2",
      "  - $after: 0.3",
      "  - $done: It reads, parses, and reports",
      "  - $done: It stops",
      "  - $paths: src/a.mjs, src/b.mjs",
    ),
    { manifest, problems } = readFacts(text, specItems("config", text));
  assert.deepEqual(problems, []);
  assert.deepEqual(manifest.tasks["1.1"], {
    kind: "leaf",
    requires: ["0.1", "0.2", "0.3"],
    acceptance: ["It reads, parses, and reports", "It stops"],
    paths: ["src/a.mjs", "src/b.mjs"],
  });
});

test("$paths reads a Files note's list: backticks, notes and a closing period", () => {
  const text = lines(
      "- [ ] 1.1 Read",
      "  - $paths: `src/bytes/allocator.nupp` (new), `tests/groups.lua`.",
      "  - $paths: `src/{a,b}.js`, docs/x.md (renamed), ./, src/.",
      "  - $tags: `a`, b (new)",
      "  - $done: ok",
    ),
    { manifest, problems } = readFacts(text, specItems("config", text));
  assert.deepEqual(problems, []);
  assert.deepEqual(manifest.tasks["1.1"].paths, [
    "src/bytes/allocator.nupp",
    "tests/groups.lua",
    "src/{a,b}.js",
    "docs/x.md",
    "./",
    "src/.",
  ]);
  // Only paths are cleaned; another list keeps its items as written.
  assert.deepEqual(manifest.tasks["1.1"].tags, ["`a`", "b (new)"]);
});

test("a $built fact is skipped and stays outside the revision hash", () => {
  const plain = lines("- [x] 1.1 Read", "  - $done: It reads"),
    built = lines(
      "- [x] 1.1 Read",
      "  - $done: It reads",
      "  - $built: abc1234",
    ),
    items = (text) => specItems("config", text);
  assert.deepEqual(readFacts(built, items(built)).problems, []);
  assert.deepEqual(
    readFacts(built, items(built)).manifest,
    readFacts(plain, items(plain)).manifest,
  );
  assert.equal(
    withoutFacts(built, items(built)),
    withoutFacts(plain, items(plain)),
  );
});

test("a fenced $ line is text, not a fact", () => {
  const text = lines(
      "- [ ] 1.1 Read",
      "  - $done: It reads",
      "  - An example:",
      "    ```markdown",
      "    - $done: Not a fact",
      "    ```",
      "```",
      "- $after: 2",
      "```",
    ),
    { manifest, problems } = readFacts(text, specItems("config", text));
  assert.deepEqual(problems, []);
  assert.deepEqual(manifest.tasks["1.1"].acceptance, ["It reads"]);
});

test("every key the reader uses round-trips through fact bullets", () => {
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
  assert.ok(
    text
      .split("\n")
      .slice(1, -1)
      .every((row) => /^ {2}- \$[a-zA-Z]+:/.test(row)),
    text,
  );
});

test("each wrong shape is refused at its line in tasks.md", () => {
  const cases = [
    [
      lines("- [ ] 1.1 Read", "  - $colour: blue", "  - $done: It reads"),
      ["facts.unknown-key tasks.md:2"],
      /Unknown fact "\$colour"/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - $repo: app",
        "  - $done: It reads",
        "  - $repo: web",
      ),
      ["facts.duplicate-key tasks.md:4"],
      /written twice/,
    ],
    [
      lines("- [ ] 1.1 Read", "  - A note first", "    - $done: It reads"),
      ["facts.missing tasks.md:1", "facts.misplaced tasks.md:3"],
      /directly under its task item/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - $done:",
        "    - It reads",
        "    - It parses",
        "  - $repo: app",
      ),
      [
        "facts.schema tasks.md:2",
        "facts.value tasks.md:2",
        "facts.value tasks.md:3",
      ],
      /one bullet on one line/,
    ],
    [
      lines("- [ ] 1.1 Read", "  - $done: It reads", "  - repo: app"),
      ["facts.stray tasks.md:3"],
      /"repo:" reads as a fact. Write it as "\$repo:"/,
    ],
    [
      lines("- [ ] 1.1 Read", "  - $done: It reads", "  - $manual: yes"),
      ["facts.value tasks.md:3"],
      /manual is true or false/,
    ],
    [
      lines(
        "---",
        "colour: blue",
        "---",
        "- [ ] 1.1 Read",
        "  - $done: It reads",
      ),
      ["facts.unknown-key tasks.md:2"],
      /Unknown front-matter key "colour"/,
    ],
    [
      lines("- [ ] 1.1 Read", "  - Read it."),
      ["facts.missing tasks.md:1"],
      /has no facts. Add a "\$done:" bullet under it/,
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
      "  - $manual: true",
      "  - $repo: app",
      "  - $done: The team agreed",
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
        "  - $manual: true",
        "  - $completion: person",
        "  - $repo: app",
        "  - $done: The team agreed",
      ),
    ),
    front = parse(
      lines(
        "---",
        "completion: person",
        "---",
        "- [ ] 1.1 Review with the team",
        "  - $manual: true",
        "  - $repo: app",
        "  - $done: The team agreed",
      ),
    );
  assert.deepEqual(codes(fact), ["facts.person-completion tasks.md:3"]);
  assert.deepEqual(codes(front), ["facts.person-completion tasks.md:2"]);
  assert.match(fact.diagnostics[0].message, /\$manual: true/);
});

// A task's own summary bullets say what it delivers.
const described = lines(
  "---",
  "repo: app",
  "completion: integrated",
  "---",
  "- [ ] 1 Load configuration",
  "  - $kind: package",
  "  - $after: 1.1",
  "  - The loader and its tests.",
  "  - [ ] 1.1 Read the config file",
  "    - $done: A missing file yields defaults.",
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
    "task.summary-repeats-title tasks.md:15",
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
        "    - $done:",
        "    - $checks: npm test\n    - $done:",
      ),
    ),
    front = parse(
      described.replace("completion: integrated", "checks: npm test"),
    );
  assert.deepEqual(codes(fact), ["facts.removed-key tasks.md:10"]);
  assert.deepEqual(codes(front), ["facts.removed-key tasks.md:3"]);
  for (const parsed of [fact, front])
    assert.match(
      parsed.diagnostics[0].message,
      /Every task runs the repository's checks; delete this line\./,
    );
});

test("a summary fact is refused, naming the line to delete", () => {
  const parsed = parse(
    described.replace("    - $done:", "    - $summary: Read it.\n    - $done:"),
  );
  assert.deepEqual(codes(parsed), ["facts.removed-key tasks.md:10"]);
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
  assert.deepEqual(codes(over), ["task.title-length tasks.md:9"]);
});

test("an epic folder reads its rows from facts", () => {
  const parsed = parse(
    lines(
      "---",
      "kind: epic",
      "---",
      "- [ ] 1 Native runtime",
      "  - $plan: native-runtime",
      "  - Direction and work",
      "- [ ] 2 Review it",
      "  - $plan: native-runtime",
      "  - $step: review",
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

test("the revision hash reads facts, not their layout", () => {
  const spec = specFiles(),
    text = spec["tasks.md"],
    variant = (from, to) => {
      assert(text.includes(from), from);
      return { ...spec, "tasks.md": text.replace(from, to) };
    };
  // An inline list and repeated bullets are the same content.
  assert.equal(
    specHash(
      variant("  - $after: 1.1, 1.2", "  - $after: 1.1\n  - $after: 1.2"),
    ),
    specHash(spec),
  );
  // Marks stay outside the hash.
  assert.equal(specHash(variant("- [ ] 1.1", "- [x] 1.1")), specHash(spec));
  // A changed fact is a changed revision.
  assert.notEqual(
    specHash(
      variant(
        "$done: An unknown key is reported with its path.",
        "$done: An unknown key is reported with its JSON path.",
      ),
    ),
    specHash(spec),
  );
});
