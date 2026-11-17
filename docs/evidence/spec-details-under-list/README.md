# Spec view: details under the specs list (2026-11-17)

The spec's details panel (Epic, Category, Repositories, Phases, Progress,
Dates, Open decisions) moved from under the spec text to the bottom of the
specs list column. The list column splits: the specs list on top, the
panel below. The spec column gets its full height back. Panel contents are
unchanged.

The panel's top bar is the divider between the list and the panel
(`role="separator"`, `row-resize` cursor): drag it, or focus it and press
Up or Down (16 px); double-click resets to 240 px. The height is 96 to
720 px and never leaves the list under 160 px. The chevron in the bar
hides the panel, and the list fills the column. Height and hidden are kept
in this browser (`localStorage` keys `avoozl:spec-panel-height` and
`avoozl:spec-panel-hidden`, the same as before).

A phone shows the list or the spec, not both, so there the panel still
stacks under the spec, with the same chevron and no divider.

- `before/`: the panel under the spec text (PR #441), 1280 px shown,
  dragged 200 px taller and hidden, and 390 px shown and hidden, light and
  dark.
- `after/`: the same shots with the panel under the specs list.

Shots use Kiro Crew's own stylesheet
(`src/kiro_crew/static/dist/assets/src-*.css`) and the full app in demo mode
in the browser harness. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/spec-details-shots.mjs <out>
