// Facts bullets in tasks.md (Requirement 111, design §4.40): each key, each
// refusal at its line, defaults, packages, epic folders, and the revision
// hash a pure conversion keeps.
import assert from "node:assert/strict";
import test from "node:test";
import { factsLines, readFacts } from "../spec-facts.mjs";
import { parseSpec, specHash, specItems } from "../spec-plans.mjs";
import { foldManifest, legacyHash } from "./legacy-facts.mjs";
import { legacySpecFiles } from "./spec-fixture.mjs";

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
      "checks: npm test, git diff --check",
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
  assert.equal(parent.checks, undefined);
  assert.deepEqual(parent.requires, ["lt-1.2.1"]);
  assert.equal(child.parent, "lt-1.2");
  assert.equal(child.repository, "nupp", "a task's own fact wins");
  assert.deepEqual(child.checks, ["npm test", "git diff --check"]);
  assert.deepEqual(child.acceptance, [
    "The migration runs twice with no change the second time",
  ]);
});

test("every key the reader uses round-trips through Facts bullets", () => {
  const entry = {
    kind: "leaf",
    repository: "app",
    summary: "Read it.",
    acceptance: ["It reads, with commas, in one line."],
    completion: "integrated",
    checks: ["npm test"],
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
        "    - checks: npm test",
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
        "    - checks: npm test",
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
        "    - checks: npm test",
      ),
      ["facts.missing tasks.md:1", "facts.misplaced tasks.md:3"],
      /no Facts: bullet/,
    ],
    [
      lines(
        "- [ ] 1.1 Read",
        "  - Facts:",
        "    - done: It reads",
        "    - checks: npm test",
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
        "    - checks: npm test",
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
        "    - checks: npm test",
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

test("a manual leaf takes no checks default", () => {
  const parsed = parse(
    lines(
      "---",
      "checks: npm test",
      "---",
      "- [ ] 1.1 Review with the team",
      "  - Facts:",
      "    - manual: true",
      "    - completion: person",
      "    - repo: app",
      "    - done: The team agreed",
    ),
  );
  assert.equal(parsed.proposals[0].checks, undefined);
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
      "    - summary: Direction and work",
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
      ["1", "native-runtime", "implement", "Direction and work"],
      ["2", "native-runtime", "review", ""],
    ],
  );
});

test("a pure conversion keeps the revision hash; a changed fact changes it", () => {
  // The old layout as Avoozl's writers left it: version 1, each task's keys
  // in the usual order.
  const leaf = (summary, acceptance, extra = {}) => ({
    kind: "leaf",
    summary,
    acceptance: [acceptance],
    completion: "integrated",
    checks: ["npm test"],
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
                summary: "The goal.",
                acceptance: [
                  "The CLI reads, validates, and reports its config.",
                ],
                requires: ["1.1", "1.2"],
              },
              1.1: leaf(
                "Parse config.json from the working directory.",
                "A missing file yields defaults.",
              ),
              1.2: leaf(
                "Report unknown keys.",
                "An unknown key is reported with its path.",
                { requires: ["1.1"] },
              ),
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
      "summary: Report unknown keys.",
      "summary: Report unknown keys and types.",
    ),
  };
  assert.notEqual(specHash(changed), specHash(converted));
});
