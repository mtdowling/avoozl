# Home's Landing queue tile opens the Landing queue page

Home's Landing queue tile (PR #472) opened Delivery. It now opens Dashboards ›
Landing queue (PR #495). `kirocrew-app/ui/test/home-landing-tile.test.mjs`
clicks the tile in Chrome and checks the page that opens.

Full app shell with the host CSS, 1280 light (`?page=app&home=1&landing=1`):

- `after/home-1280-light.png`: Home with the tile (Home itself is unchanged).
- `before/tile-opens-1280-light.png`: the tile opened Delivery.
- `after/tile-opens-1280-light.png`: the tile opens Landing queue, and the nav
  marks it.
