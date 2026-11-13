# Phase 7 tasks 7.1–7.5: release preparation

Branch `task/p7`, rebased on `kirocrew-native` at 8e8dfc4 (the planner-start
fix). Nothing was pushed or published; task 7.6 is out of scope.

## 7.1 README and docs

`README.md` now starts from installing the Kiro Crew app (`npm ci`,
`npm run build:kirocrew-app`, `kirocrew app install`), then covers creating a
workspace in the page or CLI, Kiro spec folder plans, local delivery, GitHub
delivery, agents and the CLI, configuration, backup, compatibility, and
development. Removed host-era material: the standalone server, ports and
`--url` bridging, machine-host registration, `/api/command`, OpenHands, the
private-repository-only intake claim, `workspace-repo` and `planning publish`,
and the fenced-`task` plan format as the way to plan. The screenshot of the
removed website (`docs/example-workspace.png`) was deleted.

Each command in the README was run against a fresh temporary workspace:
`init`, `seed --example product-launch`, `project configure` (with a Git
checkout holding one commit), `query --q 'ready:true'`, `tick`, `backup`, and
`mcp`.

## 7.2 No default trigger rule

Install creates no rule. `readGitHubPolicy` on a new workspace returns
`mode: null` and no repositories, and the tick runs intake only when some
repository's policy has rules (`src/app/tick.mjs`, `intakeStep`).
`src/app/test/no-default-rule.test.mjs` initializes a workspace, offers it an
assigned issue labeled with every label Avoozl has defaulted to, ticks, and
checks that no repository, issue record, or task appears and that no issue,
label, comment, or assignee call reached GitHub.

`docs/policies.md` documents the rule format and four example policies. The
same test parses every JSON block in it with `normalizeGitHubPolicy`, so the
examples cannot drift from the validator.

A repository registered with `github configure` and no policy still gets a
legacy single-label intake rule, but only an explicit `github sync` reads it;
the tick does not.

## 7.3 License audit

`THIRD_PARTY_NOTICES.md` lists the bundled third-party code: Marked 18.1.3
(MIT, with the Markdown BSD-3-Clause notice) in `src/marked.mjs`.
`src/marked.mjs` is byte-identical to `lib/marked.esm.js` in the registry
tarball, whose sha512 matches the integrity in `src/MARKED.md`.
`src/MARKED-LICENSE.md` differs from the upstream `LICENSE` only in list
markers. Marked ships in the npm package and not in the app package; nothing
in the CLI's import graph loads it.

The app package holds no third-party code: the page bundle keeps React, the
Kiro Crew SDK and `lucide-react` external, and `bin/lib` holds 75 files built
from this repository's sources with no `vendor/` directory. No other file in
the tree carries a third-party copyright or license header.
`kirocrew-app/assets/icon.png` carries no attribution and is treated as
project work.

## 7.4 Secret, private-name and path scans

`scripts/release-scan.mjs` lists the npm package (`npm pack --dry-run`) and
the app package (the directory Kiro Crew copies), refuses excluded paths
(`docs/evidence/`, `docs/research/`, `plans/`, `.kiro/`, `scripts/`, tests,
`.avoozl.json`), and fails on any finding not allowed by name.
`src/app/test/release-scan.test.mjs` runs it in `npm test`. Private names are
read from a local terms file outside version control, so the scanner names
none of them. Without that file only the public rules run and the script
says so.

`package.json` `files` now excludes `src/**/test/` and `src/**/*.test.mjs`.
The app package keeps `kirocrew-app/ui/test/`, which is scanned like the rest.

Shipped files changed: the Workspace view placeholder now reads
`/path/to/plans`, and a comment in `src/app/git.mjs` no longer names a macOS
temporary path. Two tests stopped naming private names
(`github-marker.test.mjs`, `work-model.test.mjs`).

Package result, with local terms loaded:

| Package | Files | Excluded | Findings | Allowed |
| ------- | ----: | -------: | -------: | ------: |
| npm     |   127 |        0 |        0 |       4 |
| app     |   112 |        0 |        0 |       3 |

The allowed lines are the two MCP resource URIs in `src/mcp.mjs` (and its
built copy), whose scheme matches the `planning-repo` rule. They are a
published compatibility interface and were kept.

Tracked tree (not all shipped):

| Category      | Rule          | Hits | Files | Where                                                    |
| ------------- | ------------- | ---: | ----: | -------------------------------------------------------- |
| absolute-path | macos-temp    |   66 |    18 | 17 receipts in `docs/evidence/`, 1 test fixture          |
| absolute-path | macos-home    |   14 |    12 | 8 receipts, 4 test fixtures                              |
| private-name  | planning-repo |    5 |     2 | `docs/evidence/phase6-drain.md`, `src/mcp.mjs` (allowed) |
| absolute-path | linux-home    |    6 |     2 | `plans/multi-workspace-host.md`, 1 test fixture          |
| secret        | private-key   |    1 |     1 | fake value in `github-respond.test.mjs`                  |
| secret        | slack-token   |    1 |     1 | fake value in `github-respond.test.mjs`                  |
| absolute-path | windows-home  |    2 |     2 | test fixtures                                            |

History reachable from HEAD (242 commits, added lines only):

| Category      | Rule           | Hits | Commits | Files                                                                                                                                 |
| ------------- | -------------- | ---: | ------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| private-name  | planning-repo  |   22 |       9 | `canvas-app/extension.js`, `docs/evidence/phase6-drain.md`, `src/app/test/github-marker.test.mjs`, `src/mcp.mjs`, `src/workbench.mjs` |
| private-name  | remote-harness |    2 |       1 | `src/app/test/work-model.test.mjs` (commit 0d18b94)                                                                                   |
| absolute-path | macos-home     | 1440 |      20 | mostly `canvas-app/extension.js`; also receipts, `src/web/App.tsx`, the old placeholder, test fixtures                                |
| absolute-path | macos-temp     |   77 |      19 | receipts, 1 test fixture                                                                                                              |
| absolute-path | linux-home     |    9 |       5 | old `README.md`, `plans/multi-workspace-host.md`, 1 test fixture                                                                      |
| absolute-path | windows-home   |    2 |       2 | test fixtures                                                                                                                         |
| secret        | private-key    |    1 |       1 | fake value in `github-respond.test.mjs`                                                                                               |
| secret        | slack-token    |    1 |       1 | fake value in `github-respond.test.mjs`                                                                                               |

No real credential was found in the tree or history; both secret hits are
deliberate fakes the redaction tests feed in. The internal-system and
machine-name rules found nothing. History was not rewritten, and no receipt
or research file was edited.

## 7.5 Compatibility surfaces

`src/app/test/compatibility.test.mjs` runs the CLI as a child process with
only one name set at a time:

- `plans_*`: all 70 `plans_*` tools the stdio server listed at the Phase 0
  baseline (0747a53) are still listed; 88 are listed now.
- `AVOOZL_WORKSPACE`, `AICOMMANDER_WORKSPACE`, `NUPP_WORKSPACE` each select
  the workspace for `query` and for `workspaceConfig`.
- `*_DB`, `*_DOCUMENTS`/`NUPP_WORKSPACE_DOCS`, and `*_URL` in each family.
- `aicommander`: the `bin` entry matches `avoozl`, and running the CLI through
  a link named `aicommander` gives the same output.

The test found one break: `workspaceConfig` ignored `NUPP_WORKSPACE`, so
`NUPP_WORKSPACE=… avoozl query` fell back to a server and failed with `fetch
failed`. `src/app/config.mjs` now reads it after the other two names.

## Checks

`npm test`: 493 of 493 passed. Page tests (`kirocrew-app/ui`): 21 of 21.
`git diff --check` is clean. `node scripts/release-scan.mjs` exits 0. The app
package was rebuilt (`npm run build`).
