# Review side column resize and page keys (2026-11-17)

Follows #517, #519, #526 and #527, whose behavior stays as it was.

- The Review tab's side column (Contents and Comments) resizes from its left
  edge: drag it, or focus the handle (`role="separator"`) and press Left
  (wider) or Right (narrower); double-click resets to 340 px. The width is
  kept in this browser (`avoozl:review-side-width`), 240 to 720 px, and the
  text never gets narrower than 320 px. A phone has no handle; the column
  sits under the text.
- The side column's Contents and Comments tab bar no longer shrinks to
  nothing in the scrolling column (it was hidden on main at 1280 px).
- Home, End, Page Up and Page Down scroll the pane under the mouse on the
  Specs page (list, details box, tab content, text, side column), not the
  window, unless a text box, select or editable area has focus or a control
  already used the key.

Files: `default-1280-<theme>.png` (the column at its default width, tab bar
showing), `wider-1280-<theme>.png` (its edge dragged 200 px left) and
`phone-390-<theme>.png` (no handle). Full app with Kiro Crew's own
stylesheet. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/review-side-resize-shots.mjs <out>
