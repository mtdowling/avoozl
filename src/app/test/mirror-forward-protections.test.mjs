import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FORWARD_MAX_FILE_BYTES,
  scanForward,
} from "../forward-scan.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { forwardMaxFileBytesOf } from "../mirror-policy.mjs";

// rc-25.3: the leak scan of a forward (RC26.5.2, D31.2 test 2). Fake terms
// only: every planted value below is made up for the test.
const TERMS =
  "fake-term: \\bzorblax\\b\nfake-host: \\bbuild\\.example-corp\\.test\\b";
const clean = {
  files: [{ path: "src/a.js", content: "export const a = 1;\n" }],
  message: "Add a",
  branch: "feature/a",
  title: "Add a",
  body: "Adds a.",
};
const opts = { terms: TERMS, maxFileBytes: 1000 };
const scan = (change, extra = {}) =>
  scanForward({ ...clean, ...change }, { ...opts, ...extra });
const file = (content, path = "src/a.js") => ({ files: [{ path, content }] });
const rules = (result) => result.blocks.map((b) => b.rule);

test("a clean change passes", () => {
  assert.deepEqual(scan({}), { ok: true, blocks: [] });
});

test("a planted private term, host, ticket ID, account ID and secret each block", () => {
  const cases = {
    "fake-term": "// zorblax was here\n",
    "fake-host": "fetch('https://build.example-corp.test/x')\n",
    "ticket-id": "// see PROJ-1234\n",
    "account-id": "const a = '123456789012';\n",
    "aws-key": "const k = 'AKIAABCDEFGHIJKLMNOP';\n",
    "private-host": "http://10.1.2.3:8080/\n",
    "assigned-secret": 'password = "hunter2hunter2hunter2"\n',
  };
  for (const [rule, content] of Object.entries(cases)) {
    const result = scan(file(content));
    assert.equal(result.ok, false, rule);
    assert.ok(rules(result).includes(rule), `${rule}: ${rules(result)}`);
  }
});

test("a finding names the rule and place, never the text", () => {
  const result = scan(file("// zorblax\n// ok\n"));
  assert.deepEqual(result.blocks[0], {
    rule: "fake-term",
    place: "file 1 line 1",
  });
  assert.ok(!JSON.stringify(result).includes("zorblax"));
});

test("every place is scanned: names, message, branch, title and body", () => {
  assert.match(
    scan(file("x", "docs/zorblax.md")).blocks[0].place,
    /^file 1 name$/,
  );
  assert.equal(
    scan({ message: "fix PROJ-77" }).blocks[0].place,
    "commit message",
  );
  assert.equal(scan({ branch: "zorblax/x" }).blocks[0].place, "branch name");
  assert.equal(scan({ title: "zorblax" }).blocks[0].place, "title");
  assert.equal(scan({ body: "see PROJ-77" }).blocks[0].place, "body");
});

test("a term in a file name is not repeated in the place", () => {
  const result = scan(file("// zorblax\n", "docs/zorblax.md"));
  assert.ok(result.blocks.length >= 2);
  assert.ok(!JSON.stringify(result).includes("zorblax"));
});

test("an encoded term still blocks", () => {
  assert.equal(scan(file("%7a%6f%72%62%6c%61%78\n")).ok, false);
  assert.equal(scan(file("zor&#98;lax\n")).ok, false);
});

test("a binary file and an over-size file block; an allowlisted one passes", () => {
  const binary = { path: "img.png", content: Buffer.from([1, 2, 0, 3]) };
  const big = { path: "big.txt", content: "a".repeat(opts.maxFileBytes + 1) };
  assert.deepEqual(rules(scan({ files: [binary] })), ["binary-file"]);
  assert.deepEqual(rules(scan({ files: [big] })), ["over-size"]);
  assert.equal(
    scan({ files: [binary, big] }, { allow: ["img.png", "big.txt"] }).ok,
    true,
  );
  const edge = { path: "edge.txt", content: "a".repeat(opts.maxFileBytes) };
  assert.equal(scan({ files: [edge] }).ok, true);
});

test("an allowlisted binary is still scanned as text for its name", () => {
  const binary = { path: "zorblax.png", content: Buffer.from([0, 1]) };
  assert.equal(scan({ files: [binary] }, { allow: ["zorblax.png"] }).ok, false);
});

test("the instance ID and name block", () => {
  const identity = { id: "inst-0123456789ab", name: "Mira" };
  assert.deepEqual(
    rules(scan({ body: "from inst-0123456789ab" }, { identity })),
    ["instance"],
  );
  assert.deepEqual(rules(scan({ title: "Mira's change" }, { identity })), [
    "instance",
  ]);
});

test("it fails closed", () => {
  assert.equal(scan({}, { terms: undefined }).ok, false);
  assert.equal(scan({}, { terms: "not a rule line" }).ok, false);
  assert.equal(scan({}, { terms: "bad: (" }).ok, false);
  assert.equal(scan({ files: [{ path: "a", content: null }] }).ok, false);
  assert.equal(scan({ files: [{ path: "a", content: 5 }] }).ok, false);
  assert.equal(scan({ files: undefined }).ok, false);
  assert.equal(scan({ message: undefined }).ok, false);
  assert.equal(scan({}, { maxFileBytes: undefined }).ok, true);
  assert.equal(scan({}, { maxFileBytes: -1 }).ok, false);
  assert.equal(scan({}, { maxFileBytes: "9" }).ok, false);
  assert.equal(scanForward(null, opts).ok, false);
});

test("common false friends do not block", () => {
  const text = "// SHA-256, UTF-8, RFC-7231, ISO-8601 and v1.2.3\n";
  assert.equal(scan(file(text)).ok, true);
});

test("the default size limit is a positive number", () => {
  assert.ok(Number.isInteger(DEFAULT_FORWARD_MAX_FILE_BYTES));
  assert.equal(scanForward(clean, { terms: "" }).ok, true);
});

// The size limit is a mirror setting with a default (RC26.5.2).
const mirrorOf = (extra) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "acme/app-private": {
        baseBranch: "main",
        mirror: { source: "acme/app", mirror: "acme/app-private", ...extra },
      },
    },
  }).repositories["acme/app-private"].mirror;

test("the size limit comes from the setting, or the shown default", () => {
  assert.equal(
    forwardMaxFileBytesOf(mirrorOf({})),
    DEFAULT_FORWARD_MAX_FILE_BYTES,
  );
  assert.equal(forwardMaxFileBytesOf(null), DEFAULT_FORWARD_MAX_FILE_BYTES);
  const mirror = mirrorOf({ forwardMaxFileBytes: 50 });
  const maxFileBytes = forwardMaxFileBytesOf(mirror);
  assert.equal(maxFileBytes, 50);
  const at = { path: "a.txt", content: "a".repeat(maxFileBytes) };
  const over = { path: "b.txt", content: "a".repeat(maxFileBytes + 1) };
  assert.equal(scan({ files: [at] }, { maxFileBytes }).ok, true);
  assert.deepEqual(rules(scan({ files: [over] }, { maxFileBytes })), [
    "over-size",
  ]);
});

test("a bad size limit is refused", () => {
  for (const value of [0, -1, 1.5, "9", null])
    assert.throws(
      () => mirrorOf({ forwardMaxFileBytes: value }),
      /forwardMaxFileBytes/,
    );
});
