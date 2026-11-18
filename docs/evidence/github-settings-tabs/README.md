# Settings › GitHub tabs and the shared field row

Shots in the full app shell on fake data (`?page=app&roles=single&ghfull=1`),
desktop 1280 px and phone 390 px, light and dark, with Kiro Crew's own
stylesheet.

- `before/github-*`: five bordered sections stacked on one long page. Narrow
  number fields squeeze their label and help into 9rem, the raw key
  `subIssues.maxPerParent` breaks mid-word, Project fields shows empty
  "Field names" and "Status options" headings, and the includeDone checkbox
  puts its key inline in the label.
- `after/github-*`: one full-width tab bar (New tasks, Sync pace, Project,
  Set up GitHub, GitHub calls), the open tab in the address (`?github=sync`).
  The width limits only the control, keys break after a dot, empty groups are
  hidden, and the checkbox uses the shared check row. `after/github-sync-*`
  is the Sync pace tab.
- `before/radar-*` and `after/radar-*`: Settings › Issue Radar. The Handoff to
  Avoozl labels used their own row (key beside the label, help above the
  input); after, they use the shared field row like every other field: label,
  control, help, default, key.

To make them again:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/settings-tabs-shots.mjs <out dir> github github-sync radar
