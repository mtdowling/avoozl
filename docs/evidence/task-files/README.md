# Task drawer Files fold (2026-11-13)

The task drawer's Files fold (Requirement 75, design §8.10) on the harness
page (`kirocrew-app/ui/test/browser/harness.tsx`), with the host's
stylesheet, on Linux with headless Chromium. The fold's reads are answered
by the harness: a worktree with a file added, changed, deleted, renamed, a
binary and an untracked file, and README.md's diff open.

- `task-files-<width>-<theme>.png`: the unified diff at 320, 768 and 1280 px,
  light and dark.
- `task-files-split-<width>-<theme>.png`: the same diff with Split chosen.

The harness's stand-in Badge has no colors, so the status letters show
plain here; the host colors them.

To make them again:
`node kirocrew-app/ui/test/browser/screenshots.mjs <out> task-files task-files-split`.
Set `AVOOZL_HOST_CSS` to the host's stylesheet, `AVOOZL_CHROME`, and
`AVOOZL_CHROME_NO_SANDBOX=1` on a host without a usable sandbox.
