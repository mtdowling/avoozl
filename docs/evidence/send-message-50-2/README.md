# Send message on `process` sessions (task 50.2)

Screenshots of Home in the full app shell on fake data (harness
`?page=app&process=1`), at 390 and 1280 px, light and dark, with Kiro
Crew's own stylesheet. Paths in the data are made up.

- `before/`: main before this change. A `process` worker row has Info and
  Attach and no way to send it a message.
- `after/`: the row has a **Send message** button beside Info. It opens a
  box under the log; **Send** queues the text as a `send` request
  (`session.send`), and the row says it was queued. The supervisor resumes
  the child with it when its current run ends. The Kiro Crew reviewer row
  is unchanged; its chat takes messages in Kiro Crew.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/send-message-shots.mjs docs/evidence/send-message-50-2/after

The before shots ran the same script and harness on main.
