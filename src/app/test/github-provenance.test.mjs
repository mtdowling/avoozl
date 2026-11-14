import assert from "node:assert/strict";
import test from "node:test";
import { parseProvenance, renderProvenance } from "../github-provenance.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const input = {
  spec: "radar-coder",
  tasks: ["rc-2.3", "rc-2.4"],
  commit,
  approvedBy: "octocat",
};
const line =
  "<!-- avoozl v=1 spec=radar-coder tasks=rc-2.3,rc-2.4 commit=" +
  commit +
  " approved-by=octocat -->";

test("writes the one-line marker and reads it back", () => {
  assert.equal(renderProvenance(input), line);
  assert.deepEqual(parseProvenance("text\n" + line + "\nmore").marker, input);
  const plans = { ...input, plans: "octo-org/octo-plans" };
  const text = renderProvenance(plans);
  assert.match(text, / plans=octo-org\/octo-plans -->$/);
  assert.deepEqual(parseProvenance(text).marker, plans);
});

test("the managed marker and the prompt's bare marker are not provenance", () => {
  const managed = '<!-- avoozl-task\n{"version":2}\n-->';
  assert.equal(parseProvenance(managed).problem.code, "missing");
  assert.equal(parseProvenance("").problem.code, "missing");
  assert.equal(parseProvenance(null).problem.code, "missing");
  // A bare marker is a marker with no version: refused, not ignored.
  assert.equal(parseProvenance("<!-- avoozl -->").problem.code, "malformed");
  assert.equal(
    parseProvenance(managed + "\n" + line).marker.spec,
    "radar-coder",
  );
});

test("an unknown key is ignored and an unknown version is refused", () => {
  const extra = line.replace(" -->", " future=whatever -->");
  assert.deepEqual(parseProvenance(extra).marker, input);
  const v2 = line.replace("v=1", "v=2");
  assert.equal(parseProvenance(v2).problem.code, "version");
  assert.equal(parseProvenance(v2).marker, null);
  // The version is checked before any other key.
  assert.equal(
    parseProvenance("<!-- avoozl v=9 commit=zz -->").problem.code,
    "version",
  );
  assert.equal(
    parseProvenance(line.replace("v=1 ", "")).problem.code,
    "version",
  );
});

test("two markers are refused, even when identical", () => {
  for (const body of [line + "\n" + line, line + "\ntext " + line + " tail"]) {
    const { marker, problem } = parseProvenance(body);
    assert.equal(marker, null);
    assert.equal(problem.code, "duplicate");
  }
});

test("a missing required key is named; plans is optional", () => {
  for (const key of ["spec", "tasks", "commit", "approved-by"]) {
    const without = line.replace(new RegExp(" " + key + "=\\S+"), "");
    const { problem } = parseProvenance(without);
    assert.equal(problem.code, "missing-key", key);
    assert.match(problem.message, new RegExp(key));
  }
  assert.equal(parseProvenance(line).marker.plans, undefined);
});

test("a space in a value, a repeated key or a bare word is refused", () => {
  assert.throws(() => renderProvenance({ ...input, spec: "a b" }), /spec/);
  assert.equal(
    parseProvenance(line.replace("radar-coder", "radar coder")).problem.code,
    "malformed",
  );
  assert.equal(
    parseProvenance(line.replace(" -->", " spec=other -->")).problem.code,
    "malformed",
  );
  assert.equal(
    parseProvenance(line.replace(" -->", "  -->")).marker.spec,
    "radar-coder",
  );
});

test("a bad commit is refused on write and on read", () => {
  for (const bad of [
    "abc123",
    commit.toUpperCase(),
    commit + "0",
    "g".repeat(40),
    "",
  ]) {
    assert.throws(() => renderProvenance({ ...input, commit: bad }), /commit/);
  }
  const { problem } = parseProvenance(line.replace(commit, "abc123"));
  assert.equal(problem.code, "bad-value");
  assert.match(problem.message, /commit/);
});

test("a path-like or secret value is refused on write and on read", () => {
  const bad = [
    ["spec", "/etc/passwd"],
    ["spec", "../up"],
    ["spec", "a/b"],
    ["spec", "C:\\work"],
    ["spec", "~"],
    ["approvedBy", "/home/me"],
    ["plans", "/tmp/plans"],
    ["plans", "owner/repo/extra"],
    ["plans", "../x"],
    ["plans", "file:///x"],
    ["tasks", ["/abs"]],
    ["tasks", ["a", "a"]],
    ["tasks", []],
  ];
  for (const [key, value] of bad)
    assert.throws(
      () => renderProvenance({ ...input, [key]: value }),
      /Invalid provenance|provenance/,
      key + "=" + value,
    );
  const read = line.replace("spec=radar-coder", "spec=/etc/passwd");
  assert.equal(parseProvenance(read).problem.code, "bad-value");
  const token = "ghp_" + "a".repeat(36);
  assert.throws(() => renderProvenance({ ...input, spec: token }));
});

test("a problem message never repeats the value it refused", () => {
  const secret = "ghp_" + "b".repeat(36);
  const { problem } = parseProvenance(
    line.replace("approved-by=octocat", "approved-by=" + secret),
  );
  assert.equal(problem.code, "bad-value");
  assert.doesNotMatch(problem.message, /ghp_/);
});
