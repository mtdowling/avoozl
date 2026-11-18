# Settings › GitHub sections and Settings › Issue Radar

Follow-up to PR #475. Shots in the full app shell on fake data
(`?page=app&roles=plans|single&ghfull=1`), desktop 1280 px and phone 375 px,
light and dark, with Kiro Crew's own stylesheet.

- `before/github-*`: one GitHub settings card with every field loose inside,
  the Issue Radar crews and Set up Issue Radar boxes inside it, and the GitHub
  calls lines and table loose below it.
- `after/github-*`: one bordered section per group: New tasks and issues,
  Sync pace, Project fields, Set up GitHub and GitHub calls. GitHub calls is a
  real table; each header sorts both ways (click or Enter/Space, `aria-sort`),
  most calls first, numbers right-aligned.
- `after/radar-single-*`: the new Settings › Issue Radar page with the crews
  and Set up Issue Radar, each in its own bordered section. Nothing moved
  writes anything; no new GitHub calls.

To make them again:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/github-sections-shots.mjs docs/evidence/github-settings-sections/after
