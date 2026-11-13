// The task drawer's width: dragged or arrow-keyed on its left edge,
// clamped to the page, and kept per workspace in the page's storage beside
// the filters. Kept free of JSX so node can test it.
export const DRAWER_DEFAULT = 620
export const DRAWER_MIN = 360
export const DRAWER_MAX_SHARE = 0.9
export const DRAWER_STEP = 40

// The width to draw: at least DRAWER_MIN, at most 90% of the page (and
// never wider than the page itself).
export function clampDrawer(width: number, page: number): number {
  const max = Math.max(Math.min(DRAWER_MIN, page), Math.floor(page * DRAWER_MAX_SHARE))
  const value = Number.isFinite(width) ? Math.round(width) : DRAWER_DEFAULT
  return Math.min(max, Math.max(Math.min(DRAWER_MIN, max), value))
}

const key = (workspaceId: string) => `avoozl.drawerWidth.${workspaceId}`

export function readDrawerWidth(storage: Pick<Storage, 'getItem'> | null, workspaceId: string): number {
  try {
    const value = Number(storage?.getItem(key(workspaceId)))
    return Number.isFinite(value) && value > 0 ? value : DRAWER_DEFAULT
  } catch {
    return DRAWER_DEFAULT
  }
}

export function writeDrawerWidth(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, workspaceId: string, width: number): void {
  try {
    if (width === DRAWER_DEFAULT) storage?.removeItem(key(workspaceId))
    else storage?.setItem(key(workspaceId), String(width))
  } catch {
    // Storage may be full or blocked; the width still holds for this visit.
  }
}

// Left widens and Right narrows, since the handle is on the left edge.
export function stepDrawer(width: number, keyName: string): number | null {
  if (keyName === 'ArrowLeft') return width + DRAWER_STEP
  if (keyName === 'ArrowRight') return width - DRAWER_STEP
  return null
}
