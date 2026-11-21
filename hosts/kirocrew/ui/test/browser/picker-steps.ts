// Page steps the Settings tests share, each a script for page.evaluate().

// Picks `text` in the picker whose input is #`id`: a press on its option,
// as a person's click starts.
export const pick = (id: string, text: string) => `(() => {
  const option = [...document.querySelectorAll('#${id}-list [role="option"]')].find((item) => item.textContent.trim() === ${JSON.stringify(text)})
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
})()`

// Clicks the first `selector` whose text starts with `text`; true when there was one.
export const clickText = (selector: string, text: string) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
