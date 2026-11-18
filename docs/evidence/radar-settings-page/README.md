# Settings › Issue Radar holds every Radar setting

Follow-up to PR #489. These shots were taken in the full app shell on fake data
(`?page=app&roles=plans|single&ghfull=1`), at desktop 1280 px and phone 375 px,
in light and dark, with Kiro Crew's own stylesheet.

- `radar-single-*`, `radar-plans-*`: the Issue Radar page. It has a
  repository picker, then one bordered section per group, each with a
  one-line explanation: Radar crew (crew scope and release mode), Set up
  Issue Radar, Handoff to Avoozl, Labels Radar uses, Crew review rules,
  Crew pull-request conflicts, and How crew pull requests land. One Save bar
  writes `.avoozl.json`.
- `github-*`: Settings › GitHub, with no Issue Radar part left on it.

The repository editor no longer has the Crews and rules tab, the Issue
Radar labels or the release mode. Nothing that moved changed its behavior,
and the move adds no GitHub calls.

To make them again:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/github-sections-shots.mjs docs/evidence/radar-settings-page
