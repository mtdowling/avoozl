# Proof rc-p6 on a fake GitHub: a crew on avoozl-crew verifies and builds

Run on fake GitHub; live run pending owner. Test:
`src/app/test/proof-rc-p6.test.mjs`. Spec: `.kiro/specs/radar-coder/`, task
`rc-p6`, requirement RC6, design D8 and D17.

## Setup

- No real GitHub, no real issues, no Kiro Crew. A fake `gh` (a script first on
  `PATH`, skipped on Windows) and an injected reader answer for one repository
  (`octo-org/octo-code`).
- Issue 7 carries a marker whose approver has write access. Issue 8 carries a
  marker whose approver has read access only. Both authors are admins. The
  approved spec files and the commit are served by the fake.
- The shipped agent file `kirocrew-app/agents/avoozl-crew.json` and the shipped
  agent folder are read from the repository.

## Action

1. Read the shipped agent: it holds `plans_verify_issue` and its prompt says to
   verify first and skip with scope `needs-decision` otherwise.
2. Do what that prompt says for each issue: call `plans_verify_issue` (through
   the real MCP handler with the fake `gh`, and through `verifyIssue` directly),
   build when every check is ok, else skip and name the failed check.
3. Run Set up's agent check on the installed agent file names, on a crew list
   with one crew on `avoozl-crew` and one on another agent, and on a fake Radar
   Agent list with and without the agent.

## Observation

| Step | Result |
| --- | --- |
| Issue 7 | all checks ok; brief holds task ID `d-1.1` and its acceptance line |
| Issue 8 | the `approver` check fails; no brief; skip with `needs-decision` naming `approver` |
| Set up, installed files | agent `present` |
| Set up, crews | the `avoozl-crew` crew is covered; the other is not, with the note that changing an agent is unreliable |
| Set up, fake Radar list without the agent | not ok |

## Verdict

Pass on the fake. The crew is a script that follows the agent prompt, so this
shows the tool, the checks and Set up are right. It does not show that a real
crew calls the tool.

## Live run for the owner (not done)

1. Run `npm run build:kirocrew-app` in the Avoozl checkout and install
   `kirocrew-app` in Kiro Crew.
2. In Issue Radar, create a crew with agent `avoozl-crew` on a scratch
   repository. Create a new crew; changing the agent of an old one is unreliable.
3. In the scratch repository, make one issue that came from an approved spec
   (marker, approver with write access) and one with a marker whose approver
   has no write access.
4. Let the crew run on both.
5. Expect: the crew calls `plans_verify_issue` on both, builds the first, skips
   the second naming the failed check, and Set up shows the agent present.
6. If the crew ran on the default agent, the proof fails; fall back to the
   prompt-only path.
7. Record the result in `docs/evidence/` and tick `rc-p6`.
