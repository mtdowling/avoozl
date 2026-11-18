# Shared tab bar in Kiro Crew's own full-width style

Kiro Crew's own tab bars, read from a throwaway Kiro Crew (read only):

- `kirocrew/kirocrew-task-runner-*`: Task Runner's Compose, From Spec, From
  YAML bar. This is Kiro Crew's full-width style: the bar spans its column,
  each tab takes an equal share (`flex: 1`), 13 px semibold labels, about
  34 px tall, rounded (`--radius-md`), the open tab filled with `--accent`
  and `--accent-fg` plus `--shadow-sm`, the others `--muted` with an
  `--bg-elevated` hover. No divider line. Under 640 px Kiro Crew stacks it.
- `kirocrew/kirocrew-knowledge-*` and `kirocrew/kirocrew-apps-*`: Kiro
  Crew's other bars for comparison: an underlined row that hugs its labels
  (Knowledge) and a small pill group (Apps). Neither fills the row.

Avoozl pages that use the shared bar (`kirocrew-app/ui/src/Tabs.tsx`), in the
full app shell on fake data with Kiro Crew's stylesheet, 1280 px and 390 px,
light and dark:

- `github-*`: Settings › GitHub.
- `spec-overview-*`: a spec's page.
- `review-*`: the spec page's Review view, with its inner file bar and the
  Contents and Comments bar.
- `task-tabs-details-*`: the task view.

`before/`: left-aligned tabs that hug their labels, with an underline on the
open tab and a divider line under the bar. `after/`: Kiro Crew's full-width
style. On a phone the tabs keep their label width and the bar scrolls
sideways, as before. The spec page's bar no longer has its own 12 px inset
on a phone, so it lines up with the spec title and body.

To make them again (on main for `before/`):

    cd kirocrew-app/ui
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> node test/browser/settings-tabs-shots.mjs <out> github
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> node test/browser/spec-tabs-shots.mjs <out>
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> node test/browser/review-view-shots.mjs <out>
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> node test/browser/task-view-tabs-shots.mjs <out>
