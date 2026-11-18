// The spec page's task graph: the Graph's own Frontier and Focus tree
// (FocusTree.tsx), fed this spec's tasks. Frontier is the default; the toggle
// shows the spec's whole Focus tree, where a click drills into a task's chain.
// No call of its own: the page already holds this spec's graph.view reply.
import { useMemo, useState } from 'react'
import { frontier, specGraphHref, type TreeRoot } from './focus-tree.ts'
import { FocusTreeView, Frontier, ItemModal } from './FocusTree.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { linkHref, type Graph } from './views-api.ts'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Box } from './ui/Box'

type Mode = 'frontier' | 'tree'

// `only` fixes the view (Overview shows the Frontier, Tasks the whole tree) and
// hides the toggle; `onTasks` is where a Frontier's "open tree" goes then.
export function SpecGraph(props: { graph: Graph | null; planId: string; only?: Mode; onTasks?: () => void }) {
  const { graph, planId } = props
  const [chosen, setMode] = useState<Mode>('frontier')
  const mode = props.only ?? chosen
  const [root, setRoot] = useState<TreeRoot>({ kind: 'spec', id: planId })
  const [modal, setModal] = useState<TreeRoot | null>(null)
  const drawer = useTaskDrawer()
  const lists = useMemo(() => (graph ? frontier(graph) : null), [graph])
  // The Graph's own deep link to this spec's tree.
  const href = specGraphHref(window.location.pathname, planId)
  const openItem = (item: TreeRoot) => {
    const task = item.kind === 'task' ? graph?.tasks.find((t) => t.id === item.id) : undefined
    if (task && !task.draft) drawer.openTask(task.id)
    else setModal(item)
  }
  const drill = (next: TreeRoot) => {
    if (props.only === 'frontier') return props.onTasks?.()
    setRoot(next)
    setMode('tree')
  }
  const tab = (key: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === key}
      data-spec-graph-tab={key}
      onClick={() => (key === 'tree' ? drill({ kind: 'spec', id: planId }) : setMode('frontier'))}
      className="h-6 cursor-pointer whitespace-nowrap rounded-sm border px-3 text-[11px]"
      style={mode === key ? { borderColor: 'var(--border-strong, var(--border))', color: 'var(--accent)', background: 'var(--card)' } : { borderColor: 'transparent', color: 'var(--muted)', background: 'transparent' }}
    >
      {label}
    </button>
  )
  return (
    <Box flex minW0 flexCol gap="2" data-spec-graph>
      {!graph ? (
        <Hint as="p" size="sm" role="status">
          Loading…
        </Hint>
      ) : graph.tasks.length === 0 ? (
        <Hint as="p" size="sm">No task yet.</Hint>
      ) : (
        <>
          <Row gap={2}>
            {!props.only && (
              <Row role="tablist" aria-label="Spec graph views" gap={1} wrap={false}>
                {tab('frontier', 'Frontier')}
                {tab('tree', 'Focus tree')}
              </Row>
            )}
            {href && (
              <a href={linkHref(href)} className="ml-auto text-xs underline underline-offset-2" style={{ color: 'var(--accent)' }} data-spec-graph-open>
                Open in Graph →
              </a>
            )}
          </Row>
          <Box minW0 overflow="x-auto" data-spec-graph-body>
            {mode === 'frontier' ? (
              <Frontier ready={lists!.ready} waiting={lists!.waiting} onOpenTree={(id) => drill({ kind: 'task', id })} onOpen={(id) => openItem({ kind: 'task', id })} />
            ) : (
              <FocusTreeView graph={graph} root={root} onReRoot={drill} onOpen={openItem} />
            )}
          </Box>
        </>
      )}
      {modal && graph && <ItemModal graph={graph} item={modal} onClose={() => setModal(null)} onTree={(next) => (setModal(null), drill(next))} />}
    </Box>
  )
}
