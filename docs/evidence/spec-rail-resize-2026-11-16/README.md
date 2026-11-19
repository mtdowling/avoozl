# Spec view: resizable right rail (2026-11-16)

> Screenshots for this receipt were checked and are not kept in git.

The spec details rail (Epic, Category, Repositories, Phases, Progress, Dates)
has a handle on its left edge. It reuses the nav and list columns'
`ResizeHandle`, now with `edge="left"`: drag left to widen, Left and Right
arrows step 16 px, double-click resets to 236 px. The handle is a focusable
`role="separator"` with `aria-valuenow`, `aria-valuemin` and `aria-valuemax`
and a `col-resize` cursor, and it draws a thin border at rest. The width is
kept in this browser (`localStorage` key `avoozl:spec-rail-width`).

Limits: 200 to 560 px. When the rail is wider than fits beside the specs
list (cards at least 260 px), the list folds into a thin "Show the specs
list" bar, so the rail can use the list's room. At 1280 px with the nav and
list at their defaults the rail goes up to about 530 px, 290+ px past its
default. Dragging back narrower, double-clicking the handle, or clicking the
bar brings the list back. The list stays mounted while folded, so the
Specs filters in the nav keep working. On a phone the rail stacks under the
cards with no handle.

- `spec-1280-<theme>-default.png`: the rail at its default width, handle
  focused (the accent line).
- `spec-1280-<theme>-wider.png`: the rail dragged 240 px wider, handle
  focused; the specs list is folded into the bar on the left.
- `spec-390-<theme>.png`: the phone view, unchanged.

Shots use Kiro Crew's own stylesheet
(`src/kiro_crew/static/dist/assets/src-*.css`) and the full app in demo mode
in the browser harness. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/spec-rail-shots.mjs <out>
