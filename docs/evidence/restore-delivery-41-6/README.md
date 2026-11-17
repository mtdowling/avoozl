# Delivery, Settings › Budgets and the Files and diff view restored (task 41.6)

Screenshots of the full app shell on fake data (harness
`?page=app&delivery=1`), at 390 and 1280 px, light and dark, with Kiro
Crew's own stylesheet.

- `delivery-*`: Dashboards › Delivery, the lanes from before ba04389. Its
  filters sit in the left nav under Dashboards as rail rows and chips, as
  Specs draws its own. `delivery-filters-390-*` is the phone's menu.
- `drawer-files-*`: the task drawer's Files fold with one file's diff. The
  editor choice is a pill toggle, not a dropdown.
- `drawer-budget-*`: the drawer's Budget fold with its receipt.
- `settings-budgets-*`: Settings › Budgets, opened from its Configure button.

Routing is not restored, and Delivery has no Pick again.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/restore-shots.mjs docs/evidence/restore-delivery-41-6
