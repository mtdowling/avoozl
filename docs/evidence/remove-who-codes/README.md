# Who codes removed (45.6, R91.6)

Shots in the full app shell on fake data (`?page=app&roles=single&ghfull=1`),
desktop 1280 px and phone 390 px, light and dark, with Kiro Crew's own
stylesheet.

- `after/repositories-*`: Settings › Repository setup. No Who codes field in a
  repository's editor and no Who codes line in its View dialog.
- `after/radar-*`: Settings › Issue Radar. The Radar crew card (crew scope to
  the ready label, release mode) and the Radar values list are gone. Handoff
  to Avoozl, Labels Radar uses, crew review rules, conflicts and merge method
  stay.

To make them again:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host stylesheet> \
      node kirocrew-app/ui/test/browser/settings-tabs-shots.mjs <out dir> radar repositories
