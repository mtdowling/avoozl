# pc-p1 receipt: per-job tokens, a refusal and a push through the helper

Run 2026-11-19 on macOS with node v26.13.1 and git 2.56.1, on
`task/plugin-credentials-build`. Script:
`node scripts/proofs/proof-pc-p1.mjs --root DIR`. Result of the scripted run:
**24 of 24 checks pass**. No image.

pc-p1 stays unticked: its action (1) has the tick deliver three tasks through
worker sessions until they land. That needs the live proof harness, whose
`start` and `signin` are owner steps on macOS (docs/live-proof-harness.md).
This run drives the same Avoozl code without worker sessions: the client, the
providers, the credentials child, the job table and grants, the git helper,
and the landing setup functions. The tasks' commits are made by the script,
and the landing pushes go through `remoteGit`, as direct landing does.

## Setup

- One scratch root holds everything: `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and
  `KIROCREW_HOME` point inside it, and `AVOOZL_GITHUB_TOKEN`, `GH_TOKEN`,
  `GITHUB_TOKEN` and the agent markers are cleared.
- A fake GitHub on `127.0.0.1` serves the REST calls these steps make under
  `/api` (`GITHUB_API_URL`), and smart-HTTP git for two bare remotes,
  `acme/api` and `octo/tools`, through `git http-backend` (`AVOOZL_GIT_URL`).
  It mints installation-style tokens at
  `POST /app/installations/1/access_tokens` with the asked repositories and
  permissions, enforces each token's permissions on every REST call (by
  GitHub's permission names) and on every git fetch and push, and logs every
  request with its token id and the job the token was minted for.
- The plugin `acme-github` is the test tree's fake provider, copied into the
  root. It claims the fake host for `owners: ["acme"]`, mints through the fake
  GitHub, replies `login: "acme-bot[bot]"` and `person: "acme-dev"`, and
  refuses `purpose: "triage"`. It is declared in this machine's `plugins.json`
  and approved by hash. A copy under the id `acme-copy` is declared in the
  workspace's `.avoozl.json`.
- A fake `gh` first on `PATH` logs each run and prints a token the fake GitHub
  accepts only for `octo/tools`.
- `acme/api`'s checkout has `origin` in the SSH form
  (`git@127.0.0.1:acme/api.git`) and a pre-push hook that writes its
  environment to a file.

## Observed

(1) Tokens per job.

- `acme-copy` is `invalid`: ".avoozl.json plugins.0: plugin acme-copy
  provides credentials; only this machine's plugins.json may declare who Avoozl
  signs in as." It claims nothing.
- The fake GitHub saw separate token requests for `check-in` (metadata,
  contents, issues, pull_requests, checks, statuses: read), `spec-issues`
  (issues: write) and `land` (contents, pull_requests, statuses: write), each
  for `acme/api` only. Every plugin token was used only on `acme/api`.
- The landing push to `acme/api` went over the rewritten
  `http://127.0.0.1:PORT/acme/api.git` and authenticated with the `land`
  token from `avoozl credential`.
- `octo/tools` was read and pushed with `gh`'s token. The fake `gh` log shows
  two runs, `auth token --hostname 127.0.0.1:PORT`, both for `octo/tools`.
- All three commits on both remotes have the author and committer
  "Proof Person <person@example.com>", from git config.
- The pre-push hook's environment held no token. It held
  `AVOOZL_CREDENTIAL_REPOSITORY=acme/api`. A worker's environment
  (`sandboxEnv`) held no token.
- Settings data: `acme-github` for `["acme"]` as `acme-bot[bot]`, per-job;
  `gh` for everything else as `person-gh`, full access.

(2) Triage on `acme/api`: the comment was refused ("acme-github refused: acme
does not allow triage."), nothing was written, one Needs you row named
`acme-github`'s reason, the fake `gh` did not run for `acme`, and a
`check-in` read went on.

(3) Landing setup on `acme/api`: each write in the preview named `acme/api`,
its action and `administration: write` among its permissions. With the
Allow's grants, the ruleset, the merge methods and the variable were written
under a `landing-setup` token. With no Allow (Cancel), nothing was written and
each step came back skipped, with what to do by hand.

(4) After `token.mjs` was edited, every call for `acme` refused with "Approve
acme-github again; GitHub work for acme waits.", the fake `gh` did not run
for `acme`, and `octo/tools` still read with `gh`.

(5) After approving again and adding a second claiming copy,
`acme-github-two`, the clash row appeared with **Use this one** for each, no
GitHub call went out for `acme`, and after the pick work resumed.

(6) With both plugins removed and `AVOOZL_GITHUB_TOKEN` set, Settings data
showed `env` for every owner with full access, and reads and the landing push
used that token.

## Not shown here

- The tick delivering the three tasks through worker sessions (see above).
- The page's confirm modal and the sign-in line as rendered: their text is
  covered by `kirocrew-app/ui/test/github-signin.test.mjs`, and screenshots
  were checked outside git.
