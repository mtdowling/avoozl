# Task links, no task notes, and the Graph's ↗ (2026-11-17)

- Task details: the **Links and notes** box is now **Links**. It lists the
  links (or "No links yet") and an **Add link** button. The button opens the
  URL and label fields for one link, with Add and Cancel; adding closes
  them and brings the button back. The Add note box is gone, and so is the
  Mark done dialog's outcome note.
- Graph: O, Space or ↗ on a task card opens the full task details, the same
  view Specs opens, instead of the summary modal. Esc or Back closes them
  and focus returns to the card. A spec, or a draft spec's task, still opens
  the summary modal.

`before/` is `origin/main`; `after/` is this branch. Shots are inside the
full app (harness `?page=app`) with Kiro Crew's own stylesheet, at 1280 and
390 px, light and dark. `before/` has no `2-add-link` shots: there the
fields were always shown. The harness answers every task with the same
fixture task, so the Graph shot shows that task's details. To make them
again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/task-links-shots.mjs <out>
