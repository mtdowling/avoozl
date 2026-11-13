#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitHubClient } from "../src/app/github.mjs";
import { inspectGitHubTaskCompletion } from "../src/app/github-completion.mjs";

const repository =
  process.env.AVOOZL_E2E_CODE_REPOSITORY ||
  "mtdowling/avoozl-e2e-code-20261111";

if (!process.argv.includes("--confirm")) {
  console.error(
    "This check pushes a feature branch and merges a pull request in the configured private test repository. Re-run with --confirm.",
  );
  process.exit(2);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

async function waitFor(read, accept, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error(`Timed out waiting for ${label}.`);
}

const base = process.env.KIROCREW_SCRATCH || os.tmpdir(),
  directory = fs.mkdtempSync(path.join(base, "avoozl-completion-")),
  checkout = path.join(directory, "repository"),
  stamp = Date.now(),
  branch = `avoozl/e2e-completion-${stamp}`,
  github = new GitHubClient();
let issue;
let pull;
let merged = false;
try {
  issue = await github.createIssue(repository, {
    title: `Prove exact Avoozl completion ${stamp}`,
    body: "This issue closes only after its exact pull request merges with the configured status check.",
  });

  run("git", [
    "clone",
    "--filter=blob:none",
    `https://github.com/${repository}.git`,
    checkout,
  ]);
  run("git", ["switch", "-c", branch], { cwd: checkout });
  const proofDirectory = path.join(checkout, "proofs");
  fs.mkdirSync(proofDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(proofDirectory, `completion-${stamp}.txt`),
    `Avoozl completion proof ${stamp}\n`,
  );
  run("git", ["add", `proofs/completion-${stamp}.txt`], { cwd: checkout });
  run("git", ["commit", "-m", "Add Avoozl completion proof"], {
    cwd: checkout,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Avoozl E2E",
      GIT_AUTHOR_EMAIL: "avoozl-e2e@example.invalid",
      GIT_COMMITTER_NAME: "Avoozl E2E",
      GIT_COMMITTER_EMAIL: "avoozl-e2e@example.invalid",
    },
  });
  const headSha = run("git", ["rev-parse", "HEAD"], { cwd: checkout });
  run("git", ["push", "origin", branch], { cwd: checkout });

  pull = await github.createPullRequest(repository, {
    title: `Prove exact Avoozl completion ${stamp}`,
    head: branch,
    base: "main",
    body: `Closes #${issue.number}`,
  });
  await github.createCommitStatus(repository, headSha, {
    state: "success",
    context: "avoozl/e2e",
    description: "Avoozl completion proof passed",
  });

  run("gh", [
    "pr",
    "merge",
    String(pull.number),
    "--repo",
    repository,
    "--squash",
    "--delete-branch",
  ]);
  await waitFor(
    () => github.pullRequest(repository, pull.number),
    (value) => value.merged === true,
    "the pull request to merge",
  );
  await waitFor(
    () => github.issue(repository, issue.number),
    (value) => value.state === "closed",
    "the issue to close",
  );
  merged = true;

  const result = await inspectGitHubTaskCompletion(
    github,
    { github: { repository, number: issue.number } },
    { baseBranch: "main", requiredChecks: ["avoozl/e2e"] },
  );
  if (!result.completed || result.headSha !== headSha)
    throw Error(
      "Avoozl did not accept the exact merged and checked pull request.",
    );
  console.log(
    JSON.stringify(
      {
        ok: true,
        repository,
        issue: issue.html_url,
        pullRequest: pull.html_url,
        headSha,
        requiredCheck: "avoozl/e2e",
        completion: result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  if (pull && !merged)
    try {
      run("gh", [
        "pr",
        "close",
        String(pull.number),
        "--repo",
        repository,
        "--delete-branch",
      ]);
    } catch {}
  if (issue && !merged)
    await github
      .updateIssue(repository, issue.number, {
        state: "closed",
        state_reason: "not_planned",
      })
      .catch(() => {});
  fs.rmSync(directory, { recursive: true, force: true });
}
