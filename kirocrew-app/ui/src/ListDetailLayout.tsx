// A page's middle and right columns (follows Kiro Crew's list-detail
// pattern). With nothing picked the list takes the page. Picking an item
// opens a wider detail column on the right, and the list narrows to its
// remembered width; drag its edge to change that, though it never closes.
// A phone shows one pane: the list, or the detail with Back in its sticky row.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { LIST_FOLDED_WIDTH, clampWidth, listSpec, pageStorage, readWidth, writeWidth } from './columns.ts'
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
  // The detail draws its own big title (useDetailTitleRef).
  detailOwnTitle?: boolean
  // Desktop: the list is a thin bar for now (a wide spec rail needs its
  // room); clicking the bar brings it back.
  listFolded?: { label: string; onUnfold: () => void }
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
        <DetailPane backLabel={props.backLabel} onBack={props.onBack} title={props.detailTitle} actions={props.detailActions} ownTitle={props.detailOwnTitle}>
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
  // One tree whether the list is folded or not, so the detail (and a drag
  // in progress on its spec rail) stays mounted when the list folds. A
  // folded list is hidden, not unmounted: it fills the nav's filters.
  const folded = props.listFolded
  return (
    <div data-list-detail={props.id} data-list-folded={folded ? '' : undefined} style={{ display: 'flex', alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <div ref={column} data-list-pane={props.id} hidden={Boolean(folded)} style={{ flex: `0 0 ${width}px`, width, minWidth: 0, minHeight: 0, overflowY: 'auto', paddingRight: 4, display: folded ? 'none' : undefined }}>
        {props.list}
      </div>
      {!folded && (
        <ResizeHandle
          label="Resize the list"
          width={width}
          min={spec.min}
          max={spec.max}
          left={() => column.current?.getBoundingClientRect().left ?? 0}
          onResize={resize}
          onReset={() => resize(spec.initial)}
        />
      )}
      {folded && (
        <button
          type="button"
          data-list-unfold={props.id}
          aria-label={folded.label}
          onClick={folded.onUnfold}
          style={{ flex: `0 0 ${LIST_FOLDED_WIDTH}px`, width: LIST_FOLDED_WIDTH, display: 'flex', justifyContent: 'center', padding: '10px 0', background: 'none', border: 0, borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500 }}
        >
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{folded.label}</span>
        </button>
      )}
      <div data-detail-column={props.id} style={{ flex: '1 1 0%', minWidth: 0, minHeight: 0, overflowY: 'auto', paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
        {props.detail}
      </div>
    </div>
  )
}
