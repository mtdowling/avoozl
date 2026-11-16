# Flow CI and settings screenshots

Owner screenshot approval is pending. Task 54.5 remains unchecked and must not
merge before that approval (Requirement 100.7, design §4.30).

These are synthetic UI fixtures, not live proof evidence. No workspace, gateway,
GitHub repository, account, or agent session was contacted. The fixture uses
`example/recipe-box`, task and other CI minutes, a 55% wait share against a 40%
limit, and one workflow with repeats on two commits. Settings show an existing
read-only docs glob override.

Before images use application source from `eb6fbe904eb58b8cd05d15b0910cd6ebbbdc68e7`.
After images use the implementation in this change. Both use the same standalone
fixture and the installed Kiro Crew host stylesheet, at 390 × 900 and 1280 × 900
viewports in light and dark mode. Full images capture the entire application
content; desktop content is centered at a maximum width of 1080 pixels. Detail
images isolate the new controls. All variants passed horizontal overflow and
browser error checks. The new controls were visually inspected for legibility.

| Screen | Viewport and theme | Before | After | New controls |
| --- | --- | --- | --- | --- |
| Flow | Phone, light | [Before](before/flow-390-light.png) | [After](after/flow-390-light.png) | [CI card](after/flow-390-light-detail.png) |
| Flow | Phone, dark | [Before](before/flow-390-dark.png) | [After](after/flow-390-dark.png) | [CI card](after/flow-390-dark-detail.png) |
| Flow | Desktop, light | [Before](before/flow-1280-light.png) | [After](after/flow-1280-light.png) | [CI card](after/flow-1280-light-detail.png) |
| Flow | Desktop, dark | [Before](before/flow-1280-dark.png) | [After](after/flow-1280-dark.png) | [CI card](after/flow-1280-dark-detail.png) |
| Settings › Flow | Phone, light | [Before](before/settings-390-light.png) | [After](after/settings-390-light.png) | [CI settings](after/settings-390-light-detail.png) |
| Settings › Flow | Phone, dark | [Before](before/settings-390-dark.png) | [After](after/settings-390-dark.png) | [CI settings](after/settings-390-dark-detail.png) |
| Settings › Flow | Desktop, light | [Before](before/settings-1280-light.png) | [After](after/settings-1280-light.png) | [CI settings](after/settings-1280-light-detail.png) |
| Settings › Flow | Desktop, dark | [Before](before/settings-1280-dark.png) | [After](after/settings-1280-dark.png) | [CI settings](after/settings-1280-dark-detail.png) |

The fixture and capture script are
`kirocrew-app/ui/test/browser/ci-flow.tsx` and `ci-flow-captures.mjs`. To reproduce
after images, set `AVOOZL_CAPTURE_HOST_CSS` to an installed host stylesheet and run
`node kirocrew-app/ui/test/browser/ci-flow-captures.mjs OUTPUT_DIRECTORY`. Before
images were regenerated from an archive of the baseline source with those same
fixture and capture files. Temporary harnesses use their own headless browser
profile and are removed after capture.

Validation on the combined implementation and accounting/read-budget repairs:
1,975 backend tests passed; 795 UI tests passed, with two skips and no failures.
Type checking, the production build, formatting, and `git diff --check` passed.
The focused UI coverage includes numeric bounds, preserving read-only class
overrides on save, the empty state, minute units and pending CI comparisons,
and a delayed old-workspace settings response. The latter reproduced an old
workspace's form replacing the new workspace's values before the scoped-form
fix; it now verifies that only the new workspace's values are saved.

## Owner review — 2026-11-16

The owner approved the phone and desktop screenshot set in light and dark modes
for merge. This supersedes the pending review status recorded at capture.
