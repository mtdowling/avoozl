// An on/off choice with its visible text: Kiro Crew's `Toggle` (a switch with
// no text, no id and no label element) and the text beside it. A click on the
// text flips it too, as a click on a checkbox's label does. `label` is the
// switch's accessible name; the text is `children`. `size` is the text size,
// `align` where the switch sits against wrapped text, `gap` the space between
// them, `inline` makes it as wide as its content. Other props (`id`, `data-*`)
// go on the wrapper, which is where a test or a link finds the choice.
import type { HTMLAttributes, MouseEvent, ReactNode } from 'react'
import { Toggle } from './Toggle'

export type SwitchProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style' | 'onChange' | 'children'> & {
  checked: boolean
  onChange(checked: boolean): void
  label: string
  children?: ReactNode
  disabled?: boolean
  describedBy?: string
  size?: 'xs' | 'sm'
  align?: 'start' | 'center'
  gap?: 1 | 1.5 | 2
  inline?: boolean
}

const GAP = { 1: 'gap-1', 1.5: 'gap-1.5', 2: 'gap-2' } as const

export function Switch({ checked, onChange, label, children, disabled, describedBy, size, align = 'center', gap = 2, inline, ...rest }: SwitchProps) {
  const flip = (event: MouseEvent) => {
    if (disabled || (event.target as HTMLElement).closest('[role="switch"]')) return
    onChange(!checked)
  }
  const className = [inline ? 'inline-flex' : 'flex', align === 'start' ? 'items-start' : 'items-center', GAP[gap], size && `text-${size}`].filter(Boolean).join(' ')
  return (
    <span className={className} onClick={children ? flip : undefined} {...rest}>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} describedBy={describedBy} />
      {children}
    </span>
  )
}
