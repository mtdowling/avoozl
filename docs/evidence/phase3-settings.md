# Phase 3 Settings view for `.avoozl.json`: task 3.13

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Code commits: `40f7f41` ("Add GitHub settings operations with validation"), `315ccf0` ("Add Settings view for GitHub policy")
- Base: `kirocrew-native` at `0ba58b8`
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and a GitHub client that throws on any use; no GitHub calls.

## Checks

| Check | Result |
|---|---|
| `npm test` at `315ccf0` | exit 0; 739 tests, 739 pass, 0 fail |
| `node --test kirocrew-app/ui/test/*.test.mjs` | 18 tests, 18 pass |
| New tests | `src/app/test/github-settings.test.mjs` 22, `kirocrew-app/ui/test/settings-api.test.mjs` 6 |
| `git diff --check kirocrew-native` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is not part of the change.

## What landed

| Part | Change | Files |
|---|---|---|
| Operations | `github.settings.get` (observe): the `github` policy keys of the repository `.avoozl.json`, its hash, the effective policy from all layers (`readGitHubPolicy`), the validation error when the saved file is invalid, and the choices each setting takes | `src/app/operations.mjs` |
| Operations | `github.settings.validate` (observe): runs `normalizeGitHubPolicy` on a draft and returns `valid` and `error`; writes nothing | `src/app/operations.mjs` |
| Operations | `github.settings.update` (protect): replaces the policy keys (`mode`, `planningRepository`, `defaultAuthority`, `project`, `epicIssueType`, `repositories`), keeps legacy `issueIntake` and `queue` and every other top-level key, validates the whole block, refuses a stale hash with 409, and writes atomically through `RepositorySettings.write`. A null value removes its key | `src/app/repository-settings.mjs`, `src/app/operations.mjs` |
| Validation | One parser: `github-policy.mjs` (3.1–3.4, `80c9879`). It now exports its key lists and `policySection`. The raw `configuration.update` editor also refuses an invalid `github` block before writing; before, it wrote the file and only reported the error on reload | `src/app/github-policy.mjs`, `src/app/repository-settings.mjs` |
| App backend | The page may call the three operations; app tokens and agent tools may only get and validate | `src/app/app-backend.mjs`, `src/app/safety.mjs` |
| UI | Settings view: mode, planning repository, default authority, epic issue type; Project owner, number, Status, Release, Wave and Iteration field names, and the four `statusValues`; per repository: base branch, coder, allowed actors, minimum permission, required checks, concurrency, priority, managed labels, and label rules (`labelsAll`, `labelsAny`, `labelsNone`, assignee, author, publish children). Check and Save buttons show the backend's message. Settings the form does not show (`checkout`, `folder`, `dependencyText`) are written back unchanged | `kirocrew-app/ui/src/SettingsView.tsx`, `kirocrew-app/ui/src/settings-api.ts`, `kirocrew-app/ui/src/App.tsx`, `kirocrew-app/ui/dist/index.mjs` |

Validation cases covered by tests: plans-repo without a planning repository,
a planning repository in single-repo mode, github authority with no mode, an
unknown `statusValues` key, an unknown Project field key, a Project with no
number, an unknown rule action, a trigger label equal to a managed label, an
executing rule with no allowed actor or permission, an unknown permission,
`issue-radar` in plans-repo mode, a missing base branch under a mode, and an
unknown key. Each is refused by validate and by update, and the file bytes are
unchanged. A valid full policy and an empty rule list are accepted.

## Not done here

- Settings creates no GitHub object (labels, Project, fields, issue type). The Set up GitHub wizard (3.18) does that.
- Project field names and types are not checked against GitHub (design §4.4 "when the token allows"); that needs a live read and belongs with 3.15 or 3.18.
- The base-branch-equals-default check stays at use time (`requireDefaultBranch`), since it needs GitHub.
- Settings edits only the repository `.avoozl.json`. Global and local layers are shown only through the effective policy.
