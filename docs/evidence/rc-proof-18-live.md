# Radar-coder Proof 18, live: approve on the issue

Receipt for task `rc-p18`. The fake-GitHub run is `docs/evidence/rc-proof-18.md`.

- Recorded: 2026-11-15, Linux, Avoozl CLI from `main` at `30f9cbd` plus PR #220.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`, issues #2,
  #3 and #4, one plan each (`alpha`, `beta`, `gamma`, the shared test spec).
- Verdict: **PASS**, with one stand-in: the stranger is the same GitHub
  account taken out of the allowed actors (see below).

## Commands

```
avoozl project configure code --root <scratch checkout> --branch main --as-person
avoozl github configure mtdowling/avoozl-scratch-6 --project code --allowed-actors mtdowling --as-person
avoozl plan.create --json '{"spec":"alpha","context":{"projectId":"code","newPlan":{"source":{"repository":"mtdowling/avoozl-scratch-6","number":2}}}}' --as-person
# same for beta (#3) and gamma (#4)
gh issue edit 2 --add-label avoozl:plan-approved     # as mtdowling, allowed
avoozl workspace.tick --json '{"sessions":[]}' --as-person
avoozl plan.approve --json '{"id":"beta","expectedHash":"..."}' --revision N --as-person
# allowed actors set to another login, then:
gh issue edit 4 --add-label avoozl:plan-approved
avoozl workspace.tick --json '{"sessions":[]}' --as-person   # three times
```

## Observation

| Issue | Action | Result |
| --- | --- | --- |
| #2 alpha | label by an allowed person | approval PR #5 opened; after it merged, one approval record for `alpha`; no Avoozl approval comment on #2; label kept |
| #3 beta | approved in Avoozl | approval PR #6, then one record; #3 got `avoozl:plan-approved` and one comment `<!-- avoozl-approval v=1 approver=... spec=.kiro/specs/beta commit=9231d81... -->`, no spec text |
| #4 gamma | label by a login the policy does not allow | label removed; no record; one Needs you row "mtdowling added "avoozl:plan-approved" to mtdowling/avoozl-scratch-6#4 and was ignored" |

The label is on an issue exactly when a record exists, for all three.

## Found on the way (fixed in PR #220)

The first label tick failed silently: the approval pull request could not
write the spec files. GitHub answered `"sha" wasn't supplied` because
`putFile` sent no blob `sha` for a file that already exists. With the fix the
approval PR opened, and the run above is after it.

## Stand-in

Only one GitHub account was available. The stranger step used that account
with `allowedActors` set to a different login, so the trigger-label check
refused it. A second account with no write access was not tried.
