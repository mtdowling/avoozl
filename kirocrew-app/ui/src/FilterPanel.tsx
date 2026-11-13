// The one boxed filter panel every list tab uses: Graph, Delivery, Plans and
// Conflicts. Each tab passes its fields as data, so the look, the layout,
// the Clear button and the narrow fold are the same everywhere.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import { FilterSelect, selectStyle } from './FilterSelect.tsx'
import { Picker } from './Picker.tsx'
import type { PickItem } from './picker.ts'
import { X } from './icons.ts'
import { ICON, TipBtn } from './controls.tsx'
import { useMedia } from './TaskDrawer.tsx'
import type { Option } from './filters.ts'

export type FilterField =
  | { kind: 'search'; key: string; label: string; value: string; placeholder: string; onChange: (value: string) => void }
  | { kind: 'select'; key: string; label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; hint?: string }
  // A task or spec: the searchable picker (§8.9), with '' for All.
  | { kind: 'pick'; key: string; label: string; value: string; items: PickItem[]; onChange: (value: string) => void }
  | {
      kind: 'range'
      key: string
      label: string
      min: number | undefined
      max: number | undefined
      limit: number
      onChange: (min: number | undefined, max: number | undefined) => void
    }
  | { kind: 'check'; key: string; label: string; checked: boolean; onChange: (checked: boolean) => void }

const numberStyle = { ...selectStyle, width: '4.5rem' }

const whole = (value: string) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function Field({ id, field }: { id: string; field: FilterField }) {
  const fieldId = `${id}-${field.key}`
  if (field.kind === 'search')
    return (
      <label htmlFor={fieldId} className="flex flex-col gap-1 text-sm">
        <span>{field.label}</span>
        <input
          id={fieldId}
          type="search"
          value={field.value}
          placeholder={field.placeholder}
          onChange={(event) => field.onChange(event.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={selectStyle}
        />
      </label>
    )
  if (field.kind === 'select')
    return <FilterSelect id={fieldId} label={field.label} value={field.value} options={field.options} onChange={field.onChange} disabled={field.disabled} hint={field.hint} />
  if (field.kind === 'pick')
    return <Picker id={fieldId} label={field.label} items={field.items} value={field.value} onPick={field.onChange} emptyLabel="All" maxWidth="16rem" />
  if (field.kind === 'check')
    return (
      <label className="flex items-center gap-1.5 pb-1 text-sm">
        <input type="checkbox" checked={field.checked} onChange={(event) => field.onChange(event.target.checked)} />
        {field.label}
      </label>
    )
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">{field.label}</legend>
      <span className="flex items-center gap-1">
        <input
          aria-label={`${field.label} from`}
          type="number"
          min={1}
          max={field.limit || undefined}
          value={field.min ?? ''}
          placeholder="1"
          onChange={(event) => field.onChange(whole(event.target.value), field.max)}
          className="rounded border px-2 py-1 text-sm"
          style={numberStyle}
        />
        <span className="text-muted">to</span>
        <input
          aria-label={`${field.label} to`}
          type="number"
          min={1}
          max={field.limit || undefined}
          value={field.max ?? ''}
          placeholder={String(field.limit || '')}
          onChange={(event) => field.onChange(field.min, whole(event.target.value))}
          className="rounded border px-2 py-1 text-sm"
          style={numberStyle}
        />
      </span>
    </fieldset>
  )
}

// A box of filter fields and Clear, then the tab's own line under them
// (counts, Refresh). On a narrow page the fields fold behind one Filters
// button inside the box.
export function FilterPanel(props: { id: string; label: string; fields: FilterField[]; active: boolean; onClear: () => void; children?: ReactNode }) {
  const narrow = useMedia('(max-width: 767px)')
  const [open, setOpen] = useState(false)
  const fields = (
    <div className="flex flex-wrap items-end gap-3" data-filter-bar>
      {props.fields.map((field) => (
        <Field key={field.key} id={props.id} field={field} />
      ))}
      <TipBtn tooltip="Clear every filter on this tab" type="button" onClick={props.onClear} disabled={!props.active} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <X size={ICON} aria-hidden="true" />
        Clear
      </TipBtn>
    </div>
  )
  return (
    <Card>
      <div role="search" aria-label={props.label} data-filter-panel={props.id}>
        {narrow ? (
          <div className="flex flex-col gap-2">
            <Btn onClick={() => setOpen(!open)} aria-expanded={open}>
              Filters{props.active ? ' (on)' : ''}
            </Btn>
            {open && fields}
          </div>
        ) : (
          fields
        )}
      </div>
      {props.children && <div className="mt-3">{props.children}</div>}
    </Card>
  )
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// A filter saved per workspace in the page's storage. A change on one tab
// reaches every other user of the same store through one window event.
export function useStoredFilter<T>(
  workspaceId: string | null,
  store: { event: string; read: (s: Storage | null, id: string) => T; write: (s: Storage | null, id: string, value: T) => void; empty: T },
): [T, (next: T) => void] {
  const { event, read, write, empty } = store
  const [filter, setFilter] = useState<T>(() => (workspaceId ? read(storage(), workspaceId) : empty))
  useEffect(() => {
    setFilter(workspaceId ? read(storage(), workspaceId) : empty)
    const sync = () => workspaceId && setFilter(read(storage(), workspaceId))
    window.addEventListener(event, sync)
    return () => window.removeEventListener(event, sync)
  }, [workspaceId, event, read, empty])
  const set = useCallback(
    (next: T) => {
      setFilter(next)
      if (!workspaceId) return
      write(storage(), workspaceId, next)
      window.dispatchEvent(new Event(event))
    },
    [workspaceId, event, write],
  )
  return [filter, set]
}

export function writeStored<T>(store: { event: string; write: (s: Storage | null, id: string, value: T) => void }, workspaceId: string, value: T) {
  store.write(storage(), workspaceId, value)
  window.dispatchEvent(new Event(store.event))
}
