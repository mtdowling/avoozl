// A page's middle and right columns (follows Kiro Crew's list-detail
// pattern). With nothing picked the list takes the page. Picking an item
// opens a wider detail column on the right, and the list narrows to its
// remembered width; drag its edge to change that, though it never closes.
// A phone shows one pane: the list, or the detail with Back in its sticky row.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LIST_FOLDED_WIDTH, clampWidth, listSpec, pageStorage, readWidth, writeWidth } from './columns.ts'
import { DetailPane } from './ListDetail.tsx'
import { usePhone } from './list-detail.ts'
import { ResizeHandle } from './ResizeHandle.tsx'
import { scrollParent } from './sticky-column.ts'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

// The height left on screen under the node in whatever scrolls the page
// (in Kiro Crew, the app's content pane), measured again when it resizes;
// null while off.
function useFillHeight(on: boolean) {
  const [height, setHeight] = useState<number | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const ref = useCallback(
    (node: HTMLElement | null) => {
      stop.current?.()
      stop.current = null
      if (!node || !on) return setHeight(null)
      const parent = scrollParent(node)
      const measure = () => {
        const top = parent ? parent.getBoundingClientRect().top : 0
        const visible = parent ? parent.clientHeight - parseFloat(getComputedStyle(parent).paddingBottom || '0') : window.innerHeight
        const offset = node.getBoundingClientRect().top - top + (parent?.scrollTop ?? 0)
        setHeight(Math.max(320, Math.floor(visible - offset)))
      }
      measure()
      const observer = parent && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
      if (parent) observer?.observe(parent)
      window.addEventListener('resize', measure)
      stop.current = () => {
        observer?.disconnect()
        window.removeEventListener('resize', measure)
      }
    },
    [on],
  )
  useEffect(() => () => stop.current?.(), [])
  return [ref, height] as const
}

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
  // Desktop: the list is a thin bar for now (a spec's review needs its
  // room); clicking the bar brings it back.
  listFolded?: { label: string; onUnfold: () => void }
  // Desktop: the list and detail fill the height on screen and each scroll
  // on their own, so the page itself does not scroll. The detail then lays
  // out its own fixed top and scrolling body (a column of height 100%).
  fill?: boolean
}) {
  const phone = usePhone()
  const [fillRef, fillHeight] = useFillHeight(Boolean(props.fill) && !phone)
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
      <div
        ref={fillRef}
        data-list-pane={props.id}
        data-list-only
        data-list-fill={fillHeight !== null ? '' : undefined}
        style={fillHeight !== null ? { height: fillHeight, minHeight: 0, overflowY: 'auto', position: 'relative' } : undefined}
      >
        {props.list}
      </div>
    )
  // One tree whether the list is folded or not, so the detail stays
  // mounted when the list folds. A folded list is hidden, not unmounted:
  // it fills the nav's filters.
  const folded = props.listFolded
  return (
    <div
      ref={fillRef}
      data-list-detail={props.id}
      data-list-folded={folded ? '' : undefined}
      data-list-fill={fillHeight !== null ? '' : undefined}
      style={{ display: 'flex', alignItems: 'stretch', height: fillHeight ?? '100%', minHeight: 0 }}
    >
      <div
        ref={column}
        data-list-pane={props.id}
        hidden={Boolean(folded)}
        style={{ flex: `0 0 ${width}px`, width, minWidth: 0, minHeight: 0, overflowY: 'auto', position: 'relative', paddingRight: 4, display: folded ? 'none' : undefined }}
      >
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
        <PlainButton
          type="button"
          data-list-unfold={props.id}
          aria-label={folded.label}
          onClick={folded.onUnfold}
          css-flex={`0 0 ${LIST_FOLDED_WIDTH}px`}
          css-width={LIST_FOLDED_WIDTH}
          css-display="flex"
          css-justify-content="center"
          css-padding="10px-0"
          css-background="none"
          css-border="0"
          css-border-radius="6"
          css-color="muted"
          css-cursor="pointer"
          css-font-size="12.5"
          css-font-weight="500"
        >
          <Box as="span" css-writing-mode="vertical-rl" css-transform="rotate-180deg" css-white-space="nowrap">
            {folded.label}
          </Box>
        </PlainButton>
      )}
      <div
        data-detail-column={props.id}
        style={{
          flex: '1 1 0%',
          minWidth: 0,
          minHeight: 0,
          paddingLeft: 12,
          borderLeft: '1px solid var(--border)',
          ...(fillHeight !== null ? { display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' } : { overflowY: 'auto' }),
        }}
      >
        {props.detail}
      </div>
    </div>
  )
}
