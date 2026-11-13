# Phase 9: served-model gate for review verdicts

Recorded 2026-11-12 on branch `model-gap` (from `kirocrew-native` e2b1663).
Code commits: abcb0c4 "Refuse review verdicts whose served model is
unproven" and bfa8f52 "Keep the last live model reading for closed sessions".

## Why

The live reviewer-model check (`phase9-live-reviewer-models.md`) found that
Kiro Crew runs a model it does not offer on `auto` with only a notice, and can
switch a pinned session's model mid-session. Avoozl saw only the model it asked
for, so a reviewer could run on `auto` or on the writer's model while Avoozl
recorded a distinct one (R36.3, R36.4, design §5.2).

## What changed

- `kirocrew-app/crons/tick.py` passes `model_requested`, `served_model`,
  `model_withheld` and `model_changed` from each `/api/chat/cron-sessions` row
  to `plans_tick`, only when the row has `served_model`.
- `workspace.tick` validates the fields and stores them on the binding as
  `served: {requested, model, withheld, changed}`. Only the tick writes it;
  `plans_session_status` cannot.
- `reconcileVerifications`: for a review role with `distinctFrom: model`, a
  verdict on the delivery's commit is refused when the reviewer's served model
  is null or `auto`, Kiro Crew withheld or changed its model, or it equals the
  writer's served model (else the writer's requested model). The writer side
  gets the same served check. A refused verdict is recorded with outcome
  `refused`, keeps no findings, spends no writer attempt, moves the delivery to
  `decision` and sends one decision notice. While a session that reports its
  model is `working` or `queued`, the verdict waits, because `served_model` is
  the newest completed turn's. Kiro Crew reports a closed or lost row's model
  fields as null and false, so for those rows the last live reading stands; a
  session never read live keeps the null and is refused.
- Delivery view: each session shows requested vs served model, or "served
  model not reported"; a round's verdict shows the served model and
  "refused".

## Default for an older Kiro Crew

A row with no `served_model` key leaves `served` unset. Avoozl then trusts the
requested model, as before, and the Delivery view says "served model not
reported". Delivery is not blocked.

## Cases (src/app/test/served-model-gate.test.mjs)

| Case | Result |
| --- | --- |
| reviewer served null | refused, decision |
| reviewer served auto | refused, decision |
| unoffered model (withheld, ran auto) | refused, decision |
| reviewer model changed mid-session | refused, decision |
| reviewer served = writer served | refused, decision |
| writer served null | refused, decision |
| writer changed to reviewer's model | refused, decision |
| writer reports none, reviewer = writer requested | refused, decision |
| refused changes-requested | no writer attempt spent, no finding |
| distinct served models | merged (integrated) |
| older Kiro Crew, no fields | merged; view says not reported |
| reviewer turn in flight | waits, then merges |
| bad field types | tick refuses |
| closed row with null fields after a live reading | last live reading kept |
| reviewer first seen closed, null fields | refused, decision |

Also: tick.py pass-through test (`kirocrew-app-package.test.mjs`) and UI label
test (`views-api.test.mjs`).

## Results

- `npm test`: 530 of 530 pass. UI tests 25 of 25. `tsc --noEmit` clean.
- `git diff --check` clean.

## Live check

Run 2026-11-12 20:18-20:33 UTC. Isolated Kiro Crew source gateway from
`<kiro-crew-checkout>` branch `cron-session-served-model`
a3bd3be3a, in the `$TMPDIR/kc-p9-live` profile (own HOME, KIROCREW_HOME,
KIRO_HOME, clean env, own loopback port, real kiro-cli sign-in from the staged
store). The real Kiro Crew was not touched. Before the run the profile was
cloned to `$TMPDIR/kc-p9-live-snapshot-before-model-gap`, and the P9
workspace and sample were moved to `workspace.p9` and `sample.p9`. The Avoozl
app was reinstalled from 953cc37. Its trust in this copy's config was put
back, because uninstalling dropped it.

Policy: writer `claude-sonnet-5.5`, one review role `conventions`. Spec `gap`:
leaf `gap.1.1`, then `gap.1.2`, which requires it.

| Leaf | Reviewer asked | Row from Kiro Crew | Result |
| --- | --- | --- | --- |
| gap.1.1 | claude-haiku-5.5 | served claude-haiku-5.5, withheld false, changed false | approved, integrated 6e25ee9 |
| gap.1.2 | not-a-real-model | served auto, withheld true, changed true | approved verdict refused; decision |

For `gap.1.2` the delivery cause is "verdict refused: review conventions:
Kiro Crew withheld the requested model not-a-real-model and ran auto". The
writer attempt stays `done`. One decision notice, "Avoozl refused review
conventions on gap.1.2", was queued with a session link. The sample's `main`
does not contain the `gap.1.2` commit 7c9fd6b. The writer rows read served
claude-sonnet-5.5. The checks rows read requested null, served auto, and have
no model rule. The Delivery view shows requested vs served for all six
sessions. The raw output is in `$TMPDIR/kc-p9-live/model-gap-evidence.txt`.

Setup notes: a first try with spec `models` failed at `open_session` with 403
`not_creator`. The new slot keys matched P9 slots that an older cron job had
created. Renaming the spec to `gap` fixed it. The reviewer model was changed in
`.avoozl.json` after `gap.1.1` merged and before the `gap.1.2` review opened.
The test gateway was stopped afterward, and no process holds its files.

## Not checked

- `checks` sessions have no model rule and are not gated.
- The pre-dispatch hold (`holdUnprovenReviews`) still uses requested models;
  served models are judged only at verdict time.
- After a refusal, `plans_retry_delivery` starts a new writer attempt, as for
  every decision.
- Live: no mid-session engine fallback was forced, and no reviewer was run on
  the writer's model (both covered by fakes only).
- Kiro Crew does not persist the fields. After a gateway restart, a restored
  slot reports null until its next turn, and Avoozl refuses on that null.
