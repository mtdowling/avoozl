// A page's middle and right columns (follows Kiro Crew's list-detail
// pattern). With nothing picked the list takes the page. Picking an item
// opens a wider detail column on the right, and the list narrows to its
// remembered width; drag its edge to change that, though it never closes.
// A phone shows one pane: the list, or the detail with Back in its sticky row.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { clampWidth, listSpec, pageStorage, readWidth, writeWidth } from './columns.ts'
import { DetailPane } from './ListDetail.tsx'
import { usePhone } from './list-detail.ts'
import { ResizeHandle } from './ResizeHandle.tsx'

export function ListDetailLayout(props: {
  // Names the list's remembered width.
  id: string
  list: ReactNode
  // The picked item's detail, or null with nothing picked.
  detail: ReactNode | null
  detailTitle: string
  backLabel: string
  onBack: () => void
  // Buttons at the right of a phone's sticky Back row (a spec's menu).
  detailActions?: ReactNode
}) {
  const phone = usePhone()
  const spec = listSpec(props.id)
  const [width, setWidth] = useState(() => readWidth(pageStorage(), spec))
  const column = useRef<HTMLDivElement>(null)
  const resize = useCallback(
    (next: number) => {
      const value = clampWidth(spec, next)
      setWidth(value)
      writeWidth(pageStorage(), spec, value)
    },
    [spec.key],
  )
  if (phone)
    return props.detail === null ? (
      <div data-list-pane={props.id}>{props.list}</div>
    ) : (
      <div data-detail-pane-for={props.id}>
        <DetailPane backLabel={props.backLabel} onBack={props.onBack} title={props.detailTitle} actions={props.detailActions}>
          {props.detail}
        </DetailPane>
      </div>
    )
  if (props.detail === null)
    return (
      <div data-list-pane={props.id} data-list-only>
        {props.list}
      </div>
    )
  return (
    <div data-list-detail={props.id} style={{ display: 'flex', alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <div ref={column} data-list-pane={props.id} style={{ flex: `0 0 ${width}px`, width, minWidth: 0, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        {props.list}
      </div>
      <ResizeHandle
        label="Resize the list"
        width={width}
        min={spec.min}
        max={spec.max}
        left={() => column.current?.getBoundingClientRect().left ?? 0}
        onResize={resize}
        onReset={() => resize(spec.initial)}
      />
      <div data-detail-column={props.id} style={{ flex: '1 1 0%', minWidth: 0, minHeight: 0, overflowY: 'auto', paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
        {props.detail}
      </div>
    </div>
  )
}
