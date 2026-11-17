# Specs nav filters styled like Radar's Issues nav (2026-11-16)

The Specs filters in the left nav are now rows and chips, as Issue Radar's
Issues nav draws them: a search box, SORT (Name, Last update, Tasks; the
active row filled with its direction arrow), FILTERS (status rows, then what a
spec has, kind, batch and Show archived, split by thin dividers) and EPICS
chips with a count and a search icon. CATEGORIES chips show when specs have
more than one category. No dropdowns: each choice is a button with
`aria-pressed`.

- `before/`: `origin/main` at 31bad07a.
- `after/`: this branch. `specs-*` is the open Specs pill; `specs-rail-*` is
  the same pill scrolled to its end with Last update and the Runtime core epic
  picked; `specs-page-390-*` is the phone page with the menu closed.
- `radar-vs-avoozl-1280-dark.png`: Radar's Issues nav (the owner's capture of
  the real app, 1280 dark, shown at half size) beside Avoozl's Specs nav at
  1280 dark.

Shots use Kiro Crew's own stylesheet
(`src/kiro_crew/static/dist/assets/src-*.css`) and the app's real left nav in
the browser harness. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/nav-shots.mjs <out>
