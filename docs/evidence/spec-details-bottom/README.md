# Spec view: details in a bottom panel (2026-11-17)

> Screenshots for this receipt were checked and are not kept in git.

The spec's details (Epic, Category, Repositories, Phases, Progress, Dates,
Open decisions, Outline, Activity) moved from the right-hand column into a
panel under the spec, like an IDE's bottom panel. The sections sit in a
grid that fits the width; the fields inside are unchanged.

On a desktop the spec above shrinks so both fit on screen. The panel's top
bar is a horizontal divider (`role="separator"`, `row-resize` cursor):
drag it, or focus it and press Up or Down (16 px), to change the height;
double-click resets to 240 px. The height is 96 to 720 px and never leaves
the spec under 160 px. The chevron in the bar hides the panel (the spec
takes the full height) and shows it again. Height and hidden are kept in
this browser (`localStorage` keys `avoozl:spec-panel-height` and
`avoozl:spec-panel-hidden`). On a phone the panel stacks under the spec,
with the same chevron and no divider.

The resizable right rail from #370 is removed, with its folding of the
specs list. The Review view still folds the list.

- `before/`: the right rail at 1280 px (default and dragged wider) and the
  phone at 390 px, light and dark.
- `after/spec-1280-<theme>-shown.png`: the panel at its default height.
- `after/spec-1280-<theme>-resized.png`: the bar dragged 200 px up (the
  pointer is still on the bar, so its accent line shows).
- `after/spec-1280-<theme>-hidden.png`: hidden; the spec fills the column.
- `after/spec-390-<theme>-shown.png` and `-hidden.png`: the phone.

Shots use Kiro Crew's own stylesheet
(`src/kiro_crew/static/dist/assets/src-*.css`) and the full app in demo mode
in the browser harness. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/spec-details-shots.mjs <out>
