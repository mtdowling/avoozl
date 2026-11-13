// One choice made by opening its section: a stack of fold-out sections in
// one radio group, where the open section is always the selected choice.
// Each header is a real radio input inside its label, so the whole header
// clicks, arrow keys move the choice, and screen readers read it as a
// radio group. An open section shows its description, then a rule, then
// its fields. A disabled choice shows its reason and cannot be picked.
// Used by the Settings mode picker and the Add plugin steps.
import type { ReactNode } from 'react'
import type { LucideIcon } from './icons.ts'

export interface RadioSection<K extends string> {
  key: K
  title: string
  line: string
  icon?: LucideIcon
  // Why this choice is off, shown in place of its body.
  disabled?: string | null
  // What the choice is: pictures, "Use it when", facts.
  description?: ReactNode
  // What the choice sets. A rule separates them from the description.
  fields?: ReactNode
}

// The open section's body slides in; reduced motion turns it off.
const MOTION = `
@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }
`

// The themed rule between a section's description and its fields.
export function SectionRule() {
  return <hr data-section-rule className="my-3 border-0 border-t" style={{ borderColor: 'var(--border)', borderTopWidth: 1, borderTopStyle: 'solid' }} />
}

export function RadioFold<K extends string>(props: {
  name: string
  label: string
  value: K
  onChange: (value: K) => void
  sections: RadioSection<K>[]
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-col" data-radio-fold={props.name}>
      <style>{MOTION}</style>
      {props.sections.map((section) => {
        const open = section.key === props.value
        const Icon = section.icon
        const id = `${props.name}-${section.key}`
        return (
          <section
            key={section.key}
            data-radio-section={section.key}
            data-open={open}
            className="rounded-lg"
            style={{
              border: `${open ? 2 : 1}px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
              background: open ? 'color-mix(in srgb, var(--accent) 4%, var(--card))' : 'var(--card)',
              marginTop: 8,
              opacity: section.disabled ? 0.65 : 1,
            }}
          >
            <label
              htmlFor={id}
              className="flex items-start gap-3"
              style={{ padding: open ? 11 : 12, cursor: section.disabled ? 'not-allowed' : 'pointer' }}
            >
              <input
                id={id}
                type="radio"
                name={props.name}
                value={section.key}
                checked={open}
                disabled={Boolean(section.disabled)}
                aria-describedby={`${id}-line`}
                onChange={() => props.onChange(section.key)}
                className="mt-1.5 flex-none"
                style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-base font-semibold">
                  {Icon && <Icon size={16} aria-hidden="true" style={{ flex: 'none', color: open ? 'var(--accent)' : 'var(--muted)' }} />}
                  {section.title}
                </span>
                <span id={`${id}-line`} className="text-sm text-muted">
                  {section.line}
                </span>
                {section.disabled && <span className="text-xs text-muted">{section.disabled}</span>}
              </span>
            </label>
            {open && !section.disabled && (section.description || section.fields) && (
              <div data-radio-fold-body className="flex min-w-0 flex-col" style={{ padding: '0 13px 13px' }}>
                {section.description}
                {section.description && section.fields && <SectionRule />}
                {section.fields}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
