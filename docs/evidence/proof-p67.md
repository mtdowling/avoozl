# P67 live receipt: fork source and upstream permissions

Proof avoozl-p67 (R102.7, R102.8, R102.12, R102.19, R102.21, design 4.32), run 3, 2026-11-18, in the scratch org `avoozl-scratch`. Script: `scripts/proof-p67-live.mjs` at main `11caf5ee` (#589). Every fact below was read back from GitHub or git by the script. Screenshots: none taken; none kept in git.

**Verdict: pass.** No permission bypass, no upstream copy of the source branch, no stale head accepted, and no private disclosure. One expectation the script set itself is not met as written; see "Base move" below.

## Logins and repositories

| Role | Login | Upstream role | Fork role | Org member |
|---|---|---|---|---|
| Maintainer | mtdowling | admin | admin (org owner) | owner |
| Contributor | avoozlbot | read | write | no |

Repositories, all created by this run: `avoozl-scratch/p67-run3-upstream` (public target), `avoozl-scratch/p67-run3-upstream-fork` (public fork in the same org), `avoozl-scratch/p67-run3-plans-public` (public spec home), `avoozl-scratch/p67-run3-plans-private` (private spec home), `avoozl-scratch/p67-run3-mirror` (private mirror). The target's ruleset requires one approval, dismisses stale approvals, requires `p67-check` on an up-to-date head and forbids force pushes.

Setup access preview (42.2), as the contributor: target `read` (merge: no), fork `write` (push: yes). A retry with nothing to change wrote nothing ({'changes': 0, 'message': 'Nothing to change', 'written': False}). As the maintainer: p67-run3-upstream admin, p67-run3-upstream-fork admin.

## Results

| Expected | Result |
|---|---|
| Contributor has no upstream push or merge right | yes |
| Fork branches work without upstream copies (no `avoozl/*` branch on the target at any stage) | yes |
| An unfinished checkpoint never enters the working branch | yes |
| Avoozl opened the pull request from the fork | yes |
| The PR head is the fork's exact verified head | yes |
| Rebuild from journal and PR comes back held, every head exact | yes |
| Base move: a refreshed check is required on the new head | yes |
| Base move: GitHub dismissed the old approval | no, see below |
| Source push rights never permit target merge | yes |
| The exact checked and approved head is accepted from the maintainer's merge | yes |
| Untrusted sources and issue prose are refused | yes |
| Every private-plan probe on a public surface refused by Avoozl (8 of 8) | yes |
| The private side may name the public PR | yes |
| No public text names the private plan; P67 guard stopped 0 writes | yes |
| Export retry creates nothing new | yes |
| Mirror import by reviewed PR, not forwarded upstream | yes |

## Source and target identities

- Target: `avoozl-scratch/p67-run3-upstream` base `main`, at start `f49ca30031cd9dded0bf96ea117a28745b0385fc`; base moved to `854a6bfbcb61f11296314decb9e4e2669c86f7b4`.
- Source: `avoozl-scratch/p67-run3-upstream-fork` branch `avoozl/4793749f1a789470/work`.
- Unfinished checkpoint: `avoozl/4793749f1a789470/task/acda8789b8606f4a` at `0e02fad88d7503c243aca1b9c09bd6b602879b77`; integrating it was refused: "Task acda8789b8606f4a is not verified at 0e02fad: there is no verification for this exact commit. An unfinished checkpoi".
- Verified head before the PR (published on the spec issue, pre-PR discovery): `5990aed309375a55674d194f9d5f613beafd2c18`. Journal discovery returned `avoozl-scratch/p67-run3-upstream-fork` `avoozl/4793749f1a789470/work` `5990aed30937`; `avoozl-scratch/p67-run3-upstream-fork` `avoozl/4793749f1a789470/task/acda8789b8606f4a` `0e02fad88d75`.
- PR `avoozl-scratch/p67-run3-upstream#1`, opened by Avoozl as the contributor. PR discovery: source `avoozl-scratch/p67-run3-upstream-fork` `avoozl/4793749f1a789470/work` `5990aed309375a55674d194f9d5f613beafd2c18` to target `avoozl-scratch/p67-run3-upstream` `main`.
- Refreshed head after the base move (merge commit, no rebase): `af626908cadf48f9fa73ba328394bb4e6c9f206d`, pushed to the fork by Avoozl.
- Merge: by `mtdowling`, head `af626908cadf48f9fa73ba328394bb4e6c9f206d`, merge commit `463f764e3b5d566e2e2f18e728b51951df575fb7`.

## Check and review evidence

- First head `5990aed30937`: `p67-check` SUCCESS. Maintainer approved it.
- After the base move Avoozl waited on checks (`p67-check` pending) for the new head; then `p67-check` SUCCESS on `af626908cadf`.
- Standing at merge: approvals mtdowling at `af626908cadf`, mtdowling at `af626908cadf`; checks p67-check success at `af626908cadf`.
- Task outcome after observing the merge: `complete` at `af626908cadf`, with check evidence: True.

**Base move.** The script expected GitHub to dismiss the first approval after the base merged into the head. It did not: GitHub now shows that approval (submitted 07:22:40Z on the first head) against the refreshed head `af626908`. The merge of the base changed nothing in the pull request diff. Avoozl did not rely on it: it required a new passing check on the exact refreshed head, and it kept waiting on review, because a read-only login cannot read the maintainer's role and counts no review (fail closed, #542). The maintainer approved the refreshed head again before merging. Reviews stay the target repository's rule (R102.8).

## Permissions

- Contributor landing rights: {'checkpoint': True, 'land': 'observe'}; maintainer: {'checkpoint': True, 'land': 'merge'}.
- Contributor's Avoozl at the approved head: `waiting` (review). Contributor's direct merge: refused, HTTP 404.
- Avoozl observed the maintainer's merge and recorded it once: {'state': 'landed', 'observed': True, 'mergedBy': 'mtdowling', 'mergeCommit': '463f764e3b5d566e2e2f18e728b51951df575fb7', 'pr': 1}.

## Untrusted sources

- unregistered: refused, HTTP 403: "avoozl-scratch/p67-unregistered is not a registered repository. Add it in project setup first; a pull request or record cannot add one."
- forkNotInRegistry: refused, HTTP 403: "avoozl-scratch/p67-run3-upstream-fork is not a registered repository. Add it in project setup first; a pull request or record cannot add one"
- notAFork: refused, HTTP 403: "avoozl-scratch/p67-run3-plans-public is not avoozl-scratch/p67-run3-upstream or a fork of it, so its work cannot land there."
- A spec-issue comment naming an unregistered clone URL and a command: journal references before 2, after 2; none names it.

## Rebuild

Rebuilt in a fresh clone from the journal and PR #1 without the workspace database: held True, generation 1, spend unknown.
- `avoozl-scratch/p67-run3-upstream-fork` `avoozl/4793749f1a789470/work` `5990aed30937` pr 1: exact
- `avoozl-scratch/p67-run3-upstream-fork` `avoozl/4793749f1a789470/task/acda8789b8606f4a` `0e02fad88d75` pr None: exact
Resume without spend was refused ("Spend and private controls are unknown without the private handoff. Import it, or resume accepting t"); resume accepting unknown spend: held False.

## Private-plan probes

| Surface | Refused by | Status |
|---|---|---|
| publicJournalRef | journal schema | 400 |
| publicJournalName | journal schema | 400 |
| pullRequestComment | content rules | 422 |
| publicSpecComment | content rules | 422 |
| pullRequestCreate | content rules | 422 |
| checkSummary | content rules | 422 |
| commitMessage | content rules | 422 |
| refName | content rules | 422 |

The private journal recorded a reference to public PR #1 (allowed). Read back 18 public texts (spec issue and PR comments, PR title and body, fork and upstream branch names, PR commit messages): 0 name the private plan.

## Export issues

- export-first: preview create 2, links 1; created 2, linked 1, state exported.
- export-retry: created 0, linked 0, state exported.
- On GitHub: 2 export issues, 1 blocked-by link, 0 with `crew:avoozl`, 1 `Status: Exported` comment.

## Mirror import and forward ancestry

- A private change merged in the mirror (mirror PR #1), then sync opened import PR #2 from `avoozl-upstream/main` at upstream `463f764e3b5d`.
- The maintainer merged the import: `c4746d8dfef4d14e176e156fb9be6ea449ea53b7`, parents `4d42ac411a1ca9d3b6ded42b8edc8bad91daf134` (mirror) and `463f764e3b5d566e2e2f18e728b51951df575fb7` (upstream).
- Forward records: mirror PR #1 to_forward. Import forwarded: False. Upstream branches: ['main']; upstream PRs from the mirror: 0.

## How the run went

- Fixes found and merged before or during the runs, each after Linux, macOS and Windows passed: #531 (same-org fork head repository), #533 (observed merges keep check evidence), #535 (content rules before every working-head push), #536 (script passes the store), #542 (read-only login reads its own role; another login reads as none), #545 (per-run repositories), #554 (the head form GitHub accepts for a same-org fork), #589 (script: fork in the rule set, export preview inside the owner stage, recover mode).
- Run 1 (`p67-*`) stopped at setup access: GitHub refuses collaborator permission reads to a read-only login. Fixed by #542.
- Run 2 (`p67-run2-*`) stopped at opening the pull request: #531 used a head form GitHub refuses. The correct form was checked live; diagnosis PRs #1 and #2 in `p67-run2-upstream` were opened and closed. Fixed by #554. Run 1 and run 2 repositories are kept.
- Run 3 crashed at the old `export-preview` stage: the CLI refuses `spec export-issues`, preview included, in an agent session ("Only a person exports a spec's task issues. This command is running inside an agent session."). The same run showed the two push probes were not refused, because the script's rule set did not list the fork; they went only to a local copy of the fork, never GitHub. #589 fixed both. Run 3 was then resumed with `recover private-references` at 2026-11-18T15:19:28.377Z: that stage was rerun, and its first result is kept below.
- The owner ran the person steps: the maintainer merge, export-first and export-retry. The first export-retry attempt ran before export-first had finished and was refused ("The next stage is export-first"); it changed nothing. It was run again afterwards.
- All stages ran on code merged to main.

### First private-references result (before the rerun)

```json
{
  "publicJournalRef": {
    "refused": true,
    "status": 400,
    "byP67Guard": false,
    "contentBlocked": false,
    "message": "Journal reference has an invalid repository."
  },
  "publicJournalName": {
    "refused": true,
    "status": 400,
    "byP67Guard": false,
    "contentBlocked": false,
    "message": "Journal record has an invalid spec."
  },
  "pullRequestComment": {
    "refused": true,
    "status": 422,
    "byP67Guard": false,
    "contentBlocked": true,
    "message": "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line."
  },
  "publicSpecComment": {
    "refused": true,
    "status": 422,
    "byP67Guard": false,
    "contentBlocked": true,
    "message": "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line."
  },
  "pullRequestCreate": {
    "refused": true,
    "status": 422,
    "byP67Guard": false,
    "contentBlocked": true,
    "message": "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line."
  },
  "checkSummary": {
    "refused": true,
    "status": 422,
    "byP67Guard": false,
    "contentBlocked": true,
    "message": "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line."
  },
  "commitMessage": {
    "refused": false,
    "value": {
      "repository": "avoozl-scratch/p67-run3-upstream-fork",
      "branch": "avoozl/4793749f1a789470/probe-message",
      "commit": "6fdf0f02066a804bfed01984f478b9047b52f771",
      "pushed": true
    }
  },
  "refName": {
    "refused": false,
    "value": {
      "repository": "avoozl-scratch/p67-run3-upstream-fork",
      "branch": "avoozl/<private-spec>/probe",
      "commit": "cb64b8d2e23279bc00a26e6ffe3dc92b667e0493",
      "pushed": true
    }
  },
  "privateNamesPublic": {
    "refused": false,
    "value": {
      "id": 6982473929,
      "record": {
        "v": 1,
        "generation": 1,
        "op": "checkpoint.public-pr",
        "kind": "checkpoint",
        "spec": "<private-spec>",
        "driver": "24a36c10e972693e",
        "refs": [
          {
            "repository": "avoozl-scratch/p67-run3-upstream",
            "branch": "avoozl/4793749f1a789470/work",
            "commit": "af626908cadf48f9fa73ba328394bb4e6c9f206d",
            "pr": 1
          }
        ],
        "prev": {
          "id": 6971405778,
          "digest": "ca08fe94c5b74678051883f6dc557f94fb9dacfb4d19d57f5a578c0df94e2882"
        }
      }
    }
  }
}
```

Guard stops recorded in that first pass: 2 (pushes to the local fork copy only).

## GitHub calls by login

```json
{
  "maintainer": {
    "GET /repos/avoozl-scratch/p67-run3-upstream": 3,
    "POST /orgs/avoozl-scratch/repos": 4,
    "GET /repos/avoozl-scratch/p67-run3-plans-public": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-private": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror": 5,
    "GET /repos/avoozl-scratch/p67-run3-upstream-fork": 2,
    "POST /repos/avoozl-scratch/p67-run3-upstream/forks": 1,
    "PATCH /repos/avoozl-scratch/p67-run3-upstream-fork": 1,
    "POST /repos/avoozl-scratch/p67-run3-upstream/rulesets": 1,
    "PUT /repos/avoozl-scratch/p67-run3-upstream/collaborators/avoozlbot": 1,
    "PUT /repos/avoozl-scratch/p67-run3-upstream-fork/collaborators/avoozlbot": 1,
    "PUT /repos/avoozl-scratch/p67-run3-plans-public/collaborators/avoozlbot": 1,
    "PUT /repos/avoozl-scratch/p67-run3-plans-private/collaborators/avoozlbot": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/collaborators/avoozlbot/permission": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream-fork/collaborators/avoozlbot/permission": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/collaborators/avoozlbot/permission": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-private/collaborators/avoozlbot/permission": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/collaborators/mtdowling/permission": 3,
    "GET /repos/avoozl-scratch/p67-run3-upstream-fork/collaborators/mtdowling/permission": 2,
    "POST /graphql": 3,
    "POST /repos/avoozl-scratch/p67-run3-upstream/pulls/N/reviews": 2,
    "PUT /repos/avoozl-scratch/p67-run3-upstream/pulls/N/merge": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls/N/reviews": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/commits/af626908cadf48f9fa73ba328394bb4e6c9f206d/check-runs": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/pulls": 4,
    "POST /repos/avoozl-scratch/p67-run3-mirror/pulls": 2,
    "PUT /repos/avoozl-scratch/p67-run3-mirror/pulls/N/merge": 2,
    "GET /repos/avoozl-scratch/p67-run3-upstream/branches/main": 2,
    "GET /repos/avoozl-scratch/p67-run3-mirror/branches/main": 2,
    "GET /repos/avoozl-scratch/p67-run3-upstream/compare/Nd42ac411a1ca9d3b6ded42b8edc8bad91daf134...463f764e3b5d566e2e2f18e728b51951df575fb7": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/branches/avoozl-upstream%2Fmain": 2,
    "GET /repos/avoozl-scratch/p67-run3-mirror/compare/Nd42ac411a1ca9d3b6ded42b8edc8bad91daf134...463f764e3b5d566e2e2f18e728b51951df575fb7": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/pulls/N": 3,
    "GET /repos/avoozl-scratch/p67-run3-mirror/commits/c4746d8dfef4d14e176e156fb9be6ea449ea53b7": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/compare/c4746d8dfef4d14e176e156fb9be6ea449ea53b7...463f764e3b5d566e2e2f18e728b51951df575fb7": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/compare/c4746d8dfef4d14e176e156fb9be6ea449ea53b7...463f764e3b5d566e2e2f18e728b51951df575fb7": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/commits/Nd42ac411a1ca9d3b6ded42b8edc8bad91daf134": 1,
    "GET /repos/avoozl-scratch/p67-run3-mirror/compare/Nd6883183826aaa6fa8b7968d034c1db726bb845...avoozl-upstream/main": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls": 1
  },
  "contributor": {
    "GET /user/repository_invitations": 4,
    "PATCH /user/repository_invitations/N": 4,
    "GET /repos/avoozl-scratch/p67-run3-upstream/collaborators/avoozlbot/permission": 4,
    "GET /repos/avoozl-scratch/p67-run3-upstream-fork/collaborators/avoozlbot/permission": 4,
    "GET /user": 6,
    "GET /repos/avoozl-scratch/p67-run3-upstream": 4,
    "POST /repos/avoozl-scratch/p67-run3-plans-public/issues": 1,
    "POST /repos/avoozl-scratch/p67-run3-plans-private/issues": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/issues/N": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/issues/N/comments": 24,
    "POST /repos/avoozl-scratch/p67-run3-plans-public/issues/N/comments": 8,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/collaborators/avoozlbot/permission": 19,
    "GET /repos/avoozl-scratch/p67-run3-plans-private/issues/N": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-private/issues/N/comments": 5,
    "POST /repos/avoozl-scratch/p67-run3-plans-private/issues/N/comments": 2,
    "GET /repos/avoozl-scratch/p67-run3-plans-private/collaborators/avoozlbot/permission": 3,
    "GET /repos/avoozl-scratch/p67-run3-plans-public": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls": 3,
    "POST /graphql": 5,
    "POST /repos/avoozl-scratch/p67-run3-upstream/pulls": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/commits/Naed309375a55674d194f9d5f613beafd2c18/status": 2,
    "POST /repos/avoozl-scratch/p67-run3-upstream/statuses/Naed309375a55674d194f9d5f613beafd2c18": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/rules/branches/main": 7,
    "GET /repos/avoozl-scratch/p67-run3-upstream/branches/main": 7,
    "GET /repos/avoozl-scratch/p67-run3-upstream/commits/Naed309375a55674d194f9d5f613beafd2c18/check-runs": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls/N": 15,
    "GET /repos/avoozl-scratch/p67-run3-upstream/commits/af626908cadf48f9fa73ba328394bb4e6c9f206d/status": 7,
    "POST /repos/avoozl-scratch/p67-run3-upstream/statuses/af626908cadf48f9fa73ba328394bb4e6c9f206d": 3,
    "GET /repos/avoozl-scratch/p67-run3-upstream/commits/af626908cadf48f9fa73ba328394bb4e6c9f206d/check-runs": 4,
    "GET /repos/avoozl-scratch/p67-run3-upstream/branches/main/protection": 2,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls/N/reviews": 2,
    "GET /repos/avoozl-scratch/p67-run3-upstream/collaborators/mtdowling/permission": 2,
    "PUT /repos/avoozl-scratch/p67-run3-upstream/pulls/N/merge": 1,
    "GET /repos/avoozl-scratch/p67-run3-upstream/issues/N/comments": 2,
    "GET /repos/avoozl-scratch/p67-run3-upstream/pulls/N/commits": 2,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/issues": 1,
    "GET /repos/avoozl-scratch/p67-run3-plans-public/issues/N/dependencies/blocked_by": 2
  }
}
```

Next decision: enable fork heads in ordinary worker pulls. Source resolution and permissions held in this run.

## Follow-up

- The one "no" row: after the base merged into the head, GitHub kept the first approval and now shows it against the refreshed head `af626908`, although the ruleset dismisses stale approvals. Avoozl was not misled (it required a new check and counted no review it could not verify), but a driver with permission to read roles would count that carried-over approval. Follow-up: decide whether Avoozl should require an approval submitted on or after the exact landing head, rather than trusting GitHub's carried-over review.
