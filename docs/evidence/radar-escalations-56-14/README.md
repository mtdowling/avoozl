# Issue Radar escalations open first in intake (task 56.14)

Screenshots of the full app shell on fake data (harness
`?page=app&escalations=before|after`), at 390 and 1280 px, light and dark,
with Kiro Crew's own stylesheet.

- `before-*`: the same issues as main's backend sends them. The escalation
  #41 sorts by age under a newer issue and has Plan this only; the crew's
  Needs you row #38 has no buttons.
- `after-*`: #41 lists first, marked "Radar asked", with Plan this and
  Deliver this. The Needs you row #38 offers the same two buttons. Each asks
  first and says Avoozl adds crew:avoozl and keeps the needs-human label.

`*-intake-*` is Needs you › Planning and intake; `*-needs-you-*` is Needs
you › Decisions and conflicts with the crew row open.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/escalation-shots.mjs docs/evidence/radar-escalations-56-14
