// Tasks hold no facts (simplify sim-2.2, §D20): a task is its title and
// plain done bullets; `$` bullets and the removed front-matter keys are lint
// errors with their fix, and nothing reads them.
import assert from "node:assert/strict";
import test from "node:test";
import { lintSpec, parseSpec } from "../spec-plans.mjs";

const lines = (...rows) => rows.join("\n") + "\n";
const spec = (text) => ({
  name: "config",
  exists: true,
  files: { "tasks.md": text },
});
const parse = (text) => parseSpec(spec(text));
const codes = (result) =>
  result.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.code} ${d.file}:${d.lineStart}`);

test("a task is its title and done bullets; front matter names the repository", () => {
  const parsed = parse(
    lines(
      "---",
      "repo: app",
      "---",
      "- [ ] `cfg-1` Read the config file",
      "  - A missing file yields defaults",
      "  - Invalid JSON names the file and line",
      "- [ ] `cfg-2` Ask the owner (**MANUAL**)",
      "  - The owner said yes",
      "",
      "```",
      "- $after: cfg-1",
      "```",
    ),
  );
  assert.deepEqual(codes(parsed), []);
  const [read, ask] = parsed.proposals;
  assert.deepEqual(read.acceptance, [
    "A missing file yields defaults",
    "Invalid JSON names the file and line",
  ]);
  assert.equal(read.repository, "app");
  // The tag marks a person's task and leaves the title.
  assert.equal(ask.manual, true);
  assert.equal(ask.title, "Ask the owner");
  assert.deepEqual(ask.requires, ["cfg-1"]);
});

test("every $ bullet is refused at its line with its fix, and nothing reads it", () => {
  const fixes = {
    done: /plain bullet/,
    after: /Order tasks by the list/,
    manual: /\(\*\*MANUAL\*\*\)/,
    repo: /front matter's `repo`/,
    investigate: /findings\/<id>\.md/,
    plan: /spec group/,
    step: /review task/,
    paths: /delete this line/,
    type: /delete this line/,
    checks: /repository's checks/,
    summary: /Delete this line/,
  };
  for (const [key, fix] of Object.entries(fixes)) {
    const parsed = parse(
      lines(
        "- [ ] `cfg-1` Read the config file",
        `  - $${key}: x`,
        "  - It reads",
      ),
    );
    assert.deepEqual(codes(parsed), ["facts.removed-key tasks.md:2"], key);
    assert.match(parsed.diagnostics[0].message, fix, key);
    assert.deepEqual(parsed.proposals[0].acceptance, ["It reads"], key);
  }
});

test("kind, epic, integrationBranch and integrationSync front matter is refused", () => {
  for (const key of ["kind", "epic", "integrationBranch", "integrationSync"]) {
    const parsed = parse(
      lines("---", `${key}: x`, "---", "- [ ] `cfg-1` Read", "  - It reads"),
    );
    assert.deepEqual(
      codes(parsed),
      ["frontmatter.removed-key tasks.md:2"],
      key,
    );
  }
});

test("lint reports done.missing, group.bullets, manual.tag, manual.group and frontmatter.repo", () => {
  const text = lines(
    "- [ ] `g-1` A group with a bullet",
    "  - Not a result",
    "  - [ ] `g-1.1` Inside",
    "    - Done",
    "- [ ] `m-1` A group a person does (**MANUAL**)",
    "  - [ ] `m-1.1` Inside",
    "    - Done",
    "- [ ] `t-1` Lower (**manual**)",
    "  - Done",
    "- [ ] `t-2` Plain (MANUAL)",
    "  - Done",
    "- [ ] `n-1` No result",
  );
  assert.deepEqual(codes(parse(text)).sort(), [
    "done.missing tasks.md:12",
    "group.bullets tasks.md:2",
    "manual.group tasks.md:5",
    "manual.tag tasks.md:10",
    "manual.tag tasks.md:8",
  ]);
  // With two repositories a spec names its own.
  const two = { repositories: [{ id: "app" }, { id: "web" }] },
    bare = lines("- [ ] `cfg-1` Read", "  - It reads");
  assert.deepEqual(
    codes(lintSpec({ spec: spec(bare), plan: { id: "config" }, data: two })),
    ["frontmatter.repo tasks.md:1"],
  );
  assert.deepEqual(
    codes(
      lintSpec({
        spec: spec(`---\nrepo: app\n---\n${bare}`),
        plan: { id: "config" },
        data: two,
      }),
    ),
    [],
  );
});

test("a long title stays whole and is refused over the limit", () => {
  const long = "Read the config file: " + "and report each problem. ".repeat(8),
    text = (title) => lines(`- [ ] \`cfg-1\` ${title}`, "  - It reads");
  assert.ok(long.trim().length <= 240);
  assert.equal(parse(text(long)).proposals[0].title, long.trim());
  assert.deepEqual(codes(parse(text(long.repeat(2)))), [
    "task.title-length tasks.md:1",
  ]);
});
