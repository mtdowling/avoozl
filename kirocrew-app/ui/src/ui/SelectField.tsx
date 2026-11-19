// A native dropdown in the page's field look. Kiro Crew's own `Select` takes
// no id, aria-describedby, option groups or option children, and the page's
// forms label and describe their selects by id, so the page keeps a native
// select here (UC1.3) and draws it in one place. `look` is the size and shape
// (`field` the usual, `plain` the same without a font size, `tight` a small
// row field, `row` a rule row's full-width field, `compact` a filter bar's
// 24 px field). `width`, `maxWidth` and `flex` are CSS lengths for the field's
// place in its row; `fill` makes it the row's width; `round` is `md` for a
// slightly rounder corner; `dim` greys it out and drops pointer events, so a
// tooltip around a disabled field still hears the hover.
import type { ComponentProps, CSSProperties } from 'react'

export type SelectLook = 'field' | 'plain' | 'tight' | 'row' | 'compact'

export type SelectFieldProps = Omit<ComponentProps<'select'>, 'className' | 'style' | 'ref'> & {
  look?: SelectLook
  width?: string
  maxWidth?: string
  flex?: string
  fill?: boolean
  round?: 'md'
  dim?: boolean
}

const BASE: CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

const LOOK: Record<SelectLook, { className: string; style: CSSProperties }> = {
  field: { className: 'rounded border px-2 py-1 text-sm', style: BASE },
  plain: { className: 'min-w-0 rounded border px-2 py-1', style: BASE },
  tight: { className: 'rounded border px-1 py-0.5 text-xs', style: BASE },
  row: {
    className: '',
    style: {
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: 'var(--card, var(--bg))',
      color: 'var(--text)',
      padding: '4px 8px',
      fontSize: 13,
      minWidth: 0,
      width: '100%',
    },
  },
  compact: { className: 'border', style: { ...BASE, height: 24, boxSizing: 'border-box', padding: '0 6px', fontSize: 12.5, borderRadius: 6, minWidth: 0 } },
}

export function SelectField({ look = 'field', width, maxWidth, flex, fill, round, dim, ...rest }: SelectFieldProps) {
  const base = LOOK[look]
  const className = round === 'md' ? base.className.replace('rounded ', 'rounded-md ') : base.className
  const style: CSSProperties = {
    ...base.style,
    ...(fill ? { width: '100%', minWidth: 0 } : {}),
    ...(width ? { width } : {}),
    ...(maxWidth ? { maxWidth } : {}),
    ...(flex ? { flex } : {}),
    ...(dim ? { opacity: 0.5, pointerEvents: 'none' } : {}),
  }
  return <select className={className || undefined} style={style} {...rest} />
}
