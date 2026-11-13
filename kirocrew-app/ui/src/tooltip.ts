// The logic behind the page's one Tooltip: when it shows and hides, and
// where it goes. Kept free of JSX and the DOM so node can test it.

export const TOOLTIP_DELAY = 300
export const TOOLTIP_GAP = 6
export const TOOLTIP_MARGIN = 6

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

// Above the anchor, centered, by default. Below when there is no room above.
// Shifted sideways (and up or down as a last resort) to stay inside the
// viewport. Never wider than the viewport allows.
export function placeTooltip(anchor: Rect, tip: { width: number; height: number }, viewport: { width: number; height: number }) {
  const gap = TOOLTIP_GAP
  const margin = TOOLTIP_MARGIN
  const above = anchor.top - gap - tip.height
  const below = anchor.top + anchor.height + gap
  const side: 'top' | 'bottom' = above >= margin || below + tip.height > viewport.height - margin ? 'top' : 'bottom'
  const clamp = (value: number, size: number, limit: number) => Math.max(margin, Math.min(value, limit - margin - size))
  const top = clamp(side === 'top' ? above : below, tip.height, viewport.height)
  const left = clamp(anchor.left + anchor.width / 2 - tip.width / 2, tip.width, viewport.width)
  // Where the arrow points, inside the tooltip.
  const arrow = Math.max(8, Math.min(tip.width - 8, anchor.left + anchor.width / 2 - left))
  return { top, left, side, arrow }
}

// One tooltip open at a time, page-wide.
let current: (() => void) | null = null

// Hover shows after a delay; keyboard focus shows at once; leave, blur and
// Esc hide. Touch never shows a hover tooltip.
export function tooltipController(options: {
  onChange: (open: boolean) => void
  delay?: number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}) {
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let open = false
  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  const hide = () => {
    cancel()
    if (current === hide) current = null
    if (open) {
      open = false
      options.onChange(false)
    }
  }
  const show = () => {
    cancel()
    if (current && current !== hide) current()
    current = hide
    if (!open) {
      open = true
      options.onChange(true)
    }
  }
  return {
    get open() {
      return open
    },
    enter(pointerType: string) {
      if (pointerType === 'touch' || open) return
      cancel()
      timer = setTimer(show, options.delay ?? TOOLTIP_DELAY)
    },
    leave: hide,
    focus(keyboard: boolean) {
      if (keyboard) show()
    },
    blur: hide,
    key(key: string) {
      if (key === 'Escape') hide()
    },
    hide,
  }
}
