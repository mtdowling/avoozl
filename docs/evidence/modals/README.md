# Modals cover the screen (2026-11-13)

Every modal now opens through the shared `Modal` (`kirocrew-app/ui/src/Modal.tsx`):
a `<dialog>` opened with `showModal()`, portaled to `document.body`, on the
browser's top layer. Z-indexes outside modals come from `kirocrew-app/ui/src/layers.ts`.

Checks run on Linux with headless Chromium 154:

- `kirocrew-app/ui`: `npm test` — 337 pass, 0 fail, 2 skipped (they need other env), including
  `test/modal-cover.test.mjs` (14 modals, plus the unsaved-changes confirm
  and the tooltip inside a modal). For each modal, at 1280 px and at 320 px,
  with the page at the top and scrolled so the Graph and the sticky column
  sit under the probe points: `elementFromPoint` at the 4 corners and the
  center hits the modal, never the page. The modal is a child of `<body>`
  and matches `:modal`. Focus is inside it. A mouse wheel does not scroll
  the page behind it. Esc closes it and gives focus back to the opener. A
  click outside closes it. At 320 px it fills the screen.
- Root `npm test` — 927 pass, 0 fail. `npm run format:check`, `git diff --check`
  and `node scripts/release-scan.mjs` pass. No local release terms file was
  present, so private names were not checked by the scan.

Screenshots are of the harness page (`kirocrew-app/ui/test/browser/harness.tsx`)
using the host's stylesheet. They show Add plugin and Onboard at 320, 768 and
1280 px, in light and dark. To make all 14 modals:
`node kirocrew-app/ui/test/browser/screenshots.mjs <out>`.

The browser tests skip when no Chrome is found. Set `AVOOZL_CHROME`, and
`AVOOZL_CHROME_NO_SANDBOX=1` on a host without a usable sandbox.
