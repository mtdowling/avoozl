# Does an Issue Radar crew punt a plain feature request from the owner?

Observed 2026-11-14 on Avoozl `main` (e7a14a5) and Kiro Crew 0.12.2.3. Live
GitHub on the scratch repository `mtdowling/avoozl-radar-test`. The crew was
Draco (`c_022aea7f`) on the owner's Mac: label scope empty, unattended on,
needs-human label `plan me`, and the Additional prompt that holds the Avoozl
marker provenance rule. That rule only covers issues with an
`<!-- avoozl v=1 ... -->` marker, so these issues got Radar's normal rules.

## Short answers

1. **Yes, it punts.** Draco skipped both issues before claiming them. It wrote
   no claim label, no branch and no PR.
2. **Label:** `plan me` (the needs-human label), and nothing else.
3. **Scope:** the big plugin request got `needs-design`. The small `--lang`
   request got `new-feature`. Both are in Avoozl's Intake scopes, and Avoozl's
   own parser reads them from the live comments.
4. **The planning path is clear.** Nothing Draco wrote blocks Avoozl from
   planning the issue, or the issue from becoming the parent of sub-issues
   (RC1.6). The `plan me` label stays until a person clears it (RC1.7). One
   gap is in the test setup, not the hand-off: see "What would get in the way".

## The test

Twelve leftover open issues were closed first (reason "not planned", with a
comment) so Draco saw only the two new ones. Closed scratch PRs were not
touched. Both issues were filed by the owner's `gh` login with no spec link,
no marker, no acceptance criteria and no decision record.

| Issue | Title                                            | Size                                                              |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------- |
| #38   | Add plugin system for custom greeting formatters | four paragraphs: registry, npm loading, chaining, fallback, reuse |
| #39   | Add --lang flag supporting 3 languages           | two short paragraphs: a CLI with `es` and `fr`                    |

Draco was paused when the issues were filed. The owner resumed it, and it
reached both issues on its next turn.

| Event                     | Time (UTC)  |
| ------------------------- | ----------- |
| #38 and #39 filed         | 15:58:01    |
| Draco still paused (poll) | 15:58:18    |
| Draco resumed (poll)      | by 16:00:19 |
| #38 skip comment          | 16:02:05    |
| #38 `plan me` added       | 16:02:07    |
| #39 skip comment          | 16:02:08    |
| #39 `plan me` added       | 16:02:09    |

Time to first touch: about 4 minutes after filing, and under 2 minutes after
the resume. The two skips landed about 3 seconds apart.

## What Draco wrote

Each issue got one comment and one label. The comment and the label are both
written by the owner's login, because the crew runs as that `gh` user.

| Issue | Phase     | Skip scope     | Labels added | Claim label | PR or branch |
| ----- | --------- | -------------- | ------------ | ----------- | ------------ |
| #38   | `skipped` | `needs-design` | `plan me`    | never       | none         |
| #39   | `skipped` | `new-feature`  | `plan me`    | never       | none         |

The hidden marker on both:

```
<!-- kirocrew-crew v=1 id=c_022aea7f phase=skipped pr= updated=2026-11-14T16:05:00Z -->
```

The marker has no scope. The scope is on the comment's second visible line,
as found earlier in `radar-handoff-and-crew-list.md`. The `updated` time is
16:05, three minutes after GitHub's `created_at` of 16:02:05. The crew writes
its own clock value, rounded and here ahead of real time, so Avoozl should
keep using GitHub's timestamps.

### #38, plugin system

```
👻 **Draco** · Kiro Crew Issue Radar
skipped · needs-design · updated 16:05 UTC

**Not built: this needs a design first.** `greet` in `src/greeter.js` is one
function with a fixed word table. This issue asks for a new extension layer: a
formatter registry, runtime registration and listing, npm discovery by name
(`greeter-formatter-*`), chaining, error fallback with warnings, and later a
registry shared with farewells. No spec in `.kiro/specs/` or entry in
`docs/decisions/` covers it, and the issue says the API is open.

**Decisions for a person:**
1. Is a plugin layer wanted at all, or is the `lang` word table enough?
2. The shape of the API: how formatters register, how one is chosen, and how
   chaining works.
3. Whether to load npm packages by name. That runs third-party code, so it is
   a security choice.
4. Whether the registry is greeting-only or shared.

My recommendation: write a short spec (requirements, design, tasks) and a
decision record. Then split it into tasks, with npm loading as its own task.
Crews can build those.
```

### #39, `--lang` flag

```
👻 **Draco** · Kiro Crew Issue Radar
skipped · new-feature · updated 16:05 UTC

**Not built: this is a new feature with no approved spec.** The repo has no
command-line entry point today. `package.json` has no `bin`, and nothing reads
`process.argv`. The `lang` option it would wrap already exists:
`greet("Bob", { lang: "es" })` returns `"Hola, Bob!"`. But the greeter spec
(T1 to T10) has no CLI task, and `docs/decisions/0001-greeter.md` does not
accept one.

**Decisions for a person:**
1. The command name (`greeter`?) and whether it ships as a `bin` in
   `package.json`.
2. Behavior with no name, an empty name (`greet` throws `TypeError`), or an
   unknown `--lang`: an error and exit code, or the English fallback.
3. Whether `--shout` and the other languages (`de`, `it`, `pt`, `ja`) are
   exposed too. The issue lists only three.

My recommendation: add one CLI task and its requirements to the greeter spec,
with a decision amendment. It is small after that, and a crew can build it.
```

## Where the line is

The small issue was punted too. The underlying code (`lang`) already existed,
and the change was a thin CLI wrapper, but Draco still called it a new feature
because no spec or decision accepted a CLI. In this repository the line is
"is it in an approved spec or decision record", not the size of the change.
The repository has `.kiro/specs/` and `docs/decisions/`, and the crew's brief
tells it to check both. A repository without them may draw the line elsewhere;
that was not tested.

The scope tracked the size. The big issue, with open API questions and a
security choice, got `needs-design`. The small one, with a clear shape and
only naming and error choices left, got `new-feature`. Both went past the
scope gate before any claim, as the brief asks ("decide all of this before you
claim").

## Would Avoozl's planning path pick it up?

Checked against Avoozl's code on `main` with the two live comment bodies, as
reads only:

- `latestSkip()` in `src/app/radar-claims.mjs` returns crew `c_022aea7f`,
  name Draco, and scope `needs-design` for #38 and `new-feature` for #39.
- `routeOf()` in `src/app/radar-plan-me.mjs` sends a trusted issue with either
  scope to Intake (RC1.5). The author is the owner, so both are trusted.
- From Intake, or when the owner adds the planning label (`to plan` by
  default, RC1.2), Avoozl plans the issue. In single-repo mode the source
  issue becomes the parent of the projected sub-issues (RC1.6,
  `src/app/radar-source.mjs`).

What Draco left on the issue, and whether it matters:

| Left on the issue      | Gets in the way? | Why                                                                                                      |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| no `crew: in progress` | no               | The parent is free, so RC19 can post Avoozl's own claim at approval without meeting a crew claim.        |
| `plan me`              | no               | Avoozl reads it for routing and never writes it (RC1.4). A person clears it; Needs you says so (RC1.7).  |
| skip in Radar's index  | no, it helps     | The skip is fleet-wide, so no crew takes the parent later. Sub-issues get new numbers and are not in it. |
| skip comment           | no, it helps     | Its decision list is a good seed for the planner chat's requirements.                                    |

## What would get in the way

- **The crew's label scope.** Draco's scope is empty, so it sees every open
  issue. Sub-issues projected under #38 would be visible to it the moment they
  are created, before Avoozl releases them with the ready label in graph order
  (RC4). RC1.6 and RC7 already cover this: the Set up screen requires the
  crew's scope to be the ready label. This test crew was set up by hand and
  does not meet that rule. Fix the crew, not the hand-off.
- **Plans-repo mode.** `planSource()` returns null outside single-repo mode,
  so the source issue is not the parent there (shortcut until rc-2.1). This
  scratch repository was not tested in that mode.

Not checked: running Avoozl's planner on #38 or #39 end to end, and how a crew
treats an issue from an untrusted author with the same text.
