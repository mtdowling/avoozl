// The one boxed filter panel every list tab uses: Graph, Delivery, Plans and
// Conflicts. Each tab passes its fields as data, so the look, the layout,
// the Clear button and the narrow fold are the same everywhere.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { FilterSelect, selectStyle } from './FilterSelect.tsx'
import { Picker } from './Picker.tsx'
import type { PickItem } from './picker.ts'
import { ListFilter, X } from './icons.ts'
import { MoreMenu } from './MoreMenu.tsx'
import { ICON, IconBtn, TipBtn } from './ui/controls.tsx'
import { useMedia } from './use-media.ts'
import type { Option } from './filters.ts'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { SelectField } from './ui/SelectField'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

export type FilterField = (
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
) & {
  // On the one-line row itself (a folded panel); the rest sit behind the
  // filter icon. Without any, the first search is the one on the row.
  primary?: boolean
}

const numberStyle = { ...selectStyle, width: '4.5rem' }

const whole = (value: string) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function Field({ id, field, inline }: { id: string; field: FilterField; inline?: boolean }) {
  const fieldId = `${id}-${field.key}`
  if (field.kind === 'search')
    return (
      <Box htmlFor={fieldId} as="label" flex flexCol gap="1" size="sm">
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
      </Box>
    )
  if (field.kind === 'select')
    return <FilterSelect id={fieldId} label={field.label} value={field.value} options={field.options} onChange={field.onChange} disabled={field.disabled} hint={field.hint} inline={inline} />
  if (field.kind === 'pick')
    return <Picker id={fieldId} label={field.label} items={field.items} value={field.value} onPick={field.onChange} emptyLabel="All" maxWidth="16rem" />
  if (field.kind === 'check')
    return (
      <Switch label={field.label} size="sm" gap={1.5} checked={field.checked} onChange={field.onChange}>
        {field.label}
      </Switch>
    )
  return (
    <Box as="fieldset" flex flexCol gap="1" size="sm">
      <Box as="legend" mb="1">{field.label}</Box>
      <Row as="span" gap={1} wrap={false}>
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
        <Hint>to</Hint>
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
      </Row>
    </Box>
  )
}

// A field drawn on the one-line row: no label above it, 24px tall. The
// label is the field's name for a screen reader, and a select's All choice.
const INLINE = { ...selectStyle, height: 24, boxSizing: 'border-box' as const, padding: '0 6px', fontSize: 12.5, borderRadius: 6, minWidth: 0 }
function InlineField({ id, field }: { id: string; field: FilterField }) {
  const fieldId = `${id}-${field.key}`
  if (field.kind === 'search')
    return <input id={fieldId} type="search" aria-label={field.label} value={field.value} placeholder={field.placeholder} onChange={(event) => field.onChange(event.target.value)} className="border" style={{ ...INLINE, flex: '1 1 8rem', width: '8rem', maxWidth: '16rem' }} />
  if (field.kind === 'select')
    return (
      <SelectField id={fieldId} aria-label={field.label} value={field.value} disabled={field.disabled} onChange={(event) => field.onChange(event.target.value)} look="compact" flex="0 1 7rem" width="7rem" maxWidth="9rem">
        <option value="">{field.label}: all</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    )
  return <Field id={id} field={field} />
}

// A box of filter fields and Clear, then the tab's own line under them
// (counts, Refresh). On a narrow page the fields fold behind one Filters
// button inside the box. `aside` sits at the right end of the fields' row
// (under them on a narrow page): a setting that belongs with the filters.
// `folded`: the fields fold behind Filters at any width (a list column), and
// the tab's own line (counts, Refresh) sits on the Filters row: one line.
export function FilterPanel(props: { id: string; label: string; fields: FilterField[]; active: boolean; onClear: () => void; children?: ReactNode; aside?: ReactNode; folded?: boolean }) {
  const narrow = useMedia('(max-width: 767px)') || Boolean(props.folded)
  const [open, setOpen] = useState(false)
  const fields = (
    <Row gap={3} align="end" data-filter-bar>
      {props.fields.map((field) => (
        <Field key={field.key} id={props.id} field={field} />
      ))}
      <TipBtn tooltip="Clear every filter on this tab" type="button" onClick={props.onClear} disabled={!props.active} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <X size={ICON} aria-hidden="true" />
        Clear
      </TipBtn>
    </Row>
  )
  if (props.folded) {
    const marked = props.fields.some((f) => f.primary)
    const first = props.fields.find((f) => f.kind === 'search')
    const onRow = props.fields.filter((f) => (marked ? f.primary : f === first))
    const rest = props.fields.filter((f) => !onRow.includes(f))
    // One line at every width: the main fields, a filter icon with the rest,
    // Clear while a filter is set, then the status text at the right end.
    return (
      <div role="search" aria-label={props.label} data-filter-panel={props.id} data-filter-row className="flex min-w-0 items-center gap-1.5" style={{ flexWrap: 'nowrap' }}>
        {onRow.map((field) => (
          <InlineField key={field.key} id={props.id} field={field} />
        ))}
        {rest.length > 0 && (
          <MoreMenu label={`More filters${props.active ? ' (on)' : ''}`} icon={ListFilter} on={props.active} attrs={{ 'data-filter-more': '' }}>
            <Stack gap={2} data-keep-menu>
              {rest.map((field) => (
                <Field key={field.key} id={props.id} field={field} />
              ))}
            </Stack>
          </MoreMenu>
        )}
        {props.active && <IconBtn icon={X} label="Clear every filter" tooltip="Clear every filter on this tab" onClick={props.onClear} />}
        {props.children && (
          <div className="ml-auto flex items-center gap-1.5" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} data-filter-status>
            {props.children}
          </div>
        )}
      </div>
    )
  }
  return (
    <Card>
      <div role="search" aria-label={props.label} data-filter-panel={props.id}>
        {narrow ? (
          <Stack gap={2}>
            <Btn onClick={() => setOpen(!open)} aria-expanded={open}>
              Filters{props.active ? ' (on)' : ''}
            </Btn>
            {open && fields}
          </Stack>
        ) : props.aside ? (
          <Box flex flexWrap items="end" justify="between" gap="3">
            {fields}
            <Box ml="auto" data-filter-aside>
              {props.aside}
            </Box>
          </Box>
        ) : (
          fields
        )}
        {narrow && props.aside && <Box mt="2" data-filter-aside>{props.aside}</Box>}
      </div>
      {props.children && <Box mt="3">{props.children}</Box>}
    </Card>
  )
}

// A page's filters in the left nav, under its open section (nav-slot.tsx):
// one field per row at the nav's width, then Clear. The page keeps its
// count line; the fields live here. `inline`: each dropdown on its label's
// line, labels in one column and dropdowns in the next.
export function NavFilters(props: { id: string; label: string; fields: FilterField[]; active: boolean; onClear: () => void; extra?: ReactNode; inline?: boolean }) {
  return (
    <Stack role="search" aria-label={props.label} data-nav-filters={props.id} data-filter-panel={props.id} gap={2}>
      {props.fields.map((field) => (
        <Field key={field.key} id={props.id} field={field} inline={props.inline} />
      ))}
      <span>
        <TipBtn tooltip="Clear every filter on this page" type="button" onClick={props.onClear} disabled={!props.active} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <X size={ICON} aria-hidden="true" />
          Clear
        </TipBtn>
      </span>
      {props.extra}
    </Stack>
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
