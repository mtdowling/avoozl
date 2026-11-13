# Demo mode (2026-11-13)

Requirement 81, design §6.11. Try the demo opens a made-up sample workspace
(`src/app/demo.mjs`) with a guided tour (`kirocrew-app/ui/src/Demo.tsx`).

Checks run on Linux with headless Chromium:

- `src/app/test/demo.test.mjs`: the sample's contents; install once with
  edits kept; a failed install leaves nothing; a folder in the way is kept;
  every non-read app operation answers with a preview; no GitHub write and
  no session row; the fake GitHub refuses writes and unknown methods; and,
  through the app backend, the real workspace, machine catalog and settings
  hash the same before and after a demo.
- `kirocrew-app/ui/test/demo-tour.test.mjs`: the host guard, the tour's
  steps and keys, then the whole page on replies from the real sample: Try
  the demo, the badge, all 9 steps by Next and arrow keys, Back, Esc, a Stop
  the line preview, Exit demo back to the person's workspace, and the tour
  card inside the screen at 320, 768 and 1280 px in light and dark.

Screenshots are of the harness page (`kirocrew-app/ui/test/browser/harness.tsx`
`?page=demo`) using the host's stylesheet: the Dashboard, task and Stop the
line steps at 320, 768 and 1280 px, light and dark. To make every step:
`node kirocrew-app/ui/test/browser/demo-screenshots.mjs <out>`.

The browser tests skip when no Chrome is found. Set `AVOOZL_CHROME`, and
`AVOOZL_CHROME_NO_SANDBOX=1` on a host without a usable sandbox.
