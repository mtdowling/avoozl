// A titled, bordered box of related fields: a native fieldset whose legend
// is the title, so a screen reader names the group. Used by Settings ›
// Budgets, Prices and Providers.
import type { ReactNode } from 'react'

export function FieldBox(props: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <fieldset data-field-box={props.title} className="flex min-w-0 flex-col gap-2 rounded-lg" style={{ border: '1px solid var(--border)', padding: '8px 12px 12px', margin: 0 }}>
      <legend className="text-sm font-semibold" style={{ padding: '0 4px' }}>
        {props.title}
      </legend>
      {props.blurb && <p className="text-xs text-muted">{props.blurb}</p>}
      {props.children}
    </fieldset>
  )
}
