# GitHub linked-branch probe

Observed 2026-11-12 04:17 UTC with `gh` signed in as `mtdowling`
(scopes `admin:org gist project repo workflow`).

Question: when an issue in a private repo has a linked branch that lives in a
different, public repo, does merging a PR from that branch close the private
issue? Does anything on the public side show the private repo's name to a
logged-out viewer?

## Verdicts

| Check | Result |
|---|---|
| Private issue closed by public merge | **Yes**, at merge time, `stateReason: COMPLETED` |
| Closing keyword needed | No. PR body was `Adds one line to the README.` |
| Private name visible to logged-out viewer | **No** (HTML pages, lazy partials, REST PR, timeline, events) |
| Control run (private code repo) | Not run. The first run closed, so it was not needed. |

## Setup

- Private issue repo: `mtdowling/avoozl-e2e-planning-20261111` (`R_kgDOVqvdZA`, PRIVATE)
- Public code repo (new): `mtdowling/avoozl-linked-branch-probe` (`R_kgDOVra_cQ`, PUBLIC),
  README only: "This is a test repo for a GitHub linked-branch probe. It has no real content."

## Commands and key outputs

```sh
gh repo create mtdowling/avoozl-linked-branch-probe --public --add-readme \
  --description "Test repo for a GitHub linked-branch probe. No real content."
# README rewritten via PUT repos/.../contents/README.md -> main head 03d9cf7

gh issue create -R mtdowling/avoozl-e2e-planning-20261111 --title "linked-branch probe" \
  --body "Probe: does a linked branch in another repo close this issue when its PR merges?"
# -> https://github.com/mtdowling/avoozl-e2e-planning-20261111/issues/6
#    issue node id I_kwDOVqvdZM8AAAABeg3NOg

gh api graphql -f query='mutation($i:ID!,$r:ID!,$o:GitObjectID!,$n:String!){
  createLinkedBranch(input:{issueId:$i,repositoryId:$r,oid:$o,name:$n}){
    linkedBranch{id ref{name repository{nameWithOwner}}}}}' \
  -f i=I_kwDOVqvdZM8AAAABeg3NOg -f r=R_kgDOVra_cQ \
  -f o=03d9cf7fc76fdd032b8e6e1baf4f979d361dc9dc -f n=avoozl/probe-1
```

```json
{"data":{"createLinkedBranch":{"linkedBranch":{"id":"LB_kwDPAAAAAXoNzTrOAQeUiw","ref":{"name":"avoozl/probe-1","repository":{"nameWithOwner":"mtdowling/avoozl-linked-branch-probe"}}}}}}
```

```sh
# one README commit on the branch -> e7e6c0c
gh api -X PUT repos/mtdowling/avoozl-linked-branch-probe/contents/README.md \
  -f branch=avoozl/probe-1 -f message="Add probe line to README" -f content=... -f sha=...
gh pr create -R mtdowling/avoozl-linked-branch-probe --head avoozl/probe-1 --base main \
  --title "Add probe line" --body "Adds one line to the README."
# -> https://github.com/mtdowling/avoozl-linked-branch-probe/pull/1
gh pr view .../pull/1 --json closingIssuesReferences   # before merge
```

```json
{"closingIssuesReferences":[],"number":1}
```

Note: right after `gh pr create`, `closingIssuesReferences` was still empty.
The link showed up by merge time (see below). Do not rely on it being filled
in at PR creation.

```sh
gh pr merge .../pull/1 --merge     # mergedAt 2026-11-12T04:17:16Z, merge commit 664e752
```

Issue state, first poll (about 1 s after merge):

```json
{"state":"CLOSED","stateReason":"COMPLETED","closedAt":"2026-11-12T04:17:17Z",
 "closedByPullRequestsReferences":{"nodes":[{"url":"https://github.com/mtdowling/avoozl-linked-branch-probe/pull/1"}]},
 "linkedBranches":{"nodes":[]},
 "timelineItems":{"nodes":[
   {"__typename":"ConnectedEvent","subject":{"url":"https://github.com/mtdowling/avoozl-linked-branch-probe/pull/1"}},
   {"__typename":"ClosedEvent","closer":{"__typename":"PullRequest","url":"https://github.com/mtdowling/avoozl-linked-branch-probe/pull/1"}}]}}
```

PR after merge (owner-authenticated):

```json
{"closingIssuesReferences":[{"id":"I_kwDOVqvdZM8AAAABeg3NOg","number":6,
  "repository":{"id":"R_kgDOVqvdZA","name":"avoozl-e2e-planning-20261111"},
  "url":"https://github.com/mtdowling/avoozl-e2e-planning-20261111/issues/6"}],
 "mergeCommit":{"oid":"664e75257f6267baeaf0d382056d7429695a7ce7"},"state":"MERGED"}
```

Observations:

- GitHub made a `connected` event (PR to issue) at 04:17:15Z, when the PR was
  opened on the linked branch. The issue closed with the PR as `closer`.
- After close, the issue's `linkedBranches` is empty, but the branch
  `avoozl/probe-1` still exists in the public repo. GitHub drops the link on
  close; the branch is not deleted.

## Leak check (logged out)

All fetches used `curl -s` with `GH_TOKEN`/`GITHUB_TOKEN` unset and no
`Authorization` header. Each output was saved and grepped for
`avoozl-e2e-planning`, the private repo node id `R_kgDOVqvdZA`, and the issue
node id.

| URL | HTTP | Private name |
|---|---|---|
| `https://github.com/mtdowling/avoozl-linked-branch-probe/pull/1` | 200 | no |
| `.../pull/1/commits` | 200 | no |
| `.../branches` | 200 | no |
| `.../commit/664e752...` | 200 | no |
| `.../issues/1/show_partial?partial=issues%2Fsidebar` | 200 | no |
| `.../pull/1/partials/unread_timeline?since=...` | 200 | no |
| `.../pull/1/partials/body`, `.../pull/1/partials/links` | 200 | no |
| `.../issues/closing_references/partials/sidebar?source_id=5271408618&source_type=PULL_REQUEST` | 401 | n/a (not served logged out) |
| `api.github.com/repos/mtdowling/avoozl-linked-branch-probe/pulls/1` | 200 | no |
| `.../issues/1` | 200 | no |
| `.../issues/1/timeline` | 200 | no |
| `.../issues/1/events` | 200 | no |
| `.../events` | 200 | no |
| `api.github.com/users/mtdowling/events/public` | 200 | no |

Anonymous timeline events: `committed`, `merged`, `closed`. The `connected`
event is left out. Anonymous issue events: `merged`, `closed`.

The owner-authenticated REST timeline of the same public PR does include the
`connected` event with the full private repo object (`full_name`,
`"private": true`, issue title). So GitHub filters that event by the viewer's
access. Anyone with read access to the private repo sees the link.

The first anonymous REST attempt got HTTP 403 "API rate limit exceeded" (the
shared corporate IP had used all 60 anonymous calls). The REST rows above are
from the retry after the limit reset at 04:37 UTC.

The literal text `linked-branch probe` matched `pulls/1` only through the
public repo's own description, not the private issue title.

Public side shows: the branch name `avoozl/probe-1`, the PR, and the merge.
It does not show the private repo or issue.

## Caveats

- Same-owner user repos, not an org. In `nupp-lang` the result may differ:
  org repos can use rulesets, base-branch protection, and org-level
  visibility settings. Repeat this probe in a scratch org repo before
  relying on it for `nupp-lang`.
- Merge was into the public repo's default branch (`main`). GitHub only
  auto-closes from merges into the default branch.
- The PR author and merger was the private repo's owner. A merger without
  access to the private repo was not tested.
- Notifications and email to watchers were not checked.

## Undo

Nothing was deleted. To clean up:

```sh
gh repo delete mtdowling/avoozl-linked-branch-probe --yes   # needs delete_repo scope: gh auth refresh -s delete_repo
gh issue reopen 6 -R mtdowling/avoozl-e2e-planning-20261111   # optional; it is closed by the probe
gh issue delete 6 -R mtdowling/avoozl-e2e-planning-20261111 --yes   # optional, removes the probe issue
```
