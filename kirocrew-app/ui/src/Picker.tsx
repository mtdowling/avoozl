// One searchable picker for every task and spec choice (design §8.9, R72):
// a WAI-ARIA combobox with a listbox popup. Type to match on ID, title and
// spec; Down, Up, Home and End move; Enter picks; Esc closes, then clears.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { selectStyle } from './FilterSelect.tsx'
import { pickIndex, pickKey, pickLabel, pickMatches, type PickItem } from './picker.ts'

export function Picker(props: {
  id?: string
  label: ReactNode
  items: PickItem[]
  // The picked ID, or '' for none.
  value: string
  onPick: (id: string) => void
  placeholder?: string
  // Shown for '' when clearing is allowed, as in a filter ("All").
  emptyLabel?: string
  // Keep the text after a pick (a filter) or clear it (an "add" box).
  keep?: boolean
  maxWidth?: string
}) {
  const own = useId(),
    id = props.id ?? `avoozl-pick-${own.replace(/:/g, '')}`,
    listId = `${id}-list`
  const index = useMemo(() => pickIndex(props.items), [props.items])
  const keep = props.keep ?? true
  const picked = useMemo(() => props.items.find((item) => item.id === props.value) ?? null, [props.items, props.value])
  const shownText = picked && keep ? pickLabel(picked) : ''
  const [text, setText] = useState(shownText)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  // The text follows the picked value while the person is not typing.
  useEffect(() => {
    if (!editing) setText(shownText)
  }, [shownText, editing])
  const { shown, total } = useMemo(() => pickMatches(index, editing ? text : ''), [index, text, editing])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-opt-${active}`)}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, id])
  const choose = (item: PickItem) => {
    props.onPick(item.id)
    setEditing(false)
    setOpen(false)
    setText(keep ? pickLabel(item) : '')
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = pickKey({ open, active }, event.key, shown.length)
    if (action.kind === 'none') return
    event.preventDefault()
    if (action.kind === 'move') {
      setOpen(true)
      setActive(action.state.active)
    } else if (action.kind === 'pick') choose(shown[action.index])
    else if (action.kind === 'close') setOpen(false)
    else {
      setText('')
      setEditing(false)
      if (props.emptyLabel !== undefined && props.value) props.onPick('')
    }
  }
  const expanded = open && (shown.length > 0 || editing)
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: props.maxWidth ?? '100%', position: 'relative' }}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && shown.length ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={props.value ? undefined : (props.emptyLabel ?? props.placeholder)}
        onChange={(event) => {
          setText(event.target.value)
          setEditing(true)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => {
          setOpen(false)
          // An emptied filter means All; any other unpicked text is dropped.
          if (editing && !text.trim() && props.emptyLabel !== undefined && props.value) props.onPick('')
          setEditing(false)
        }}
        onKeyDown={onKey}
        className="rounded border px-2 py-1 text-sm"
        style={selectStyle}
        data-picker
      />
      <div
        hidden={!expanded}
        className="rounded border shadow"
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 70, marginTop: 2, background: 'var(--card, var(--bg))', borderColor: 'var(--border)', maxHeight: '16rem', overflow: 'auto' }}
      >
        <ul ref={list} id={listId} role="listbox" aria-label={typeof props.label === 'string' ? props.label : undefined} className="flex flex-col p-1">
          {shown.map((item, i) => (
            <li
              key={item.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, so the input's blur does not close the list first.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(item)
              }}
              onMouseEnter={() => setActive(i)}
              className="flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5"
              style={i === active ? { background: 'color-mix(in srgb, var(--text) 10%, transparent)' } : undefined}
            >
              <span className="shrink-0 text-xs text-muted">{item.id}</span>
              <span className="min-w-0 flex-1 truncate">{item.title !== item.id ? item.title : ''}</span>
              {item.spec && <span className="shrink-0 text-xs text-muted">{item.spec}</span>}
              {item.state && (
                <span className="shrink-0 rounded border px-1 text-xs" style={{ borderColor: 'var(--border)' }}>
                  {item.state}
                </span>
              )}
            </li>
          ))}
        </ul>
        {total === 0 && <p className="px-2 py-1 text-xs text-muted">No match.</p>}
        {total > shown.length && <p className="px-2 py-1 text-xs text-muted">{total - shown.length} more; type to narrow.</p>}
      </div>
    </div>
  )
}

// A graph's tasks (epics left out) and stored specs as picker items.
export const taskItems = (tasks: { id: string; title: string; kind?: string; spec?: string | null; planId?: string | null; state?: string | null; status?: string | null }[]): PickItem[] =>
  tasks.filter((t) => t.kind !== 'epic').map((t) => ({ id: t.id, title: t.title || t.id, spec: t.spec ?? t.planId ?? null, state: t.state ?? t.status ?? null }))
