// Open a view from the nav: the page opens on Insights. A phone opens its
// menu first.
export async function openView(page, key) {
  await page.until(`Boolean(document.querySelector('[data-left-nav], [data-top-rail-bar]'))`)
  if (!(await page.evaluate(`Boolean(document.querySelector('[data-left-nav]'))`))) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await page.until(`Boolean(document.querySelector('[data-top-rail-list] [data-nav-group="${key}"]'))`)
  }
  await page.evaluate(`document.querySelector('[data-nav-group="${key}"]').click()`)
  // A section with filters stays open in the phone's menu; shut it.
  await page.evaluate(
    `(() => { const bar = document.querySelector('[data-top-rail-bar]'); if (bar && document.querySelector('[data-top-rail-list]')) bar.click(); return true })()`,
  )
}

export const inFlight = (page) => openView(page, 'delivery')
export const specs = (page) => openView(page, 'plans')
