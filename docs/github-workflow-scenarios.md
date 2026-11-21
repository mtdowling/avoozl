# Workflow scenarios

Each scenario states what runners are given, what they do, and what must be
true afterward. The [workflow kit](../workflow-kit/README.md) runs every one
of them, and `npm run kit:docs` writes this page from the kit's cases.

A scenario is a list of steps, as the kit stores it:

```json
{
  "steps": [
    {
      "runner": "A",
      "do": "next"
    },
    {
      "runner": "B",
      "do": "next"
    },
    {
      "runner": "A",
      "do": "claim"
    },
    {
      "runner": "B",
      "do": "claim"
    }
  ],
  "then": {
    "claims": {
      "A": "parser/p-2",
      "B": null
    }
  }
}
```

The steps and their arguments are in the [adapter contract](../workflow-kit/README.md#adapter-contract).
A case under Cases holds the state a runner read and the answers it gave,
so it has no steps.

## Scenarios

### A fresh claim after a restart holds no landed work

Rules: [12.1](github-workflow.md#12-ready-tasks), [15.1](github-workflow.md#15-claims), [16.5](github-workflow.md#16-landing). Case: `scenario-fresh-claim-restart`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The landing mode is `direct`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
3. `A` recovers `parser/p-2` after an interruption, and expects action `none`, landed `false`.
4. `B` reads the ready tasks, and expects ready `[]`.

Then

- The done branches tick `parser/p-1`.
- Origin holds the claim branches `avoozl/parser/p-2`.
- `parser/p-2` has the lease generations `1`.
- No task is ready.

### Landing on an integration branch is interrupted before the tick

Rules: [14.6](github-workflow.md#14-integration-branches), [15.1](github-workflow.md#15-claims), [16.2](github-workflow.md#16-landing), [16.5](github-workflow.md#16-landing), [18.1](github-workflow.md#18-done-tasks). Case: `scenario-integration-interrupted`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `parser`.
- The landing mode is `direct`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks, and expects ready `["parser/p-2"]`.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`, base `parser`.
3. `A` pushes work to the claim branch of `parser/p-2`, and expects push `accepted`.
4. `A` lands `parser/p-2`, interrupted before tick, and expects action `fast-forward-base`, landed `true` and then waits.
5. `B` reads the ready tasks, and expects ready `[]`.
6. `A` recovers `parser/p-2` after an interruption, and expects action `tick-landed-work`, landed `true`.
7. `B` reads the ready tasks, and expects ready `["parser/p-3"]`.

Then

- The done branches tick `parser/p-1`, `parser/p-2`.
- Origin holds no claim branch.
- `parser/p-2` has no lease.
- The ready tasks are `parser/p-3`.

### A pull request merges and GitHub deletes its branch before the tick

Rules: [12.1](github-workflow.md#12-ready-tasks), [16.2](github-workflow.md#16-landing), [16.5](github-workflow.md#16-landing), [17.3](github-workflow.md#17-landing-modes), [17.6](github-workflow.md#17-landing-modes). Case: `scenario-merged-pr-branch-deleted`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-alice`.
- Runner `bob` acts as `acme-bob`.
- The default branch is `main`, and the specs branch is `plans`.
- Origin holds the branches `main`, `plans`.
- The landing mode is `pr` with `ready` pull requests.
- GitHub deletes a pull request's head branch when it merges.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks, and expects ready `["parser/p-2"]`.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
3. `A` pushes work to the claim branch of `parser/p-2`, and expects push `accepted`.
4. `A` lands `parser/p-2`, and expects action `open-pull-request`, pull `1` and then waits.
5. `B` reads the ready tasks, and expects ready `[]`.
6. `bob` merges the pull request of `parser/p-2`, and expects merged `true`.
7. `A` reads the ready tasks, and expects ready `[]`.
8. `A` recovers `parser/p-2` after an interruption, and expects action `tick-landed-work`, landed `true`.

Then

- The pull request from `avoozl/parser/p-2` is merged, merged by `acme-bob` with a verified signature.
- The done branches tick `parser/p-1`, `parser/p-2`.
- Origin holds no claim branch.
- `parser/p-2` has no lease.
- The ready tasks are `parser/p-3`.

### Two runners race for one claim

Rules: [13.1](github-workflow.md#13-next-task), [15.1](github-workflow.md#15-claims), [15.2](github-workflow.md#15-claims), [15.5](github-workflow.md#15-claims). Case: `scenario-race-one-claim`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks, and expects ready `["parser/p-2"]`.
2. `B` reads the ready tasks, and expects ready `["parser/p-2"]`.
3. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
4. `B` claims the first ready task, and expects claimed `null`.
5. `B` reads the ready tasks, and expects ready `[]`.

Then

- `A` holds `parser/p-2`.
- `B` holds no task.
- The newest lease of `parser/p-2` is `A`'s.
- `parser/p-2` has the lease generations `1`.
- Origin holds the claim branches `avoozl/parser/p-2`.

### Two runners race for one claim: the second runner is not the assignee

Rules: [13.1](github-workflow.md#13-next-task), [15.1](github-workflow.md#15-claims), [15.2](github-workflow.md#15-claims), [15.5](github-workflow.md#15-claims). Case: `scenario-race-one-claim/other-login`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-bob`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks, and expects ready `["parser/p-2"]`.
2. `B` reads the ready tasks, and expects ready `[]`.
3. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
4. `B` claims the first ready task, and expects claimed `null`.

Then

- `A` holds `parser/p-2`.
- `B` holds no task.
- The newest lease of `parser/p-2` is `A`'s.
- `parser/p-2` has the lease generations `1`.
- Origin holds the claim branches `avoozl/parser/p-2`.

### A stale holder's push is rejected after a takeover

Rules: [15.3](github-workflow.md#15-claims), [15.5](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims), [15.8](github-workflow.md#15-claims), [15.9](github-workflow.md#15-claims). Case: `scenario-stale-holder-push`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `B` acts as `acme-alice`.
- The default branch is `main`.
- A claim or lease is stale after 24 hours.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
3. `A` reads the leases of `parser/p-2`, and expects generations `[1]` and then waits.
4. `B` takes over `parser/p-2` after 30 hours, and expects holder `true`.
5. `A` pushes work to the claim branch of `parser/p-2`.

Then

- The newest lease of `parser/p-2` is `B`'s.
- `parser/p-2` has the lease generations `1`, `2`.
- GitHub rejects the pushes of `A`.

### An approved task text changes during a claim

Rules: [7.3](github-workflow.md#7-approval), [15.10](github-workflow.md#15-claims), [16.2](github-workflow.md#16-landing). Case: `scenario-task-text-changed`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `bob` acts as `acme-bob`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The landing mode is `direct`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
3. `A` pushes work to the claim branch of `parser/p-2`, and expects push `accepted` and then waits.
4. `bob` pushes a change to `main`, and expects push `accepted`.
5. `A` lands `parser/p-2`, and expects action `none`, revision `redo-or-stop`.

Then

- The done branches tick `parser/p-1`.
- Origin holds the claim branches `avoozl/parser/p-2`.
- `parser/p-2` has the lease generations `1`.

### An approved task text changes during a claim: another task's text changes

Rules: [7.3](github-workflow.md#7-approval), [15.10](github-workflow.md#15-claims), [16.2](github-workflow.md#16-landing). Case: `scenario-task-text-changed/other-task`.

Given

- Runner `A` acts as `acme-alice`.
- Runner `bob` acts as `acme-bob`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The landing mode is `direct`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

1. `A` reads the ready tasks.
2. `A` claims the first ready task, and expects claimed `avoozl/parser/p-2`.
3. `A` pushes work to the claim branch of `parser/p-2`, and expects push `accepted` and then waits.
4. `bob` pushes a change to `main`, and expects push `accepted`.
5. `A` lands `parser/p-2`, and expects action `fast-forward-base`, landed `true`.

Then

- The done branches tick `parser/p-1`, `parser/p-2`.
- Origin holds no claim branch.
- `parser/p-2` has no lease.

## Cases

### With declared branch protection the commit's author approves

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-branch-protection`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-owner"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":true}`.
- The ready tasks are `parser/p-1`.

### With declared branch protection a stranger's commit approves nothing

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-branch-protection-stranger`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-mallory"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":false}`.
- No task is ready.

### A pull request an approver merged approves, whoever authored its commit

Rules: [7.1](github-workflow.md#7-approval), [7.2](github-workflow.md#7-approval). Case: `approval-merged-by`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `history` is `[{"commit":"1","author":"acme-mallory","mergedBy":"acme-owner"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":true}`.
- The ready tasks are `parser/p-1`.

### A pull request a stranger merged approves nothing, even under an approver's author email

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-merged-by-stranger`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `history` is `[{"commit":"1","author":"acme-owner","mergedBy":"acme-mallory"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":false}`.
- No task is ready.

### An approver's verified signature approves, whoever authored the commit

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-signed`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `history` is `[{"commit":"1","author":"acme-mallory","signer":"acme-owner"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":true}`.
- The ready tasks are `parser/p-1`.

### GitHub's own signature on a web commit names no approver

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-signed-by-github`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `history` is `[{"commit":"1","author":"acme-owner","signer":"web-flow"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":false}`.
- No task is ready.

### A spoofed author email approves nothing without GitHub's evidence

Rules: [7.2](github-workflow.md#7-approval). Case: `approval-spoofed-author`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `history` is `[{"commit":"1","author":"acme-owner"}]`.

The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":false}`.
- No task is ready.

### A text change by a non-approver needs a new approval

Rules: [7.2](github-workflow.md#7-approval), [7.3](github-workflow.md#7-approval). Case: `approval-text-change`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-owner"},{"commit":"2","author":"acme-bob"}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":false}`.
- No task is ready.

### A checkbox-only commit keeps the approval

Rules: [7.3](github-workflow.md#7-approval), [7.4](github-workflow.md#7-approval). Case: `approval-tick-approver`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-owner"},{"commit":"2","author":"acme-owner"}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":true}`.
- The ready tasks are `parser/p-2`.

### A runner's tick of a linked spec and its spec group approves nothing and keeps both approvals

Rules: [6.3](github-workflow.md#6-linked-specs), [7.4](github-workflow.md#7-approval), [7.5](github-workflow.md#7-approval). Case: `approval-tick-linked`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `client` is assigned to `acme-alice`.
- The issue of spec `client-parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-owner"},{"commit":"2","author":"acme-alice"}]`.

The tasks of `client-parser`:

```markdown
- [x] `cp-1` Parse the input
```
The tasks of `client`:

```markdown
- [x] `c-1` Build [client parser]
```

When

- The runner answers `approved`.

Then

- Probe `approved` is `{"client":true,"client-parser":true}`.

### A tick by a non-approver keeps the approval

Rules: [7.2](github-workflow.md#7-approval), [7.4](github-workflow.md#7-approval). Case: `approval-tick-non-approver`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `approvers` is `["acme-owner"]`.
- `approvalTrust` is `branch-protection`.
- `history` is `[{"commit":"1","author":"acme-owner"},{"commit":"2","author":"acme-bob"}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `approved`, `ready`.

Then

- Probe `approved` is `{"parser":true}`.
- The ready tasks are `parser/p-2`.

### A spec with no spec issue does not run

Rules: [8.3](github-workflow.md#8-spec-issues-and-assignment), [12.1](github-workflow.md#12-ready-tasks). Case: `assignment-no-issue`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A spec with no assignee does not run

Rules: [8.3](github-workflow.md#8-spec-issues-and-assignment), [12.1](github-workflow.md#12-ready-tasks). Case: `assignment-none`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to .

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A spec assigned to another login does not run

Rules: [8.3](github-workflow.md#8-spec-issues-and-assignment), [12.1](github-workflow.md#12-ready-tasks). Case: `assignment-other`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-bob`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A spec assigned to two logins does not run

Rules: [8.3](github-workflow.md#8-spec-issues-and-assignment), [12.1](github-workflow.md#12-ready-tasks). Case: `assignment-two`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`, `acme-bob`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A claim takes the generation above leases its deleted branch left

Rules: [15.1](github-workflow.md#15-claims), [15.5](github-workflow.md#15-claims). Case: `claim-leftover-leases`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl-lease/parser/p-2/1`, `avoozl-lease/parser/p-2/2`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `parser/p-2`.
- Probe `claim` is `{"branch":"avoozl/parser/p-2","base":"main","mergeBase":false,"lease":"avoozl-lease/parser/p-2/3"}`.

### Without a takeover commit the old holder's push to its own claim branch is accepted

Rules: [15.3](github-workflow.md#15-claims). Case: `claim-no-takeover`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[],"c2":["c1"],"c3":["c2"]}`.
- `heads` is `{"avoozl/parser/p-2":"c2"}`.
- `push` is `{"branch":"avoozl/parser/p-2","by":[{"runner":"holder","head":"c3"}]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `push`.

Then

- Probe `push` is `{"holder":"accepted"}`.

### A claim does not tick when the approved task text changed after its lease

Rules: [7.3](github-workflow.md#7-approval), [15.10](github-workflow.md#15-claims). Case: `claim-revision-changed`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `revision` is `{"task":"parser/p-2","lease":{"title":"Report unknown tokens","acceptance":["An unknown token is reported with its line"]}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `revision`.

Then

- Probe `revision` is `redo-or-stop`.

### A claim lands when the approved task text is the text its lease recorded

Rules: [7.3](github-workflow.md#7-approval), [15.10](github-workflow.md#15-claims). Case: `claim-revision-same`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `revision` is `{"task":"parser/p-2","lease":{"title":"Report unknown tokens","acceptance":["An unknown token is reported with its line and column"]}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `revision`.

Then

- Probe `revision` is `land`.

### The old holder's push is rejected once the new holder pushed a takeover commit

Rules: [15.3](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims), [15.8](github-workflow.md#15-claims), [15.9](github-workflow.md#15-claims). Case: `claim-takeover-fenced`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[],"c2":["c1"],"t":["c2"],"c3":["c2"],"c4":["t"]}`.
- `heads` is `{"avoozl/parser/p-2":"t"}`.
- `push` is `{"branch":"avoozl/parser/p-2","by":[{"runner":"old-holder","head":"c3"},{"runner":"new-holder","head":"c4"}]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `push`.

Then

- Probe `push` is `{"old-holder":"rejected","new-holder":"accepted"}`.

### A linked spec held by its parent's integration branch is ticked there

Rules: [14.6](github-workflow.md#14-integration-branches), [16.2](github-workflow.md#16-landing). Case: `done-branch-linked-held`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `client-v2`, `avoozl/client-parser/client-parser-1`.
- The issue of spec `client-v2` is assigned to `acme-alice`.
- The issue of spec `client-parser` is assigned to `acme-alice`.
- The issue of spec `client-formatter` is assigned to `acme-alice`.
- `taskFiles` is `{"client-v2":["client-v2","client-parser","client-formatter"]}`.
- `land` is `{"task":"client-parser/client-parser-1","checks":"pass","baseMoved":false,"mode":"direct"}`.

The tasks of `client-formatter`:

```markdown
- [ ] `client-formatter-1` Do the first step
```
The tasks of `client-parser`:

```markdown
- [ ] `client-parser-1` Do the first step
```
The tasks of `client-v2`:

```markdown
- [ ] `cv-1` Build [client parser]
- [ ] `cv-2` Build [client formatter]
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"fast-forward-base","base":"client-v2","tick":"same-commit","mergeBase":false,"deleteClaimBranch":true}`.

### A linked spec its parent's integration branch does not hold is ticked on the specs branch

Rules: [14.6](github-workflow.md#14-integration-branches), [16.2](github-workflow.md#16-landing). Case: `done-branch-linked-not-held`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `client-v2`, `avoozl/client-parser/client-parser-1`.
- The issue of spec `client-v2` is assigned to `acme-alice`.
- The issue of spec `client-parser` is assigned to `acme-alice`.
- The issue of spec `client-formatter` is assigned to `acme-alice`.
- `taskFiles` is `{"client-v2":["client-v2"]}`.
- `land` is `{"task":"client-parser/client-parser-1","checks":"pass","baseMoved":false,"mode":"direct"}`.

The tasks of `client-formatter`:

```markdown
- [ ] `client-formatter-1` Do the first step
```
The tasks of `client-parser`:

```markdown
- [ ] `client-parser-1` Do the first step
```
The tasks of `client-v2`:

```markdown
- [ ] `cv-1` Build [client parser]
- [ ] `cv-2` Build [client formatter]
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"fast-forward-base","base":"client-v2","tick":"own-commit","mergeBase":false,"deleteClaimBranch":true}`.

### With no branch named for the spec, tasks land on the default branch

Rules: [14.1](github-workflow.md#14-integration-branches). Case: `integration-absent`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `client` is assigned to `acme-alice`.

The tasks of `client`:

```markdown
- [ ] `c-1` Split the transport
- [ ] `c-2` Move the callers
```

When

- The runner answers `claim`.

Then

- Probe `claim` is `{"branch":"avoozl/client/c-1","base":"main","mergeBase":false}`.

### A claim on an integration branch merges the default branch in first

Rules: [14.1](github-workflow.md#14-integration-branches), [14.3](github-workflow.md#14-integration-branches). Case: `integration-behind`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `client`.
- Origin's `client` lacks the default branch's head.
- The issue of spec `client` is assigned to `acme-alice`.

The tasks of `client`:

```markdown
- [ ] `c-1` Split the transport
- [ ] `c-2` Move the callers
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `client/c-1`.
- Probe `claim` is `{"branch":"avoozl/client/c-1","base":"client","mergeBase":true}`.

### An integration branch that already holds the default branch is not merged

Rules: [14.1](github-workflow.md#14-integration-branches), [14.3](github-workflow.md#14-integration-branches). Case: `integration-current`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `client`.
- The issue of spec `client` is assigned to `acme-alice`.

The tasks of `client`:

```markdown
- [ ] `c-1` Split the transport
- [ ] `c-2` Move the callers
```

When

- The runner answers `claim`.

Then

- Probe `claim` is `{"branch":"avoozl/client/c-1","base":"client","mergeBase":false}`.

### A linked spec lands on the branch named for its parent

Rules: [14.1](github-workflow.md#14-integration-branches). Case: `integration-linked`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `client-v2`.
- The issue of spec `client-v2` is assigned to `acme-alice`.
- The issue of spec `client-parser` is assigned to `acme-alice`.
- The issue of spec `client-formatter` is assigned to `acme-alice`.

The tasks of `client-formatter`:

```markdown
- [ ] `client-formatter-1` Do the first step
```
The tasks of `client-parser`:

```markdown
- [ ] `client-parser-1` Do the first step
```
The tasks of `client-v2`:

```markdown
- [ ] `cv-1` Build [client parser]
- [ ] `cv-2` Build [client formatter]
```

When

- The runner answers `claim`.

Then

- Probe `claim` is `{"branch":"avoozl/client-parser/client-parser-1","base":"client-v2","mergeBase":false}`.

### An auto pull request is merged by the runner once checks pass

Rules: [17.4](github-workflow.md#17-landing-modes). Case: `landing-auto`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"pr","pr":"auto"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"open-and-merge-pull-request","base":"main","tick":"same-commit","mergeBase":false,"deleteClaimBranch":true,"mergeGuard":"head-sha"}`.

### A merge of an auto pull request is guarded by the checked head, and a moved base is merged in first

Rules: [16.3](github-workflow.md#16-landing), [17.4](github-workflow.md#17-landing-modes). Case: `landing-auto-base-moved`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":true,"mode":"pr","pr":"auto"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"open-and-merge-pull-request","base":"main","tick":"same-commit","mergeBase":true,"mergeGuard":"head-sha","deleteClaimBranch":true}`.

### A base that moved is merged into the claim branch before the checks

Rules: [16.1](github-workflow.md#16-landing), [16.3](github-workflow.md#16-landing). Case: `landing-base-moved`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":true,"mode":"direct"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"fast-forward-base","base":"main","tick":"same-commit","mergeBase":true,"deleteClaimBranch":true}`.

### Failing checks land nothing

Rules: [16.3](github-workflow.md#16-landing). Case: `landing-checks-fail`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"fail","baseMoved":false,"mode":"direct"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"none"}`.

### Direct landing fast-forwards the base and deletes the claim branch

Rules: [16.1](github-workflow.md#16-landing), [16.2](github-workflow.md#16-landing), [17.1](github-workflow.md#17-landing-modes). Case: `landing-direct`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"direct"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"fast-forward-base","base":"main","tick":"same-commit","mergeBase":false,"deleteClaimBranch":true}`.

### A draft pull request is opened and never merged by the runner

Rules: [17.2](github-workflow.md#17-landing-modes). Case: `landing-draft`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"pr","pr":"draft"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"open-draft-pull-request","base":"main","tick":"same-commit","mergeBase":false,"deleteClaimBranch":false}`.

### A fresh claim after a restart holds no landed work

Rules: [15.1](github-workflow.md#15-claims), [16.5](github-workflow.md#16-landing). Case: `landing-fresh-claim`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[]}`.
- `heads` is `{"main":"c1"}`.
- `land` is `{"task":"parser/p-2","checks":"fail","baseMoved":false,"mode":"direct","claim":{"start":"c1","head":"c1"}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landed`, `landing`.

Then

- Probe `landed` is `false`.
- Probe `landing` is `{"action":"none"}`.

### Landed work with no tick on an integration branch is ticked there

Rules: [14.6](github-workflow.md#14-integration-branches), [16.2](github-workflow.md#16-landing), [16.5](github-workflow.md#16-landing), [18.1](github-workflow.md#18-done-tasks). Case: `landing-integration-interrupted`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `parser`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[],"c2":["c1"],"c3":["c2"]}`.
- `heads` is `{"parser":"c3"}`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"direct","claim":{"start":"c1","head":"c2"}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"tick-landed-work","base":"parser","tick":"own-commit","mergeBase":false,"deleteClaimBranch":true}`.

### A merged pull request whose branch GitHub deleted is landed work awaiting its tick

Rules: [12.1](github-workflow.md#12-ready-tasks), [16.2](github-workflow.md#16-landing), [16.5](github-workflow.md#16-landing). Case: `landing-merged-pull-request`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`, and the specs branch is `plans`.
- Origin holds the branches `main`, `plans`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[],"c2":["c1"],"c3":["c1"]}`.
- `heads` is `{"main":"c3"}`.
- `mergedPullHeads` is `["avoozl/parser/p-2"]`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"pr","claim":{"start":"c1","head":"c2","pull":{"merged":true,"head":"c2"}}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`, `landed`, `landing`.

Then

- No task is ready.
- Probe `landed` is `true`.
- Probe `landing` is `{"action":"tick-landed-work","base":"plans","tick":"own-commit","mergeBase":false,"deleteClaimBranch":true}`.

### With landing off the runner pushes the claim branch only

Rules: [17.5](github-workflow.md#17-landing-modes). Case: `landing-off`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"off"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"push-claim-branch","base":"main","tick":"same-commit","mergeBase":false,"deleteClaimBranch":false}`.

### A ready pull request is opened and left to a person

Rules: [17.3](github-workflow.md#17-landing-modes). Case: `landing-ready`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"pr","pr":"ready"}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"open-pull-request","base":"main","tick":"same-commit","mergeBase":false,"deleteClaimBranch":false}`.

### Landed work with no tick is ticked on the specs branch, then the claim branch goes

Rules: [16.1](github-workflow.md#16-landing), [16.2](github-workflow.md#16-landing), [16.5](github-workflow.md#16-landing). Case: `landing-split-interrupted`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`, and the specs branch is `plans`.
- Origin holds the branches `main`, `plans`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `graph` is `{"c1":[],"c2":["c1"],"c3":["c2"]}`.
- `heads` is `{"main":"c3"}`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"direct","claim":{"start":"c1","head":"c2"}}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `landing`.

Then

- Probe `landing` is `{"action":"tick-landed-work","base":"plans","tick":"own-commit","mergeBase":false,"deleteClaimBranch":true}`.

### The newest lease is the highest generation, whatever its age

Rules: [15.5](github-workflow.md#15-claims), [15.6](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims). Case: `lease-highest-generation`.

Given

- The runner acts as `acme-bob`.
- The default branch is `main`.
- A claim or lease is stale after 24 hours.
- Origin holds the branches `main`, `avoozl/parser/p-2`, `avoozl-lease/parser/p-2/1`, `avoozl-lease/parser/p-2/2`.
- The issue of spec `parser` is assigned to `acme-bob`.
- `leases` is `{"parser/p-2":[{"generation":1,"ageHours":1},{"generation":2,"ageHours":30}]}`.
- `claimAgeHours` is `{"parser/p-2":30}`.
- `resume` is `{"task":"parser/p-2","runners":["r1","r2"]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `resume`.

Then

- Probe `resume` is `{"holder":"r1","lease":"avoozl-lease/parser/p-2/3","stopped":["r2"]}`.

### A push to the base needs passing checks on that exact head

Rules: [20.1](github-workflow.md#20-runner-limits). Case: `limit-20-1`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"push-base","checks":"fail"},{"kind":"push-base","checks":"pass"}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.1",null]`.

### A public repository gets no private name, path or host

Rules: [20.10](github-workflow.md#20-runner-limits). Case: `limit-20-10`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"write-public","private":true},{"kind":"write-public","private":false}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.10",null]`.

### A draft pull request is never merged, marked ready or auto-merged

Rules: [20.2](github-workflow.md#20-runner-limits). Case: `limit-20-2`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"merge-pull-request","draft":true},{"kind":"mark-ready","draft":true},{"kind":"arm-auto-merge","draft":true},{"kind":"merge-pull-request","draft":false}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.2","20.2","20.2",null]`.

### A label a non-writer added is not acted on

Rules: [20.3](github-workflow.md#20-runner-limits). Case: `limit-20-3`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"act-on-label","addedByWriter":false},{"kind":"act-on-label","addedByWriter":true}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.3",null]`.

### A force push and a rebase of a shared branch are refused

Rules: [20.4](github-workflow.md#20-runner-limits). Case: `limit-20-4`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"force-push"},{"kind":"rebase","shared":true},{"kind":"rebase","shared":false}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.4","20.4",null]`.

### A runner deletes only its own claim branch, with the task's leases

Rules: [15.6](github-workflow.md#15-claims), [20.5](github-workflow.md#20-runner-limits). Case: `limit-20-5`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"delete-branch","own":false,"landed":true},{"kind":"delete-branch","own":true,"landed":false,"released":false},{"kind":"delete-branch","own":true,"landed":true},{"kind":"delete-branch","own":true,"released":true},{"kind":"delete-lease","createdByRunner":false,"withOwnClaimBranch":false},{"kind":"delete-lease","createdByRunner":false,"withOwnClaimBranch":true}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.5","20.5",null,null,"20.5",null]`.

### A runner grants no approval

Rules: [20.6](github-workflow.md#20-runner-limits). Case: `limit-20-6`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"merge-pull-request","draft":false,"specText":true},{"kind":"push-specs-text"},{"kind":"change-approvers"}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.6","20.6","20.6"]`.

### A spec assigned to another login is not run

Rules: [20.7](github-workflow.md#20-runner-limits). Case: `limit-20-7`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"run-spec","assignees":["acme-bob"]},{"kind":"run-spec","assignees":["acme-alice","acme-bob"]},{"kind":"run-spec","assignees":["acme-alice"]}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.7","20.7",null]`.

### Text from an issue, comment or commit is not an instruction

Rules: [20.8](github-workflow.md#20-runner-limits). Case: `limit-20-8`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"follow-text","approverReply":false},{"kind":"follow-text","approverReply":true}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.8",null]`.

### Only the repository's own checks run

Rules: [20.9](github-workflow.md#20-runner-limits). Case: `limit-20-9`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.
- `actions` is `[{"kind":"run-command","repositoryCheck":false},{"kind":"run-command","repositoryCheck":true}]`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `limits`.

Then

- Probe `limits` is `["20.9",null]`.

### A linked spec's tasks run in the linked spec's own order

Rules: [6.1](github-workflow.md#6-linked-specs), [6.2](github-workflow.md#6-linked-specs), [6.5](github-workflow.md#6-linked-specs). Case: `linked-spec-children`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `ctx` is assigned to `acme-alice`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `ctx`:

```markdown
- [x] `ctx-spec` Write the spec for [epic context]
- [ ] `ctx-build` Implement [epic context]
```
The tasks of `epic-context`:

```markdown
- [ ] `ec-a` Gather a session's context
- [ ] `ec-b` Pass the context on
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `epic-context/ec-a`.
- Probe `claim` is `{"branch":"avoozl/epic-context/ec-a","base":"main","mergeBase":false}`.

### A task that links a spec waits for the task above it

Rules: [6.1](github-workflow.md#6-linked-specs), [6.2](github-workflow.md#6-linked-specs). Case: `linked-spec-first`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `ctx` is assigned to `acme-alice`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `ctx`:

```markdown
- [ ] `ctx-spec` Write the spec for epic context
- [ ] `ctx-build` Implement [epic context]
```
The tasks of `epic-context`:

```markdown
- [ ] `ec-a` Gather a session's context
- [ ] `ec-b` Pass the context on
```

When

- The runner answers `ready`.

Then

- The ready tasks are `ctx/ctx-spec`.

### A linked spec runs only when its parent's issue is assigned too

Rules: [8.3](github-workflow.md#8-spec-issues-and-assignment). Case: `linked-spec-parent-unassigned`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `ctx` is assigned to .
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `ctx`:

```markdown
- [x] `ctx-spec` Write the spec for [epic context]
- [ ] `ctx-build` Implement [epic context]
```
The tasks of `epic-context`:

```markdown
- [ ] `ec-a` Gather a session's context
- [ ] `ec-b` Pass the context on
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A manual task is never offered, and the task after it waits

Rules: [3.1](github-workflow.md#3-order), [4.1](github-workflow.md#4-manual-tasks). Case: `manual-gate`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `release` is assigned to `acme-alice`.

The tasks of `release`:

```markdown
- [x] `m-1` Build the package
- [ ] `m-2` Sign off the package (**MANUAL**)
- [ ] `m-3` Publish the package
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A manual task on an integration branch is ticked on that branch

Rules: [4.1](github-workflow.md#4-manual-tasks), [18.1](github-workflow.md#18-done-tasks). Case: `manual-tick-integration-branch`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `release`.
- The issue of spec `release` is assigned to `acme-alice`.
- `manual` is `{"task":"release/m-2"}`.

The tasks of `release`:

```markdown
- [x] `m-1` Build the package
- [ ] `m-2` Sign off the package (**MANUAL**)
- [ ] `m-3` Publish the package
```

When

- The runner answers `ready`, `manualTick`.

Then

- No task is ready.
- Probe `manualTick` is `{"branch":"release"}`.

### A manual task is ticked on the specs branch when the base is the default branch

Rules: [4.1](github-workflow.md#4-manual-tasks), [18.1](github-workflow.md#18-done-tasks). Case: `manual-tick-specs-branch`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`, and the specs branch is `plans`.
- Origin holds the branches `main`, `plans`.
- The issue of spec `release` is assigned to `acme-alice`.
- `manual` is `{"task":"release/m-2"}`.

The tasks of `release`:

```markdown
- [x] `m-1` Build the package
- [ ] `m-2` Sign off the package (**MANUAL**)
- [ ] `m-3` Publish the package
```

When

- The runner answers `ready`, `manualTick`.

Then

- No task is ready.
- Probe `manualTick` is `{"branch":"plans"}`.

### A ticked manual task releases the task after it

Rules: [4.1](github-workflow.md#4-manual-tasks). Case: `manual-ticked`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `release` is assigned to `acme-alice`.

The tasks of `release`:

```markdown
- [x] `m-1` Build the package
- [x] `m-2` Sign off the package (**MANUAL**)
- [ ] `m-3` Publish the package
```

When

- The runner answers `ready`.

Then

- The ready tasks are `release/m-3`.

### An untagged group inside a parallel group runs in order

Rules: [3.3](github-workflow.md#3-order), [3.4](github-workflow.md#3-order), [13.1](github-workflow.md#13-next-task). Case: `nested-group-in-parallel`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `sources` is assigned to `acme-alice`.

The tasks of `sources`:

```markdown
- [ ] `ec-1.2` Sources (**PARALLEL**)
```

When

- The runner answers `ready`.

Then

- The ready tasks are `sources/ec-1.3`, `sources/ec-1.1`.

### A parallel group's children wait for the task above the group

Rules: [3.1](github-workflow.md#3-order), [3.3](github-workflow.md#3-order). Case: `parallel-before`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `epic-context`:

```markdown
- [x] `ec-2.1` Gather a session's context
- [ ] `ec-2.2` Reads, skills and the brief
- [ ] `ec-2.3` Ways out (**PARALLEL**)
- [ ] `ec-2.7` The chip, Activity and Settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `epic-context/ec-2.2`.

### The task below a parallel group waits for every child

Rules: [3.1](github-workflow.md#3-order), [3.3](github-workflow.md#3-order). Case: `parallel-join`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `epic-context`:

```markdown
- [x] `ec-2.1` Gather a session's context
- [x] `ec-2.2` Reads, skills and the brief
- [ ] `ec-2.3` Ways out (**PARALLEL**)
- [ ] `ec-2.7` The chip, Activity and Settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `epic-context/ec-2.6`.

### The task below a parallel group is ready once every child is ticked

Rules: [3.2](github-workflow.md#3-order), [3.3](github-workflow.md#3-order). Case: `parallel-joined`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `epic-context`:

```markdown
- [x] `ec-2.1` Gather a session's context
- [x] `ec-2.2` Reads, skills and the brief
- [x] `ec-2.3` Ways out (**PARALLEL**)
- [ ] `ec-2.7` The chip, Activity and Settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `epic-context/ec-2.7`.

### A claimed child leaves its siblings ready

Rules: [3.3](github-workflow.md#3-order), [12.1](github-workflow.md#12-ready-tasks). Case: `parallel-one-claimed`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/epic-context/ec-2.4`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `epic-context`:

```markdown
- [x] `ec-2.1` Gather a session's context
- [x] `ec-2.2` Reads, skills and the brief
- [ ] `ec-2.3` Ways out (**PARALLEL**)
- [ ] `ec-2.7` The chip, Activity and Settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `epic-context/ec-2.5`, `epic-context/ec-2.6`.

### A parallel group's children are ready together, in file order

Rules: [3.2](github-workflow.md#3-order), [3.3](github-workflow.md#3-order), [13.1](github-workflow.md#13-next-task), [13.2](github-workflow.md#13-next-task). Case: `parallel-open`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `epic-context` is assigned to `acme-alice`.

The tasks of `epic-context`:

```markdown
- [x] `ec-2.1` Gather a session's context
- [x] `ec-2.2` Reads, skills and the brief
- [ ] `ec-2.3` Ways out (**PARALLEL**)
- [ ] `ec-2.7` The chip, Activity and Settings
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `epic-context/ec-2.4`, `epic-context/ec-2.5`, `epic-context/ec-2.6`.
- Probe `claim` is `{"branch":"avoozl/epic-context/ec-2.4","base":"main","mergeBase":false}`.

### A phase opens once every task above it is ticked

Rules: [3.6](github-workflow.md#3-order). Case: `phase-done`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `config` is assigned to `acme-alice`.

The tasks of `config`:

```markdown
- [x] `c-1` Read the file
- [x] `c-2` Report unknown keys
- [ ] `c-3` Apply the settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `config/c-3`.

### The first task of a phase waits for the phase above

Rules: [3.6](github-workflow.md#3-order). Case: `phase-open`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `config` is assigned to `acme-alice`.

The tasks of `config`:

```markdown
- [x] `c-1` Read the file
- [ ] `c-2` Report unknown keys
- [ ] `c-3` Apply the settings
```

When

- The runner answers `ready`.

Then

- The ready tasks are `config/c-2`.

### Two runners resume one handed-off claim, and the first lease create wins

Rules: [8.4](github-workflow.md#8-spec-issues-and-assignment), [15.3](github-workflow.md#15-claims), [15.5](github-workflow.md#15-claims), [15.6](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims). Case: `resume-handoff`.

Given

- The runner acts as `acme-bob`.
- The default branch is `main`.
- A claim or lease is stale after 24 hours.
- Origin holds the branches `main`, `avoozl/parser/p-2`, `avoozl-lease/parser/p-2/1`.
- The issue of spec `parser` is assigned to `acme-bob`.
- `leases` is `{"parser/p-2":[{"generation":1,"ageHours":2,"released":true}]}`.
- `claimAgeHours` is `{"parser/p-2":2}`.
- `resume` is `{"task":"parser/p-2","runners":["r1","r2"]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `resume`.

Then

- Probe `resume` is `{"holder":"r1","lease":"avoozl-lease/parser/p-2/2","stopped":["r2"]}`.

### A live lease is not taken

Rules: [15.6](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims). Case: `resume-live-lease`.

Given

- The runner acts as `acme-bob`.
- The default branch is `main`.
- A claim or lease is stale after 24 hours.
- Origin holds the branches `main`, `avoozl/parser/p-2`, `avoozl-lease/parser/p-2/1`.
- The issue of spec `parser` is assigned to `acme-bob`.
- `leases` is `{"parser/p-2":[{"generation":1,"ageHours":2}]}`.
- `claimAgeHours` is `{"parser/p-2":2}`.
- `resume` is `{"task":"parser/p-2","runners":["r1","r2"]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `resume`.

Then

- Probe `resume` is `{"holder":null,"lease":null,"stopped":["r1","r2"]}`.

### A stale lease is replaced by the next generation

Rules: [15.6](github-workflow.md#15-claims), [15.7](github-workflow.md#15-claims). Case: `resume-stale-lease`.

Given

- The runner acts as `acme-bob`.
- The default branch is `main`.
- A claim or lease is stale after 24 hours.
- Origin holds the branches `main`, `avoozl/parser/p-2`, `avoozl-lease/parser/p-2/1`.
- The issue of spec `parser` is assigned to `acme-bob`.
- `leases` is `{"parser/p-2":[{"generation":1,"ageHours":30}]}`.
- `claimAgeHours` is `{"parser/p-2":30}`.
- `resume` is `{"task":"parser/p-2","runners":["r1","r2"]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `resume`.

Then

- Probe `resume` is `{"holder":"r1","lease":"avoozl-lease/parser/p-2/2","stopped":["r2"]}`.

### A claim branch takes the task, and the next waits

Rules: [12.1](github-workflow.md#12-ready-tasks), [15.1](github-workflow.md#15-claims). Case: `serial-list-claimed`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A spec with every task ticked has nothing ready

Rules: [12.1](github-workflow.md#12-ready-tasks). Case: `serial-list-done`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [x] `p-2` Report unknown tokens
- [x] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`.

Then

- No task is ready.

### A task waits for the one above it

Rules: [3.1](github-workflow.md#3-order), [12.1](github-workflow.md#12-ready-tasks), [15.1](github-workflow.md#15-claims). Case: `serial-list-next`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `parser` is assigned to `acme-alice`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `parser/p-2`.
- Probe `claim` is `{"branch":"avoozl/parser/p-2","base":"main","mergeBase":false}`.

### A spec holds its tasks in tasks.md or one ## Tasks section, not both

Rules: [1.2](github-workflow.md#1-spec-folders). Case: `single-file-both`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.

The tasks of `config`:

```markdown
- [x] `c-1` Read the file
- [ ] `c-2` Report unknown keys
- [ ] `c-3` Apply the settings
```

When

- The runner answers `violations`.

Then

- Probe `violations` is `{"config":["1.2"],"notes":[]}`.

### A spec in one file keeps its tasks under ## Tasks

Rules: [1.2](github-workflow.md#1-spec-folders), [3.6](github-workflow.md#3-order), [6.1](github-workflow.md#6-linked-specs), [18.1](github-workflow.md#18-done-tasks). Case: `single-file-spec`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `config` is assigned to `acme-alice`.
- The issue of spec `settings` is assigned to `acme-alice`.

The tasks of `settings`:

```markdown
- [x] `set-spec` Write the spec for [config]
- [ ] `set-build` Implement [config]
```

When

- The runner answers `ready`, `claim`.

Then

- The ready tasks are `config/c-2`.
- Probe `claim` is `{"branch":"avoozl/config/c-2","base":"main","mergeBase":false}`.

### A spec issue is found by its marker in an open writer's issue

Rules: [8.2](github-workflow.md#8-spec-issues-and-assignment). Case: `spec-issue-marker`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- `writers` is `["acme-alice"]`.
- `issueList` is `[{"number":1,"state":"open","author":"acme-alice","body":"The spec's issue.\n\n<!-- avoozl-spec:parser -->\n"},{"number":2,"state":"open","author":"acme-alice","body":"<!-- AVOOZL-SPEC:lexer -->\n"},{"number":3,"state":"open","author":"acme-alice","body":"The spec's issue.\n\n<!-- avoozl-spec:lexer -->\n"},{"number":4,"state":"open","author":"acme-alice","body":"The spec's issue.\n\n<!-- avoozl-spec:lexer -->\n"},{"number":5,"state":"open","author":"stranger","body":"The spec's issue.\n\n<!-- avoozl-spec:widget -->\n"},{"number":6,"state":"closed","author":"acme-alice","body":"The spec's issue.\n\n<!-- avoozl-spec:widget -->\n"}]`.

The tasks of `lexer`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```
The tasks of `parser`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```
The tasks of `widget`:

```markdown
- [ ] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `specIssues`, `duplicates`.

Then

- Probe `specIssues` is `{"lexer":3,"parser":1,"widget":null}`.
- Probe `duplicates` is `[4]`.

### A holder of a stopped spec's task makes no push and does not land it

Rules: [10.2](github-workflow.md#10-stopping-a-spec). Case: `stop-holder`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`, `avoozl/parser/p-2`.
- The issue of spec `parser` is assigned to `acme-alice`.
- The issue of spec `parser` has a stop label.
- `graph` is `{"c1":[],"c2":["c1"]}`.
- `heads` is `{"avoozl/parser/p-2":"c1"}`.
- `land` is `{"task":"parser/p-2","checks":"pass","baseMoved":false,"mode":"direct"}`.
- `push` is `{"branch":"avoozl/parser/p-2","by":[{"runner":"holder","head":"c2"}]}`.

The tasks of `parser`:

```markdown
- [x] `p-1` Read the token table
- [ ] `p-2` Report unknown tokens
- [ ] `p-3` Recover after an unknown token
```

When

- The runner answers `ready`, `push`, `landing`.

Then

- No task is ready.
- Probe `push` is `{"holder":"held"}`.
- Probe `landing` is `{"action":"hold"}`.

### A stop on a parent spec's issue makes the linked tasks not ready

Rules: [10.1](github-workflow.md#10-stopping-a-spec), [10.2](github-workflow.md#10-stopping-a-spec), [12.1](github-workflow.md#12-ready-tasks). Case: `stop-parent`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.
- The issue of spec `client-v2` is assigned to `acme-alice`.
- The issue of spec `client-parser` is assigned to `acme-alice`.
- The issue of spec `client-formatter` is assigned to `acme-alice`.
- The issue of spec `widget` is assigned to `acme-alice`.
- The issue of spec `client-v2` has a stop label.

The tasks of `client-formatter`:

```markdown
- [ ] `client-formatter-1` Do the first step
```
The tasks of `client-parser`:

```markdown
- [ ] `client-parser-1` Do the first step
```
The tasks of `client-v2`:

```markdown
- [ ] `cv-1` Build [client parser]
- [ ] `cv-2` Build [client formatter]
```
The tasks of `widget`:

```markdown
- [ ] `w-1` Draw the widget
```

When

- The runner answers `ready`.

Then

- The ready tasks are `widget/w-1`.

### Each broken rule is refused, and clean specs are not

Rules: [2.2](github-workflow.md#2-tasks), [2.3](github-workflow.md#2-tasks), [2.4](github-workflow.md#2-tasks), [2.5](github-workflow.md#2-tasks), [3.2](github-workflow.md#3-order), [3.5](github-workflow.md#3-order), [4.2](github-workflow.md#4-manual-tasks), [5.1](github-workflow.md#5-front-matter). Case: `violations`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.

The tasks of `clean`:

```markdown
- [ ] `v-1` Do it
```
The tasks of `dollar-after`:

```markdown
- [ ] `v-1` First
- [ ] `v-2` Second
```
The tasks of `dollar-fact`:

```markdown
- [ ] `v-1` Do it
```
The tasks of `duplicate-id`:

```markdown
- [ ] `v-1` First
- [ ] `v-1` Second
```
The tasks of `front-integration`:

```markdown
- [ ] `v-1` Do it
```
The tasks of `front-kind`:

```markdown
- [ ] `v-1` Do it
```
The tasks of `group-box`:

```markdown
- [ ] `v-1` Group
```
The tasks of `group-bullet`:

```markdown
- [ ] `v-1` Group
```
The tasks of `manual-group`:

```markdown
- [ ] `v-1` Group (**MANUAL**)
```
The tasks of `manual-ok`:

```markdown
- [ ] `v-1` Sign off (**MANUAL**)
```
The tasks of `manual-plain`:

```markdown
- [ ] `v-1` Sign off (MANUAL)
```
The tasks of `no-done`:

```markdown
- [ ] `v-1` Do it
```
The tasks of `parallel-leaf`:

```markdown
- [ ] `v-1` Task (**PARALLEL**)
```
The tasks of `parallel-lowercase`:

```markdown
- [ ] `v-1` Group (**parallel**)
```
The tasks of `parallel-one-child`:

```markdown
- [ ] `v-1` Group (**PARALLEL**)
```

When

- The runner answers `violations`.

Then

- Probe `violations` is `{"clean":[],"dollar-fact":["2.3"],"dollar-after":["2.3"],"duplicate-id":["2.2"],"no-done":["2.4"],"group-bullet":["2.5"],"group-box":["3.2"],"parallel-lowercase":["3.5"],"parallel-leaf":["3.5"],"parallel-one-child":["3.5"],"manual-plain":["4.2"],"manual-group":["4.2"],"manual-ok":[],"front-kind":["5.1"],"front-integration":["5.1"]}`.

### A spec linked twice, or a spec group with sub-items, is refused

Rules: [6.4](github-workflow.md#6-linked-specs). Case: `violations-links`.

Given

- The runner acts as `acme-alice`.
- The default branch is `main`.
- Origin holds the branches `main`.

The tasks of `a`:

```markdown
- [ ] `a-1` Build [leaf]
- [ ] `a-2` Build [leaf] again
```
The tasks of `b`:

```markdown
- [ ] `b-1` Build [leaf]
```
The tasks of `leaf`:

```markdown
- [ ] `l-1` Do it
```
The tasks of `missing`:

```markdown
- [x] `n-0` Earlier
- [ ] `n-1` Build [gone]
```

When

- The runner answers `violations`.

Then

- Probe `violations` is `{"a":["6.4"],"b":["6.4"],"leaf":[],"missing":["6.4"]}`.

## Rules

### Rule 1.2

- [A spec holds its tasks in tasks.md or one ## Tasks section, not both](#a-spec-holds-its-tasks-in-tasksmd-or-one--tasks-section-not-both)
- [A spec in one file keeps its tasks under ## Tasks](#a-spec-in-one-file-keeps-its-tasks-under--tasks)

### Rule 2.2

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 2.3

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 2.4

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 2.5

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 3.1

- [A manual task is never offered, and the task after it waits](#a-manual-task-is-never-offered-and-the-task-after-it-waits)
- [A parallel group's children wait for the task above the group](#a-parallel-groups-children-wait-for-the-task-above-the-group)
- [The task below a parallel group waits for every child](#the-task-below-a-parallel-group-waits-for-every-child)
- [A task waits for the one above it](#a-task-waits-for-the-one-above-it)

### Rule 3.2

- [The task below a parallel group is ready once every child is ticked](#the-task-below-a-parallel-group-is-ready-once-every-child-is-ticked)
- [A parallel group's children are ready together, in file order](#a-parallel-groups-children-are-ready-together-in-file-order)
- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 3.3

- [An untagged group inside a parallel group runs in order](#an-untagged-group-inside-a-parallel-group-runs-in-order)
- [A parallel group's children wait for the task above the group](#a-parallel-groups-children-wait-for-the-task-above-the-group)
- [The task below a parallel group waits for every child](#the-task-below-a-parallel-group-waits-for-every-child)
- [The task below a parallel group is ready once every child is ticked](#the-task-below-a-parallel-group-is-ready-once-every-child-is-ticked)
- [A claimed child leaves its siblings ready](#a-claimed-child-leaves-its-siblings-ready)
- [A parallel group's children are ready together, in file order](#a-parallel-groups-children-are-ready-together-in-file-order)

### Rule 3.4

- [An untagged group inside a parallel group runs in order](#an-untagged-group-inside-a-parallel-group-runs-in-order)

### Rule 3.5

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 3.6

- [A phase opens once every task above it is ticked](#a-phase-opens-once-every-task-above-it-is-ticked)
- [The first task of a phase waits for the phase above](#the-first-task-of-a-phase-waits-for-the-phase-above)
- [A spec in one file keeps its tasks under ## Tasks](#a-spec-in-one-file-keeps-its-tasks-under--tasks)

### Rule 4.1

- [A manual task is never offered, and the task after it waits](#a-manual-task-is-never-offered-and-the-task-after-it-waits)
- [A manual task on an integration branch is ticked on that branch](#a-manual-task-on-an-integration-branch-is-ticked-on-that-branch)
- [A manual task is ticked on the specs branch when the base is the default branch](#a-manual-task-is-ticked-on-the-specs-branch-when-the-base-is-the-default-branch)
- [A ticked manual task releases the task after it](#a-ticked-manual-task-releases-the-task-after-it)

### Rule 4.2

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 5.1

- [Each broken rule is refused, and clean specs are not](#each-broken-rule-is-refused-and-clean-specs-are-not)

### Rule 6.1

- [A linked spec's tasks run in the linked spec's own order](#a-linked-specs-tasks-run-in-the-linked-specs-own-order)
- [A task that links a spec waits for the task above it](#a-task-that-links-a-spec-waits-for-the-task-above-it)
- [A spec in one file keeps its tasks under ## Tasks](#a-spec-in-one-file-keeps-its-tasks-under--tasks)

### Rule 6.2

- [A linked spec's tasks run in the linked spec's own order](#a-linked-specs-tasks-run-in-the-linked-specs-own-order)
- [A task that links a spec waits for the task above it](#a-task-that-links-a-spec-waits-for-the-task-above-it)

### Rule 6.3

- [A runner's tick of a linked spec and its spec group approves nothing and keeps both approvals](#a-runners-tick-of-a-linked-spec-and-its-spec-group-approves-nothing-and-keeps-both-approvals)

### Rule 6.4

- [A spec linked twice, or a spec group with sub-items, is refused](#a-spec-linked-twice-or-a-spec-group-with-sub-items-is-refused)

### Rule 6.5

- [A linked spec's tasks run in the linked spec's own order](#a-linked-specs-tasks-run-in-the-linked-specs-own-order)

### Rule 7.1

- [A pull request an approver merged approves, whoever authored its commit](#a-pull-request-an-approver-merged-approves-whoever-authored-its-commit)

### Rule 7.2

- [With declared branch protection the commit's author approves](#with-declared-branch-protection-the-commits-author-approves)
- [With declared branch protection a stranger's commit approves nothing](#with-declared-branch-protection-a-strangers-commit-approves-nothing)
- [A pull request an approver merged approves, whoever authored its commit](#a-pull-request-an-approver-merged-approves-whoever-authored-its-commit)
- [A pull request a stranger merged approves nothing, even under an approver's author email](#a-pull-request-a-stranger-merged-approves-nothing-even-under-an-approvers-author-email)
- [An approver's verified signature approves, whoever authored the commit](#an-approvers-verified-signature-approves-whoever-authored-the-commit)
- [GitHub's own signature on a web commit names no approver](#githubs-own-signature-on-a-web-commit-names-no-approver)
- [A spoofed author email approves nothing without GitHub's evidence](#a-spoofed-author-email-approves-nothing-without-githubs-evidence)
- [A text change by a non-approver needs a new approval](#a-text-change-by-a-non-approver-needs-a-new-approval)
- [A tick by a non-approver keeps the approval](#a-tick-by-a-non-approver-keeps-the-approval)

### Rule 7.3

- [A text change by a non-approver needs a new approval](#a-text-change-by-a-non-approver-needs-a-new-approval)
- [A checkbox-only commit keeps the approval](#a-checkbox-only-commit-keeps-the-approval)
- [A claim does not tick when the approved task text changed after its lease](#a-claim-does-not-tick-when-the-approved-task-text-changed-after-its-lease)
- [A claim lands when the approved task text is the text its lease recorded](#a-claim-lands-when-the-approved-task-text-is-the-text-its-lease-recorded)
- [An approved task text changes during a claim](#an-approved-task-text-changes-during-a-claim)
- [An approved task text changes during a claim: another task's text changes](#an-approved-task-text-changes-during-a-claim-another-tasks-text-changes)

### Rule 7.4

- [A checkbox-only commit keeps the approval](#a-checkbox-only-commit-keeps-the-approval)
- [A runner's tick of a linked spec and its spec group approves nothing and keeps both approvals](#a-runners-tick-of-a-linked-spec-and-its-spec-group-approves-nothing-and-keeps-both-approvals)
- [A tick by a non-approver keeps the approval](#a-tick-by-a-non-approver-keeps-the-approval)

### Rule 7.5

- [A runner's tick of a linked spec and its spec group approves nothing and keeps both approvals](#a-runners-tick-of-a-linked-spec-and-its-spec-group-approves-nothing-and-keeps-both-approvals)

### Rule 8.2

- [A spec issue is found by its marker in an open writer's issue](#a-spec-issue-is-found-by-its-marker-in-an-open-writers-issue)

### Rule 8.3

- [A spec with no spec issue does not run](#a-spec-with-no-spec-issue-does-not-run)
- [A spec with no assignee does not run](#a-spec-with-no-assignee-does-not-run)
- [A spec assigned to another login does not run](#a-spec-assigned-to-another-login-does-not-run)
- [A spec assigned to two logins does not run](#a-spec-assigned-to-two-logins-does-not-run)
- [A linked spec runs only when its parent's issue is assigned too](#a-linked-spec-runs-only-when-its-parents-issue-is-assigned-too)

### Rule 8.4

- [Two runners resume one handed-off claim, and the first lease create wins](#two-runners-resume-one-handed-off-claim-and-the-first-lease-create-wins)

### Rule 10.1

- [A stop on a parent spec's issue makes the linked tasks not ready](#a-stop-on-a-parent-specs-issue-makes-the-linked-tasks-not-ready)

### Rule 10.2

- [A holder of a stopped spec's task makes no push and does not land it](#a-holder-of-a-stopped-specs-task-makes-no-push-and-does-not-land-it)
- [A stop on a parent spec's issue makes the linked tasks not ready](#a-stop-on-a-parent-specs-issue-makes-the-linked-tasks-not-ready)

### Rule 12.1

- [A spec with no spec issue does not run](#a-spec-with-no-spec-issue-does-not-run)
- [A spec with no assignee does not run](#a-spec-with-no-assignee-does-not-run)
- [A spec assigned to another login does not run](#a-spec-assigned-to-another-login-does-not-run)
- [A spec assigned to two logins does not run](#a-spec-assigned-to-two-logins-does-not-run)
- [A merged pull request whose branch GitHub deleted is landed work awaiting its tick](#a-merged-pull-request-whose-branch-github-deleted-is-landed-work-awaiting-its-tick)
- [A claimed child leaves its siblings ready](#a-claimed-child-leaves-its-siblings-ready)
- [A fresh claim after a restart holds no landed work](#a-fresh-claim-after-a-restart-holds-no-landed-work)
- [A pull request merges and GitHub deletes its branch before the tick](#a-pull-request-merges-and-github-deletes-its-branch-before-the-tick)
- [A claim branch takes the task, and the next waits](#a-claim-branch-takes-the-task-and-the-next-waits)
- [A spec with every task ticked has nothing ready](#a-spec-with-every-task-ticked-has-nothing-ready)
- [A task waits for the one above it](#a-task-waits-for-the-one-above-it)
- [A stop on a parent spec's issue makes the linked tasks not ready](#a-stop-on-a-parent-specs-issue-makes-the-linked-tasks-not-ready)

### Rule 13.1

- [An untagged group inside a parallel group runs in order](#an-untagged-group-inside-a-parallel-group-runs-in-order)
- [A parallel group's children are ready together, in file order](#a-parallel-groups-children-are-ready-together-in-file-order)
- [Two runners race for one claim](#two-runners-race-for-one-claim)
- [Two runners race for one claim: the second runner is not the assignee](#two-runners-race-for-one-claim-the-second-runner-is-not-the-assignee)

### Rule 13.2

- [A parallel group's children are ready together, in file order](#a-parallel-groups-children-are-ready-together-in-file-order)

### Rule 14.1

- [With no branch named for the spec, tasks land on the default branch](#with-no-branch-named-for-the-spec-tasks-land-on-the-default-branch)
- [A claim on an integration branch merges the default branch in first](#a-claim-on-an-integration-branch-merges-the-default-branch-in-first)
- [An integration branch that already holds the default branch is not merged](#an-integration-branch-that-already-holds-the-default-branch-is-not-merged)
- [A linked spec lands on the branch named for its parent](#a-linked-spec-lands-on-the-branch-named-for-its-parent)

### Rule 14.3

- [A claim on an integration branch merges the default branch in first](#a-claim-on-an-integration-branch-merges-the-default-branch-in-first)
- [An integration branch that already holds the default branch is not merged](#an-integration-branch-that-already-holds-the-default-branch-is-not-merged)

### Rule 14.6

- [A linked spec held by its parent's integration branch is ticked there](#a-linked-spec-held-by-its-parents-integration-branch-is-ticked-there)
- [A linked spec its parent's integration branch does not hold is ticked on the specs branch](#a-linked-spec-its-parents-integration-branch-does-not-hold-is-ticked-on-the-specs-branch)
- [Landed work with no tick on an integration branch is ticked there](#landed-work-with-no-tick-on-an-integration-branch-is-ticked-there)
- [Landing on an integration branch is interrupted before the tick](#landing-on-an-integration-branch-is-interrupted-before-the-tick)

### Rule 15.1

- [A claim takes the generation above leases its deleted branch left](#a-claim-takes-the-generation-above-leases-its-deleted-branch-left)
- [A fresh claim after a restart holds no landed work](#a-fresh-claim-after-a-restart-holds-no-landed-work-1)
- [A fresh claim after a restart holds no landed work](#a-fresh-claim-after-a-restart-holds-no-landed-work)
- [Landing on an integration branch is interrupted before the tick](#landing-on-an-integration-branch-is-interrupted-before-the-tick)
- [Two runners race for one claim](#two-runners-race-for-one-claim)
- [Two runners race for one claim: the second runner is not the assignee](#two-runners-race-for-one-claim-the-second-runner-is-not-the-assignee)
- [A claim branch takes the task, and the next waits](#a-claim-branch-takes-the-task-and-the-next-waits)
- [A task waits for the one above it](#a-task-waits-for-the-one-above-it)

### Rule 15.2

- [Two runners race for one claim](#two-runners-race-for-one-claim)
- [Two runners race for one claim: the second runner is not the assignee](#two-runners-race-for-one-claim-the-second-runner-is-not-the-assignee)

### Rule 15.3

- [Without a takeover commit the old holder's push to its own claim branch is accepted](#without-a-takeover-commit-the-old-holders-push-to-its-own-claim-branch-is-accepted)
- [The old holder's push is rejected once the new holder pushed a takeover commit](#the-old-holders-push-is-rejected-once-the-new-holder-pushed-a-takeover-commit)
- [Two runners resume one handed-off claim, and the first lease create wins](#two-runners-resume-one-handed-off-claim-and-the-first-lease-create-wins)
- [A stale holder's push is rejected after a takeover](#a-stale-holders-push-is-rejected-after-a-takeover)

### Rule 15.5

- [A claim takes the generation above leases its deleted branch left](#a-claim-takes-the-generation-above-leases-its-deleted-branch-left)
- [The newest lease is the highest generation, whatever its age](#the-newest-lease-is-the-highest-generation-whatever-its-age)
- [Two runners resume one handed-off claim, and the first lease create wins](#two-runners-resume-one-handed-off-claim-and-the-first-lease-create-wins)
- [Two runners race for one claim](#two-runners-race-for-one-claim)
- [Two runners race for one claim: the second runner is not the assignee](#two-runners-race-for-one-claim-the-second-runner-is-not-the-assignee)
- [A stale holder's push is rejected after a takeover](#a-stale-holders-push-is-rejected-after-a-takeover)

### Rule 15.6

- [The newest lease is the highest generation, whatever its age](#the-newest-lease-is-the-highest-generation-whatever-its-age)
- [A runner deletes only its own claim branch, with the task's leases](#a-runner-deletes-only-its-own-claim-branch-with-the-tasks-leases)
- [Two runners resume one handed-off claim, and the first lease create wins](#two-runners-resume-one-handed-off-claim-and-the-first-lease-create-wins)
- [A live lease is not taken](#a-live-lease-is-not-taken)
- [A stale lease is replaced by the next generation](#a-stale-lease-is-replaced-by-the-next-generation)

### Rule 15.7

- [The old holder's push is rejected once the new holder pushed a takeover commit](#the-old-holders-push-is-rejected-once-the-new-holder-pushed-a-takeover-commit)
- [The newest lease is the highest generation, whatever its age](#the-newest-lease-is-the-highest-generation-whatever-its-age)
- [Two runners resume one handed-off claim, and the first lease create wins](#two-runners-resume-one-handed-off-claim-and-the-first-lease-create-wins)
- [A live lease is not taken](#a-live-lease-is-not-taken)
- [A stale lease is replaced by the next generation](#a-stale-lease-is-replaced-by-the-next-generation)
- [A stale holder's push is rejected after a takeover](#a-stale-holders-push-is-rejected-after-a-takeover)

### Rule 15.8

- [The old holder's push is rejected once the new holder pushed a takeover commit](#the-old-holders-push-is-rejected-once-the-new-holder-pushed-a-takeover-commit)
- [A stale holder's push is rejected after a takeover](#a-stale-holders-push-is-rejected-after-a-takeover)

### Rule 15.9

- [The old holder's push is rejected once the new holder pushed a takeover commit](#the-old-holders-push-is-rejected-once-the-new-holder-pushed-a-takeover-commit)
- [A stale holder's push is rejected after a takeover](#a-stale-holders-push-is-rejected-after-a-takeover)

### Rule 15.10

- [A claim does not tick when the approved task text changed after its lease](#a-claim-does-not-tick-when-the-approved-task-text-changed-after-its-lease)
- [A claim lands when the approved task text is the text its lease recorded](#a-claim-lands-when-the-approved-task-text-is-the-text-its-lease-recorded)
- [An approved task text changes during a claim](#an-approved-task-text-changes-during-a-claim)
- [An approved task text changes during a claim: another task's text changes](#an-approved-task-text-changes-during-a-claim-another-tasks-text-changes)

### Rule 16.1

- [A base that moved is merged into the claim branch before the checks](#a-base-that-moved-is-merged-into-the-claim-branch-before-the-checks)
- [Direct landing fast-forwards the base and deletes the claim branch](#direct-landing-fast-forwards-the-base-and-deletes-the-claim-branch)
- [Landed work with no tick is ticked on the specs branch, then the claim branch goes](#landed-work-with-no-tick-is-ticked-on-the-specs-branch-then-the-claim-branch-goes)

### Rule 16.2

- [A linked spec held by its parent's integration branch is ticked there](#a-linked-spec-held-by-its-parents-integration-branch-is-ticked-there)
- [A linked spec its parent's integration branch does not hold is ticked on the specs branch](#a-linked-spec-its-parents-integration-branch-does-not-hold-is-ticked-on-the-specs-branch)
- [Direct landing fast-forwards the base and deletes the claim branch](#direct-landing-fast-forwards-the-base-and-deletes-the-claim-branch)
- [Landed work with no tick on an integration branch is ticked there](#landed-work-with-no-tick-on-an-integration-branch-is-ticked-there)
- [A merged pull request whose branch GitHub deleted is landed work awaiting its tick](#a-merged-pull-request-whose-branch-github-deleted-is-landed-work-awaiting-its-tick)
- [Landed work with no tick is ticked on the specs branch, then the claim branch goes](#landed-work-with-no-tick-is-ticked-on-the-specs-branch-then-the-claim-branch-goes)
- [Landing on an integration branch is interrupted before the tick](#landing-on-an-integration-branch-is-interrupted-before-the-tick)
- [A pull request merges and GitHub deletes its branch before the tick](#a-pull-request-merges-and-github-deletes-its-branch-before-the-tick)
- [An approved task text changes during a claim](#an-approved-task-text-changes-during-a-claim)
- [An approved task text changes during a claim: another task's text changes](#an-approved-task-text-changes-during-a-claim-another-tasks-text-changes)

### Rule 16.3

- [A merge of an auto pull request is guarded by the checked head, and a moved base is merged in first](#a-merge-of-an-auto-pull-request-is-guarded-by-the-checked-head-and-a-moved-base-is-merged-in-first)
- [A base that moved is merged into the claim branch before the checks](#a-base-that-moved-is-merged-into-the-claim-branch-before-the-checks)
- [Failing checks land nothing](#failing-checks-land-nothing)

### Rule 16.5

- [A fresh claim after a restart holds no landed work](#a-fresh-claim-after-a-restart-holds-no-landed-work-1)
- [Landed work with no tick on an integration branch is ticked there](#landed-work-with-no-tick-on-an-integration-branch-is-ticked-there)
- [A merged pull request whose branch GitHub deleted is landed work awaiting its tick](#a-merged-pull-request-whose-branch-github-deleted-is-landed-work-awaiting-its-tick)
- [Landed work with no tick is ticked on the specs branch, then the claim branch goes](#landed-work-with-no-tick-is-ticked-on-the-specs-branch-then-the-claim-branch-goes)
- [A fresh claim after a restart holds no landed work](#a-fresh-claim-after-a-restart-holds-no-landed-work)
- [Landing on an integration branch is interrupted before the tick](#landing-on-an-integration-branch-is-interrupted-before-the-tick)
- [A pull request merges and GitHub deletes its branch before the tick](#a-pull-request-merges-and-github-deletes-its-branch-before-the-tick)

### Rule 17.1

- [Direct landing fast-forwards the base and deletes the claim branch](#direct-landing-fast-forwards-the-base-and-deletes-the-claim-branch)

### Rule 17.2

- [A draft pull request is opened and never merged by the runner](#a-draft-pull-request-is-opened-and-never-merged-by-the-runner)

### Rule 17.3

- [A ready pull request is opened and left to a person](#a-ready-pull-request-is-opened-and-left-to-a-person)
- [A pull request merges and GitHub deletes its branch before the tick](#a-pull-request-merges-and-github-deletes-its-branch-before-the-tick)

### Rule 17.4

- [An auto pull request is merged by the runner once checks pass](#an-auto-pull-request-is-merged-by-the-runner-once-checks-pass)
- [A merge of an auto pull request is guarded by the checked head, and a moved base is merged in first](#a-merge-of-an-auto-pull-request-is-guarded-by-the-checked-head-and-a-moved-base-is-merged-in-first)

### Rule 17.5

- [With landing off the runner pushes the claim branch only](#with-landing-off-the-runner-pushes-the-claim-branch-only)

### Rule 17.6

- [A pull request merges and GitHub deletes its branch before the tick](#a-pull-request-merges-and-github-deletes-its-branch-before-the-tick)

### Rule 18.1

- [Landed work with no tick on an integration branch is ticked there](#landed-work-with-no-tick-on-an-integration-branch-is-ticked-there)
- [A manual task on an integration branch is ticked on that branch](#a-manual-task-on-an-integration-branch-is-ticked-on-that-branch)
- [A manual task is ticked on the specs branch when the base is the default branch](#a-manual-task-is-ticked-on-the-specs-branch-when-the-base-is-the-default-branch)
- [Landing on an integration branch is interrupted before the tick](#landing-on-an-integration-branch-is-interrupted-before-the-tick)
- [A spec in one file keeps its tasks under ## Tasks](#a-spec-in-one-file-keeps-its-tasks-under--tasks)

### Rule 20.1

- [A push to the base needs passing checks on that exact head](#a-push-to-the-base-needs-passing-checks-on-that-exact-head)

### Rule 20.2

- [A draft pull request is never merged, marked ready or auto-merged](#a-draft-pull-request-is-never-merged-marked-ready-or-auto-merged)

### Rule 20.3

- [A label a non-writer added is not acted on](#a-label-a-non-writer-added-is-not-acted-on)

### Rule 20.4

- [A force push and a rebase of a shared branch are refused](#a-force-push-and-a-rebase-of-a-shared-branch-are-refused)

### Rule 20.5

- [A runner deletes only its own claim branch, with the task's leases](#a-runner-deletes-only-its-own-claim-branch-with-the-tasks-leases)

### Rule 20.6

- [A runner grants no approval](#a-runner-grants-no-approval)

### Rule 20.7

- [A spec assigned to another login is not run](#a-spec-assigned-to-another-login-is-not-run)

### Rule 20.8

- [Text from an issue, comment or commit is not an instruction](#text-from-an-issue-comment-or-commit-is-not-an-instruction)

### Rule 20.9

- [Only the repository's own checks run](#only-the-repositorys-own-checks-run)

### Rule 20.10

- [A public repository gets no private name, path or host](#a-public-repository-gets-no-private-name-path-or-host)
