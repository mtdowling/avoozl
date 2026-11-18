// Column widths for the three-column shell (follows Kiro Crew's list-detail
// pattern): the left nav and each page's list column. A person drags or
// arrow-keys a handle; the width is kept in local storage per column. The
// nav can also collapse to a thin bar; a list column never closes. Kept free
// of JSX so node can test it.

export interface ColumnSpec {
  key: string
  initial: number
  min: number
  max: number
}

// Issue Radar's rail sizes (DEFAULT, MIN and MAX_RAIL_WIDTH in its
// lib/format.ts). The key is new so a width saved under the old, narrower
// default does not keep the nav narrow.
export const NAV: ColumnSpec = { key: 'avoozl:nav-width-v2', initial: 288, min: 220, max: 460 }
// Dragging the nav this far under its minimum collapses it.
export const NAV_COLLAPSE_AT = 110
export const NAV_COLLAPSED_KEY = 'avoozl:nav-collapsed'
export const NAV_COLLAPSED_WIDTH = 36
export const LIST: Omit<ColumnSpec, 'key'> = { initial: 360, min: 240, max: 640 }
export const listSpec = (id: string): ColumnSpec => ({ key: `avoozl:list-width:${id}`, ...LIST })
// A folded list is a thin bar, as wide as the collapsed nav.
export const LIST_FOLDED_WIDTH = 36

export const clampWidth = (spec: ColumnSpec, width: number) =>
  Math.round(Math.min(spec.max, Math.max(spec.min, Number.isFinite(width) ? width : spec.initial)))

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null

export function readWidth(storage: Store, spec: ColumnSpec): number {
  try {
    const raw = storage?.getItem(spec.key)
    return raw === null || raw === undefined ? spec.initial : clampWidth(spec, Number(raw))
  } catch {
    return spec.initial
  }
}

export function writeWidth(storage: Store, spec: ColumnSpec, width: number): void {
  try {
    if (width === spec.initial) storage?.removeItem(spec.key)
    else storage?.setItem(spec.key, String(width))
  } catch {
    // Private mode: the width lasts for the visit only.
  }
}

export function readFlag(storage: Store, key: string): boolean {
  try {
    return storage?.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(storage: Store, key: string, on: boolean): void {
  try {
    if (on) storage?.setItem(key, '1')
    else storage?.removeItem(key)
  } catch {
    // As above.
  }
}

// Left and Right move a focused handle 16 px; anything else is not a step.
export function stepWidth(width: number, key: string): number | null {
  return key === 'ArrowRight' ? width + 16 : key === 'ArrowLeft' ? width - 16 : null
}

// Up and Down move a focused panel divider 16 px: Up makes the panel taller.
export function stepHeight(height: number, key: string): number | null {
  return key === 'ArrowUp' ? height + 16 : key === 'ArrowDown' ? height - 16 : null
}

export function pageStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
