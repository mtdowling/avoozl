# Review view with tabs, cards, filters and chat links (task 57.4)

Screenshots of the full app shell on fake findings (harness
`?page=app&specs=1&review=1`), at 390 and 1280 px, light and dark, with
Kiro Crew's own stylesheet.

- `before-*`: the byte-types spec page. Its Summary card has **Open review
  (4)**.
- `after-*`: the Review view. Round 1 links to its review chat; the planner
  chat is gone and reads "Chat closed". Requirements, Design and Tasks are
  tabs with finding counts. Severity and state chips show counts. Each card
  has its severity border and label (warn yellow, blocker red, info grey),
  category, file and lines, claim, evidence, the planner's response with a
  link to the fixing revision, and Accept, Reject, Defer and Resolve.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/review-view-shots.mjs docs/evidence/review-view-57-4
