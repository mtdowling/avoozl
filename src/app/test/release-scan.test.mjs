// The release gate (R24.2): neither package ships an excluded file or an
// unallowed secret, private name, or machine path. Private names come from
// a local terms file; without one only the public rules run.
import assert from "node:assert/strict";
import test from "node:test";
import {
  RULES,
  npmFiles,
  parseTerms,
  pluginFiles,
  scanPackages,
  scanPlugins,
  scanText,
} from "../../../scripts/release-scan.mjs";

test("the scanner flags each kind of leak and passes plain text", () => {
  const rules = [
    ...RULES,
    ...parseTerms("# a comment\n\nsecret-project: project-x\\b\n"),
  ];
  const samples = {
    "aws-key": "key AKIA" + "ABCDEFGHIJKLMNOP",
    "github-token": "ghp_" + "a".repeat(36),
    "private-key": "-----BEGIN RSA PRIVATE" + " KEY-----",
    "secret-project": "route to Project-X now",
    "macos-home": "/Us" + "ers/someone/x",
    "macos-temp": "/pri" + "vate/tmp/x",
  };
  for (const [rule, text] of Object.entries(samples))
    assert.deepEqual(
      scanText(text, rules).map((hit) => hit.rule),
      [rule],
      rule,
    );
  assert.deepEqual(scanText("Use /path/to/plans and ../app.", rules), []);
  assert.throws(() => parseTerms("no separator"), /rule: regex/);
});

test("a terms file's allow lines cancel only that file's matches (R40.15)", () => {
  const rules = [
    ...RULES,
    ...parseTerms(
      "codename: \\bzorblat\\b\nhost: \\bbuild\\d+\\.corp\\.example\\b\nallow: \\bzorblat-public\\b\nallow host: \\bbuild0\\.corp\\.example\\b\nallow: AKIA\n",
    ),
  ];
  const rulesOf = (text) => scanText(text, rules).map((hit) => hit.rule);
  assert.deepEqual(rulesOf("ship zorblat-public today"), []);
  assert.deepEqual(rulesOf("zorblat ships today"), ["codename"]);
  assert.deepEqual(rulesOf("build0.corp.example and zorblat"), ["codename"]);
  assert.deepEqual(rulesOf("build7.corp.example"), ["host"]);
  // A public rule never takes the file's allow lines.
  assert.deepEqual(rulesOf("key AKIA" + "ABCDEFGHIJKLMNOP"), ["aws-key"]);
  // Problems name the line, never its text.
  assert.throws(
    () => parseTerms("codename: zorblat\nallow nope: quartz"),
    (error) =>
      /line 2/.test(error.message) && !/quartz|nope/.test(error.message),
  );
  assert.throws(
    () => parseTerms("allow: quartz("),
    (error) => /line 1/.test(error.message) && !/quartz/.test(error.message),
  );
});

test("the npm and app packages pass the release scan", () => {
  const report = scanPackages();
  for (const [name, entry] of Object.entries(report)) {
    assert.ok(entry.files > 0, name);
    assert.deepEqual(entry.excluded, [], name);
    assert.deepEqual(entry.findings, [], name);
  }
});

test("the npm package ships the app launcher's built lib", () => {
  const files = npmFiles();
  for (const file of [
    "kirocrew-app/bin/avoozl.mjs",
    "kirocrew-app/bin/lib/cli.mjs",
    "kirocrew-app/bin/lib/src/app/app-backend.mjs",
  ])
    assert.ok(files.includes(file), file);
});

test("plugin docs and the fake plugins pass the scan", () => {
  const files = pluginFiles();
  assert.ok(files.includes("docs/plugins.md"));
  assert.ok(
    files.includes("src/app/test/fixtures/plugins/fake-route/index.mjs"),
  );
  assert.deepEqual(scanPlugins().findings, []);
});
