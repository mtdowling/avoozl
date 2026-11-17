# In flight for `process` sessions (task 50.1)

Screenshots of Home in the full app shell on fake data (harness
`?page=app&process=1`), at 390 and 1280 px, light and dark, with Kiro
Crew's own stylesheet. The worker runs Claude Code under the supervisor;
the reviewer is a Kiro Crew chat. Paths in the data are made up.

- `before/`: main before this change. The `process` worker looks like a
  chat: an agent-less model line and a **Session** link to a Kiro Crew chat
  that does not exist.
- `after/`: the worker row shows the harness, the supervisor's state, the
  run (2, after one resume) and the cost ($0.83), then the last lines of
  the child's log, newest at the bottom. **Attach** copies the command to
  join the session (`cd <worktree> && claude --resume <id>`); the tooltip
  shows it first. The Kiro Crew reviewer row is unchanged.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/in-flight-process-shots.mjs docs/evidence/in-flight-process-50-1/after

The before shots ran the same script and harness on main.
