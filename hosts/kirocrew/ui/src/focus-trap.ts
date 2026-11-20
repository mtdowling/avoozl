// The next element Tab reaches in a modal, kept inside its `items`
// focusable elements. `at` is the focused one's index, -1 when focus is
// outside. Kept free of JSX so node can test it.
export function trapStep(items: number, at: number, back: boolean): number {
  if (items === 0) return -1
  if (at < 0) return back ? items - 1 : 0
  return back ? (at - 1 + items) % items : (at + 1) % items
}
