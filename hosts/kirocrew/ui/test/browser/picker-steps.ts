// The step that picks `text` in the picker whose input is #`id`: a press
// on its option, as a person's click starts.
export const pick = (id: string, text: string) => `(() => {
  const option = [...document.querySelectorAll('#${id}-list [role="option"]')].find((item) => item.textContent.trim() === ${JSON.stringify(text)})
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
})()`
