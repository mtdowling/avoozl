# Plan review in progress: Kiro Crew's working box

Captured 2026-11-17 in a throwaway Kiro Crew 0.12.2.4 (own home, port
5697), with this branch's UI bundle installed, on spec `cache-reset-2`.
Approve was never pressed and nothing was written to GitHub.

## What changed

While a cross-model plan review round is `running`, both Approve dialogs
show a rounded purple box in place of the plain "Review running" line. It
copies Kiro Crew's own Projects banner ("Generating execution plan"): a 10%
tint, a 50% border, a band of the same tint sweeping across in 2 s
(ease-in-out), and an hourglass. The hue is the theme's `--aim`, which Kiro
Crew keeps purple for AI work in every theme. The box is `role="status"`,
`aria-live="polite"`, labeled "Reviewing with <model>…". Under
`prefers-reduced-motion` the box stays and the sweep stops.

## How the state was shown

The harness tick was paused. One review round with state `running`
(reviewer `gpt-5.6-sol`, the spec's current revision) was added to the
workspace database, the shots were taken, then the round was deleted, the
original bundle restored and the tick resumed. Kiro Crew's own banner was
shown by setting its Projects page resume flag (`tr-planning`), so no plan
was generated; those shots are cropped to the banner.

## Shots (`docs/evidence/review-loading/`)

| Shot | File |
|---|---|
| Desktop 1280, light | `avoozl-desktop-light.png` |
| Desktop 1280, dark | `avoozl-desktop-dark.png` |
| Phone 390, light | `avoozl-phone-light.png` |
| Phone 390, dark | `avoozl-phone-dark.png` |
| Desktop, reduced motion | `avoozl-desktop-light-reduced-motion.png` |
| Kiro Crew Projects banner, light | `kirocrew-projects-planning-light.png` |
| Kiro Crew Projects banner, dark | `kirocrew-projects-planning-dark.png` |

Read from the live page in every Avoozl shot: role `status`, aria-live
`polite`, label "Reviewing with gpt-5.6-sol…"; sweep `avoozl-review-sweep`
with motion allowed and `none` under reduced motion; `--aim` `#8041e6`
(light) and `#c19aff` (dark).
