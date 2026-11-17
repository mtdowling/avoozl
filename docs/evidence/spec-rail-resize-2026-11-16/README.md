# Spec view: resizable right rail (2026-11-16)

The spec details rail (Epic, Category, Repositories, Phases, Progress, Dates)
has a handle on its left edge. It reuses the nav and list columns'
`ResizeHandle`, now with `edge="left"`: drag left to widen, Left and Right
arrows step 16 px, double-click resets to 236 px. The handle is a focusable
`role="separator"` with `aria-valuenow`, `aria-valuemin` and `aria-valuemax`
and a `col-resize` cursor, and it draws a thin border at rest. The width is
kept in this browser (`localStorage` key `avoozl:spec-rail-width`).

Limits: 200 to 560 px, and never so wide the cards get narrower than 260 px
(the width they already wrapped at). When even a 200 px rail would squeeze
the cards, the handle is hidden and the rail wraps as before. On a phone the
rail stacks under the cards with no handle.

At 1280 px with the nav and the specs list at their default widths, the
detail column leaves room for only about 23 px of extra rail. These shots
narrow the specs list to its minimum first, so the rail can grow to about
380 px.

- `spec-1280-<theme>-default.png`: the rail at its default width.
- `spec-1280-<theme>-wider.png`: the rail dragged to its widest.
- `spec-390-<theme>.png`: the phone view, unchanged.

Shots use Kiro Crew's own stylesheet
(`src/kiro_crew/static/dist/assets/src-*.css`) and the full app in demo mode
in the browser harness. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/spec-rail-shots.mjs <out>
