// The app's one button with a look: `primary` is the main action (the
// theme's accent), `danger` a destructive one (the theme's danger color),
// and `default` is Cancel, Close and every other secondary action. Each
// fill sets its background and text color together, the text being the
// theme's text-on color (--accent-fg, --danger-fg) or, without one, the
// page background, which contrasts with the fill in light and in dark.
import { forwardRef, type ComponentProps } from 'react'
import { Btn } from './Btn'

export type ButtonVariant = 'primary' | 'danger' | 'default'

const CSS = `button[data-variant="danger"]{background:var(--danger);border-color:var(--danger);color:var(--danger-fg,var(--bg))}
button[data-variant="danger"]:hover:not(:disabled){background:color-mix(in srgb,var(--danger) 85%,var(--text));border-color:color-mix(in srgb,var(--danger) 85%,var(--text))}
button[data-variant="danger"]:focus-visible{outline:2px solid var(--danger);outline-offset:2px}
button[data-variant="danger"]:disabled{opacity:.5;cursor:not-allowed}`

let added = false
function addCss() {
  if (added || typeof document === 'undefined') return
  added = true
  const style = document.createElement('style')
  style.dataset.avoozlButton = ''
  style.textContent = CSS
  document.head.append(style)
}

export const Button = forwardRef<HTMLButtonElement, Omit<ComponentProps<typeof Btn>, 'variant' | 'primary'> & { variant?: ButtonVariant }>(function Button({ variant = 'default', ...rest }, ref) {
  if (variant === 'danger') addCss()
  return <Btn ref={ref} {...rest} primary={variant === 'primary'} data-variant={variant === 'default' ? undefined : variant} data-danger={variant === 'danger' ? '' : undefined} />
})
