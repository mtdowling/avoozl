// Fixes from the 2026-11-13 security audit: a caller-named revision never
// reaches git as an option, repository code never sees the gateway's
// credentials, and branch settings refuse a leading dash.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { addedLines, diffBase, revision } from "../content-rules.mjs";
import { commandEvidence, repositoryEnvironment } from "../git.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function repository() {
  const root = temporaryDirectory("avoozl-security-");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-b", "main");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "init",
  );
  return root;
}

test("a revision that looks like an option is refused before git runs", () => {
  const root = repository(),
    written = path.join(temporaryDirectory("avoozl-security-out-"), "x");
  const head = `--output=${written}`;
  assert.throws(
    () => diffBase({ root, baseBranch: "main" }, head),
    /not an option/,
  );
  assert.throws(() => addedLines(root, null, head), /not an option/);
  assert.equal(
    fs.existsSync(written),
    false,
    "git wrote the file it was told to",
  );
  for (const bad of ["", "-x", "a b", "a\nb", 7])
    assert.throws(() => revision(bad), /not an option/);
  assert.equal(revision("HEAD"), "HEAD");
  assert.equal(revision("refs/heads/task/a-1"), "refs/heads/task/a-1");
  assert.deepEqual(addedLines(root, null, "HEAD"), []);
});

test("checks run without the Kiro Crew gateway credentials", async () => {
  const env = repositoryEnvironment({
    PATH: "/bin",
    KIROCREW_PROXY_SECRET: "s",
    KIROCREW_GATEWAY_ORIGIN_PROOF: "p",
  });
  assert.deepEqual(env, { PATH: "/bin" });
  const saved = process.env.KIROCREW_PROXY_SECRET;
  process.env.KIROCREW_PROXY_SECRET = "secret-for-test";
  try {
    const result = await commandEvidence(
      temporaryDirectory("avoozl-security-"),
      [
        process.execPath,
        "-e",
        "process.stdout.write(String(process.env.KIROCREW_PROXY_SECRET))",
      ],
    );
    assert.equal(result.stdout, "undefined");
  } finally {
    if (saved === undefined) delete process.env.KIROCREW_PROXY_SECRET;
    else process.env.KIROCREW_PROXY_SECRET = saved;
  }
});

test("a project branch that starts with a dash is refused", (t) => {
  const { root, store } = fixture(t);
  for (const key of ["baseBranch", "integrationBranch"]) {
    const filename = path.join(root, `.avoozl-${key}.json`);
    fs.writeFileSync(
      filename,
      JSON.stringify({
        version: 1,
        projects: { code: { root: "../code", [key]: "--upload-pack=x" } },
      }),
    );
    const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      files: { repository: filename },
      sources: [],
    });
    configuration.reload();
    assert.match(
      configuration.state.error?.message ?? "",
      /must not start with a dash/,
    );
  }
});
