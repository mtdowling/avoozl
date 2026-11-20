# pc-p1 receipt: per-job tokens, a refusal and a push through the helper

Run 2026-11-20 on Linux with node v24.22.3 and git 2.50.1, on main at
8bf25fd0 plus this change. Script:
`PLAYWRIGHT_CORE=DIR node scripts/proofs/proof-pc-p1.mjs --root DIR`.
Result: **26 of 26 checks pass**. Screenshots checked, not kept in git.

## What changed in the proof

- The responder step (the old step 2) is gone, with its expected result: the
  triage agent it used was deleted in a2871aee. The steps after it are
  numbered one lower.
- Landing setup has no page in the current design. It is `avoozl setup`: it
  prints each high-risk step with its job and permissions, `--yes` is the
  person's Allow, and a run without `--yes` is the Cancel. Step (2) now says
  so.
- The page clicks are real: a throwaway `avoozl serve` on `127.0.0.1` serves
  the workspace, and Playwright presses **Approve version 1.0.0**,
  **Use this one: acme-github**, **Remove** and **Remove plugin** in
  Settings › Plugins, and reads the sign-in lines in Settings › GitHub ›
  GitHub calls.
- The tasks' commits are made by the script, and their landing pushes go
  through `remoteGit` with the `land` job, as direct landing does. No worker
  session runs: the fake-agent tick (nk-p2's `--agent fake --offline`) does
  not finish on this machine. "Run one tick" in steps (3) to (5) is one
  GitHub call per owner through the same client a tick uses.

## Fixes the run found

- A CLI command that used a credentials plugin never exited: the
  credentials child kept the process alive. `avoozl github configure acme/api`
  printed its result and then hung. The child is now unref'd; a call's own
  timeout timer holds the process open while that call waits.
- Settings › GitHub said "every owner: signed in with gh" right after
  `acme-github` was approved, until the next token call. `signIns()` reused
  an old inspection of the plugins; it now reads `plugins.json` as token
  calls do.

Each fix has a test in `src/app/github/test/github-credentials.test.mjs` that
fails without it.

## Setup

- One scratch root holds everything: `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and
  `KIROCREW_HOME` point inside it, and `AVOOZL_GITHUB_TOKEN`, `GH_TOKEN`,
  `GITHUB_TOKEN` and the agent markers are cleared.
- A real workspace (`avoozl init`, `workspace add`) with two repositories,
  `api` and `tools`, configured for `acme/api` and `octo/tools` with
  `avoozl github configure`, both landing `direct`.
- A fake GitHub on `127.0.0.1` serves the REST calls under `/api`
  (`GITHUB_API_URL`) and smart-HTTP git for both bare remotes through
  `git http-backend` (`AVOOZL_GIT_URL`). It mints installation-style tokens at
  `POST /app/installations/1/access_tokens`, enforces each token's
  permissions on every REST call and every git fetch and push, and logs every
  request with its token id and job.
- The plugin `acme-github` is the test tree's fake provider, copied into the
  root. It claims the fake host for `owners: ["acme"]`, mints through the fake
  GitHub and replies `login: "acme-bot[bot]"`, `person: "acme-dev"`. It is
  declared in this machine's `plugins.json`. A copy, `acme-copy`, is declared
  in the workspace's `.avoozl.json`.
- A fake `gh` first on `PATH` logs each run and prints a token the fake GitHub
  accepts only for `octo/tools`.
- `acme/api`'s checkout has `origin` in the SSH form
  (`git@127.0.0.1:acme/api.git`) and a pre-push hook that writes its
  environment to a file.

## Observed

(0) Settings › Plugins showed `acme-github` as **Needs approval**; after
**Approve version 1.0.0** it showed **Approved**, and the approval was in
this machine's `plugins.json`.

(1) Tokens per job.

- `acme-copy` is **Invalid**: ".avoozl.json plugins.0: plugin acme-copy
  provides credentials; only this machine's plugins.json may declare who Avoozl
  signs in as." It claims nothing.
- The fake GitHub saw separate token requests for `check-in` (metadata,
  contents, issues, pull_requests, checks, statuses: read), `spec-issues`
  (issues: write) and `land` (contents, pull_requests, statuses: write), each
  for `acme/api` only. Every plugin token was used only on `acme/api`.
- The landing push to `acme/api` went over the rewritten
  `http://127.0.0.1:PORT/acme/api.git` and authenticated with the `land`
  token through the credential helper (2 push requests).
- `octo/tools` was read and pushed with `gh`'s token. No request for `acme`
  carried `gh`'s token.
- All 5 commits on both remotes have the author and committer
  "Proof Person <person@example.com>", from git config.
- The pre-push hook's environment and a worker's environment (`sandboxEnv`)
  held no token.
- Settings › GitHub › GitHub calls showed
  "127.0.0.1:PORT · acme: signed in through acme-github as acme-bot[bot]
  (per-job permissions) · token good for 60 min" and
  "127.0.0.1:PORT · everything else: signed in with gh (full access) · no
  expiry".

(2) `avoozl setup acme/api --repo api --landing pr --methods squash --yes`
printed "Add the avoozl-required-check ruleset: main requires Linux, macOS,
Windows. on acme/api" with "landing-setup asks GitHub for administration:
write, metadata: read, statuses: write, variables: write", then wrote the
ruleset, the merge methods and the CI variable. The same command without
`--yes` wrote nothing and came back `applied: false`, with the ruleset, merge
methods and variable steps still `change`.

(3) After `token.mjs` was edited, a call for `acme` refused with "Approve
acme-github again; GitHub work for acme waits.", the fake `gh` did not run,
`octo/tools` still read with `gh`, and Settings › Plugins showed
**Changed: approve again**.

(4) After **Approve version 1.0.0** on `acme-github` and on a second claiming
copy, `acme-github-two`, the clash item appeared with
**Use this one: acme-github** and **Use this one: acme-github-two**, and no
GitHub call went out for `acme`. After **Use this one: acme-github** the page
said "Signing in through acme-github." and the next `acme/api` call went out.

(5) After **Remove** on both plugins, with `AVOOZL_GITHUB_TOKEN` set and the
page's server restarted, Settings › GitHub › GitHub calls showed
"127.0.0.1:PORT · every owner: signed in with env (full access) · no expiry",
and a read and the landing push of a fourth commit used that token.
