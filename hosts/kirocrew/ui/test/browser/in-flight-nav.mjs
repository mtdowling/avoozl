// Open In flight from the nav: the page opens on Specs. A phone opens its
// menu first.
export async function inFlight(page) {
  await page.until(`Boolean(document.querySelector('[data-left-nav], [data-top-rail-bar]'))`)
  if (!(await page.evaluate(`Boolean(document.querySelector('[data-left-nav]'))`))) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await page.until(`Boolean(document.querySelector('[data-top-rail-list] [data-nav-group="delivery"]'))`)
  }
  await page.evaluate(`document.querySelector('[data-nav-group="delivery"]').click()`)
}
