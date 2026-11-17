# Activity nav filters styled like the Specs nav (2026-11-16)

The Activity filters in the left nav now use the Specs nav's rows and chips
(`NavRail.tsx`, from PR #361) instead of three dropdowns: SOURCE rows (All,
then each source with its count; the active row filled, Clear in the header
while a filter is on), KINDS and WHO chips with a count and a search icon, and
KEEP ACTIVITY as one row (days field, "days", Save) under its own header.
Every choice is a button with `aria-pressed`. Counts come from
`activity.list`'s new `counts` field, over the whole log.

- `before/`: `origin/main` at d6aa744b, with the same harness rows.
- `after/`: this branch. `activity-*` is the open Activity pill;
  `activity-rail-*` is the same pill scrolled to its end with GitHub and the
  settings kind picked; `activity-page-390-*` is the phone page with the menu
  closed.
- `specs-vs-activity-1280-dark.png`: the Specs nav beside the Activity nav,
  1280 dark.

Shots use Kiro Crew's own stylesheets (`main-*.css`, `App-*.css` and
`src-*.css` joined) and the app's real shell and left nav in the browser
harness (`?page=app`). To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/nav-shots.mjs <out>
    node kirocrew-app/ui/test/browser/side-by-side.mjs <out.png> <specs.png> "Specs nav" <activity.png> "Activity nav"
