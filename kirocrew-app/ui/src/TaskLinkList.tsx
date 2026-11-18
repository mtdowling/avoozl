// A bulleted list of linked tasks, one per item: the task drawer's Edges
// (Waits on, Blocks) and the Graph's item modal use it. An empty list
// renders nothing.
import type { CSSProperties, ReactNode } from 'react'

export interface LinkedTask {
  id: string
  // When one task can show twice (by two kinds of edge).
  key?: string
  label: ReactNode
  note?: ReactNode
  style?: CSSProperties
}

export function TaskLinkList(props: { title?: string; items: LinkedTask[]; onOpen: (id: string) => void; attr?: string }) {
  if (!props.items.length) return null
  return (
    <div data-task-list={props.attr}>
      {props.title && <h4 className="text-sm font-semibold">{props.title}</h4>}
      <ul className={`m-0 flex list-disc flex-col gap-1 pl-5 text-sm ${props.title ? 'mt-1' : ''}`}>
        {props.items.map((item) => (
          <li key={item.key ?? item.id}>
            <button type="button" className="cursor-pointer underline" style={{ background: 'transparent', color: 'var(--text)', ...item.style }} onClick={() => props.onOpen(item.id)}>
              {item.label}
            </button>
            {item.note && <span className="text-xs text-muted"> {item.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
