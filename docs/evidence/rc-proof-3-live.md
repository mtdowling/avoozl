# Radar-coder Proof 3, live: a real crew verifies, and each bad issue is refused

Live run for task `rc-p3`. The fake-GitHub receipt is `rc-proof-3.md`.

- Recorded: 2026-11-15, Linux, a throwaway Kiro Crew gateway (`scripts/live-harness/harness.sh`, own home and port), Issue Radar's real crew on agent `avoozl-crew`, real GitHub (a private scratch repository).
- Verdict: **PASS for the good issue and four bad cases. Not ticked:** the author case needs a second account with read access, and the plans-repo repeat with a crew was not run.

## Setup

1. In the scratch repository, spec `config` (from Proof 2) was approved through its pull request and projected. Issue #8 (`config.1.7`) is a real projected issue.
2. Four bad copies of #8's body, each with one change, were made with `gh issue create`:

   | Issue | Change                                            |
   | ----- | ------------------------------------------------- |
   | #13   | `approved-by=octocat` (no write access)           |
   | #14   | `tasks=config.9.9` (not in the spec)              |
   | #15   | `commit=` a commit on an unmerged branch          |
   | #16   | `commit=` edited to the repository's first commit |

3. Because #8's task text ("Seventh works.") is too vague to build, a second spec `greet` with one concrete task ("add `hello.txt` holding `hello`") was approved and projected as #19.
4. All got the `ready` label.
5. One crew, made with the harness, with the one-line prompt Avoozl ships:

```
harness.sh connect-repo https://github.com/OWNER/REPO
harness.sh crew-create p3-crew
harness.sh crew-edit CREW_ID '{"labels":["ready"],"extra_prompt":"<CREW_PROMPT>","max_open":5,"auto_merge":false,"enabled":true,"unattended":true}'
```

`<CREW_PROMPT>` is the text of `CREW_PROMPT` in `src/app/radar-crew-prompt.mjs`.

## What happened

`avoozl verify-issue` by hand:

| Issue | Exit | Failed check                                      |
| ----- | ---- | ------------------------------------------------- |
| #8    | 0    | none                                              |
| #19   | 0    | none                                              |
| #13   | 1    | `approver`: octocat has no write permission       |
| #14   | 1    | `spec`: tasks.md does not list config.9.9         |
| #15   | 1    | `commit`: diverged, not behind the default branch |
| #16   | 1    | `spec`: the spec files are missing at that commit |

The crew, over three turns:

- It called `plans_verify_issue` on every marked issue before doing anything else.
- #13, #14, #15 and #16: skipped as `needs-decision`, each with a comment naming its failed check. It built none of them.
- #8: verify passed. The crew declined to build it because the task says only "Seventh works.", and said so in a comment. That is the crew judging the task text, not a verify failure.
- #19: verify passed. The crew claimed it, opened a pull request that adds `hello.txt`, and left it for a person to merge.

## Found on the way

- **Harness: the crew agent did not load.** With the agent home outside the harness home, the gateway registered none of Avoozl's 13 agents, and every crew turn failed with "The app agent 'avoozl-crew' isn't loaded yet". For this run the stub agent spec was removed before start. Main now keeps the agent home inside the harness home (#221), which fixes the same thing.
- **First turn after a restart.** The crew's first tool call waited for approval before the unattended grant arrived (40 seconds later) and was declined after 3 minutes. Issue Radar then held the loop as "approval stalled". Pausing and resuming the crew (`crew-edit ... '{"enabled":false}'`, then `'{"enabled":true,"unattended":true}'`) started it again. This is in Kiro Crew, not Avoozl.
- The crew's own `crew: needs human` label did not exist in the scratch repository; it skipped writing it and commented instead.

## Not run

- The author case: an issue opened by an account with read access only.
- The repeat with a plans repository and a crew. `verify-issue` on a plans-repo issue (Proof 2's run) did pass all five checks, reading the spec from the plans repo.
