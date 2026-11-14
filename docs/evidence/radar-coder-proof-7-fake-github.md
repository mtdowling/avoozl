# Proof rc-p7 on a fake GitHub: Set up end to end

Run on fake GitHub; live run pending owner. Test:
`src/app/test/proof-rc-p7.test.mjs`. Spec: `.kiro/specs/radar-coder/`, task
`rc-p7`, requirement RC7, design D9 and D17.

## Setup

- A temporary workspace with one registered repository (`o/sdk`, single-repo
  mode, `coder: issue-radar`, required check `build`) and nothing else
  configured. A stateful fake GitHub answers the Set up steps. A fake Radar
  answers the crew read; it starts with no crews.
- The pack is the shipped `examples/sdk-team`.

## Action

1. Install the pack, preview it, import it with the preview hash.
2. Run Set up: preview every step, then confirm each step that has a change.
3. Open the values screen. Enter the shown values into the fake Radar by hand
   (crew name, label scope, needs-human label). Re-read.

## Observation

| Step | Result |
| --- | --- |
| Pack preview | the policy file is unchanged |
| Pack import | `radar.crew.count` is 2, plan label `to plan`; nothing written to GitHub |
| Set up preview | labels, branch rule, auto-merge, review-rules pull request show `change`; Project shows `ok`; nothing written |
| Each confirm | `done`, read back; labels `to plan`, `ready`, `merge conflict`; auto-merge on; required check `build`; the pull request opened against `main` |
| Set up again | every step `ok` |
| Values, Radar with no crew | model `model-a`, scope `ready`; crew name and scope not ticked |
| Values, after the owner enters them | repository, crew name, scope and needs-human label tick |
| Values, the rest | agent, model, claim limit and Additional prompt stay `cannot-verify` |

## Verdict

Pass on the fake for the steps and the pack. One gap in the wired re-read:
through `radar.values`, Radar's crew read keeps only each crew's id, name and
labels and the repository's needs-human label (`crewsOf` in
`src/app/radar-handoff.mjs`). So four of the eight values can never tick on
that path, even when the owner typed them right. The pure function
`radarReread` ticks all eight when given a richer read
(`src/app/test/radar-values.test.mjs`). The proof's Expected line ("Set up
ticks each item after the re-read") is therefore not met by the wired path.
Nothing is wrong with a shown value. Decide: have `crewsOf` keep agent, model,
claim limit and prompt if Radar returns them, or show Radar's own field names.

## Live run for the owner (not done)

1. Make a scratch repository with nothing configured. Turn Radar on and approve
   the grant.
2. Register the repository in Avoozl with the Radar coder.
3. Apply the `sdk-team` pack from `examples/sdk-team`. Read the preview, then
   confirm.
4. Open Set up. Confirm labels, branch rule, auto-merge and the review-rules
   pull request one at a time.
5. On the values screen, copy each value into Issue Radar by hand.
6. Press re-read.
7. Expect each item to tick. If an item stays unverified or differs, write down
   which one and whether Radar returned the field.
8. Record the result in `docs/evidence/` and tick `rc-p7`.
