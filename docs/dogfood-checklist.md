# Dogfood checklist: Avoozl drives its own repository

Only you can do these steps. Do them in order. Each one says what to expect.
Nothing here is automatic: Avoozl creates no repository, issue or crew until
you press the button.

Live runs of the earlier proofs (p1 to p10, p18 to p26) and the dogfood run
(`docs/evidence/rc-proof-11-live.md`) changed this list. What changed is marked
**Changed** below. Each run used scratch repositories, never the real ones.

Setup values:

| Setting           | Value                                              |
| ----------------- | -------------------------------------------------- |
| Public repository | `mtdowling/avoozl`                                 |
| Private mirror    | `mtdowling/avoozl-mirror` (must be private)        |
| Public plans      | on `main`                                          |
| Private plans     | on the plans branch `avoozl-plans`                 |
| Forward mode      | `nudge`                                            |
| Forward target    | `each` (one public pull request per merged change) |
| Forward to        | `source`                                           |

## 1. Name the CI checks

**Changed:** do this step first, before step 2. Create setup saves the mirror
setting on the entry for `mtdowling/avoozl`. If that entry does not exist, the
setting lands on an entry named after the mirror, and sync then compares the
mirror with itself and shows a false "has diverged" row.

1. Open **Settings > Repository setup** and add or edit the entry for
   `mtdowling/avoozl`. Set **Allowed actors** to your GitHub login.
2. Set **Required checks** to `test (ubuntu-latest)`, `test (macos-latest)`
   and `test (windows-latest)`.
3. Save.

Expected: the dry run in step 2 shows a ticked `branch-rule` line instead of
the line that asks you to name a CI check.

## 2. Create setup (real)

1. In **Settings > Repository setup**, press **Add repository** (or **Edit**
   on the mirror's row).
2. Choose the role **Private mirror of a public repository**, and enter
   `mtdowling/avoozl` as **Public repository**. The mirror is
   `mtdowling/avoozl-mirror`.
3. Press **Create setup** in the dialog. It shows a dry run and writes
   nothing.
4. Check the lines against this list (before step 1 the `branch-rule` line asks
   for a check name and is not ticked):

   | Line         | What it will do                                                                                                                                                                     |
   | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | mirror       | Create the private repository `mtdowling/avoozl-mirror`                                                                                                                             |
   | seed         | Copy every branch and tag from `mtdowling/avoozl` once                                                                                                                              |
   | plans-branch | Create the orphan branch `avoozl-plans`                                                                                                                                             |
   | labels       | Create `avoozl:plan`, `avoozl:ready`, `avoozl:merge-conflict`, `avoozl:plan-approved`, `avoozl:review`, `avoozl:drafted`, `avoozl:waiting-on-tracker` (**Changed:** seven, not six) |
   | branch-rule  | Require the checks from step 1 on the default branch                                                                                                                                |
   | auto-merge   | Turn on "Allow auto-merge" in the mirror                                                                                                                                            |
   | setting      | Save the mirror setting                                                                                                                                                             |

5. Press **Apply N ticked lines**.

Expected: the result lists each line as done, then the mirror reads as
private. Run **Create setup** again: it shows 0 writes and says to use Adopt.
The real run in `docs/evidence/rc-proof-11-live.md` did exactly this on
2026-11-15 with the repository name given here. Create setup refuses an existing mirror that is public, and it
never deletes or overwrites anything.

If the seed step fails, the repository stays. Delete it in GitHub and run
Create setup again, or press **Adopt existing setup** to finish the rest.

## 3. Check the mirror setting

1. Open the **Private mirror** box in the repository's edit dialog.
2. Check: **Forward mode** is `nudge`, **Forward target** is `each`,
   **Private specs branch** (under Advanced) is `avoozl-plans`, **Forward to**
   is `source`.
3. Leave **Trusted persons** empty. Without a trusted person, `auto` is refused.

## 4. Create the Radar crew on the mirror

Open **Settings** and find **Set up Issue Radar** (it lists the repository
once it has a crew entry). Copy each value into Issue Radar. Avoozl writes
none of them. These are the values it shows for the mirror:

| Field                    | Value                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Repository to connect    | `mtdowling/avoozl-mirror`                                                                                      |
| Crew name                | `avoozl-avoozl-mirror` (any name works)                                                                        |
| Model                    | `auto` (pick the one you use)                                                                                  |
| Label scope              | `avoozl:ready`                                                                                                 |
| Needs-human label        | `crew: needs avoozl`                                                                                           |
| Claim time limit (hours) | `48`                                                                                                           |

Tick each item as you finish it. The crew's label scope must match the ready
label.

**Changed:** create the `crew: needs avoozl` label in the mirror first. A crew
does not create it; it comments instead (Proof 3). Enter the same name in
**Settings > Issue Radar > Escalation label**, so Avoozl reads the label the
crew writes.

Expected: one crew, on the mirror only. Do not connect a crew to
`mtdowling/avoozl`.

## 5. Approve the plan

1. Open the **Specs** page and the spec `avoozl-next`. It lives in the public
   repository on `main`, so it is a public plan.
2. Read it. Check that it names no private text.
3. Press **Approve revision** (it shows the revision hash).
4. Open the preview of what projecting would write. Check that every issue goes
   to `mtdowling/avoozl-mirror` and none to `mtdowling/avoozl`.
5. Project it.

**Changed:**

- Leave **Operator** as it is only if it already shows your GitHub login. The
  approval marker names the operator, and an approver that is not a GitHub
  login is refused (Proof 24). There is no field for it in the app.
  If the approval comment shows your computer's user name, stop and tell the
  agent.
- A public spec names no private task in its manifest or branch names. Proof 24
  found that a private spec's bare name and task ID can still reach a forward.
  Keep the first plan public-only.
- Merge the source's `main` into the mirror before the first crew task is
  checked. An approval merged on the source does not reach the mirror by
  itself (Proof 24).

Expected: issues appear in the mirror with `avoozl:plan` and the first ready
ones carry `avoozl:ready`. The crew takes only issues with that label.

## 6. Turn on forwarding

Forward mode `nudge` is already set in step 3. It forwards nothing by itself.
When a crew's pull request merges in the mirror, Avoozl shows a "to forward"
row. You press **Forward**, which pushes one squashed commit under your name
and opens one public pull request. A scan runs before the push and blocks it
with one row if it finds private text.

The Forward screen (exact diff, title, body) comes with pull request 191. Do
this step after it merges.

1. Wait for the first crew pull request to merge in the mirror.
2. Open the row and press **Forward**. Read the exact public diff, title and
   body first.
3. Merge the public pull request after its checks pass.

Expected: the task counts done when the public pull request merges, not when
the mirror one does.

**Changed:**

- After the first merge in the mirror, **Waiting on you** shows two rows: the
  forward row and "The mirror ... has diverged". Both are expected. The mirror
  has a commit the source does not have yet, and Avoozl never resets or
  force pushes. Do not "fix" the diverged row by hand (Proof 11, Proof 23).
- Nudge mode already ran the scan when the row appeared. The row says "scan
  clean, ready for the public repository". Nothing was pushed.
- If the forward is blocked, the row stays with the reason. Proof 25 showed the
  Forward button can look enabled on a blocked row; read the reason first.

Do not set Forward mode to `auto` yet. It needs a trusted person in step 3 and
a few clean forwards by hand.

## Undo

- Step 2: delete `mtdowling/avoozl-mirror` in GitHub. The public repository was
  never written to.
- Step 4: delete the crew in Issue Radar.
- Step 5: close the projected issues in the mirror. Avoozl does not delete
  them.
