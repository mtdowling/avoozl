// Flow's sort and filters as rows and chips in the left nav, drawn as the
// Specs rail draws them (NavRail.tsx): no dropdowns. They set the same stored
// filter the charts read, so every chart, bar and total follows a pick.
import { NavSlotFor } from './nav-slot.tsx'
import { RailBlock, RailChips, RailRow, RailSortList, RailStyle, type RailSort } from './NavRail.tsx'
import { ArrowUpDown, CaseSensitive, Clock, Gauge, Layers, ListFilter, Tag, Workflow, X } from './icons.ts'
import { FLOW_SORT_FIRST, WINDOW_OPTIONS, filterActive, flowChoices, type FlowFilter, type FlowOrder, type FlowSort } from './flow-api.ts'
import { PlainButton } from './ui/Plain'

const SORTS: RailSort<FlowSort>[] = [
  { key: 'recent', label: 'Newest', icon: Clock },
  { key: 'lead', label: 'Lead time', icon: Gauge },
  { key: 'task', label: 'Task', icon: CaseSensitive },
]

export function FlowRail(props: {
  filter: FlowFilter
  onFilter: (filter: FlowFilter) => void
  order: FlowOrder
  onOrder: (order: FlowOrder) => void
  choices: ReturnType<typeof flowChoices>
}) {
  const { filter, order, choices } = props
  const set = (change: Partial<FlowFilter>) => {
    const next: Record<string, unknown> = { ...filter, ...change }
    for (const key of Object.keys(next)) if (!next[key]) delete next[key]
    props.onFilter(next as FlowFilter)
  }
  const size = filter.window ?? '20'
  return (
    <NavSlotFor section="flow">
      <div role="search" aria-label="Filter flow timing" data-nav-filters="avoozl-flow" data-filter-panel="avoozl-flow" data-rail>
        <RailStyle />
        <RailBlock first id="sort" icon={ArrowUpDown} title="Sort">
          <RailSortList fields={SORTS} sort={order.sort} dir={order.dir} onSort={(sort) => props.onOrder(sort === order.sort ? { sort, dir: order.dir === 'asc' ? 'desc' : 'asc' } : { sort, dir: FLOW_SORT_FIRST[sort] })} />
        </RailBlock>
        <RailBlock
          id="filters"
          icon={ListFilter}
          title="Filters"
          action={
            filterActive(filter) && (
              <PlainButton type="button" data-rail-icon onClick={() => props.onFilter({})} css-gap="2" css-align-items="center" css-font-size="12">
                <X size={11} aria-hidden="true" /> Clear
              </PlainButton>
            )
          }
        >
          {WINDOW_OPTIONS.map((option) => (
            <RailRow key={option.value} label={option.label} active={size === option.value} onClick={() => set({ window: option.value === '20' ? undefined : option.value })} attrs={{ 'data-rail-window': option.value }} />
          ))}
        </RailBlock>
        <RailChips id="repositories" icon={Workflow} title="Repositories" noun="repository" items={choices.repositories} picked={filter.repository} onPick={(repository) => set({ repository })} />
        <RailChips id="plans" icon={Tag} title="Specs" noun="spec" items={choices.plans} picked={filter.plan} onPick={(plan) => set({ plan, phase: undefined })} />
        {filter.plan && <RailChips id="phases" icon={Layers} title="Phases" noun="phase" items={choices.phases} picked={filter.phase} onPick={(phase) => set({ phase })} />}
        <RailChips id="stages" icon={Gauge} title="Stages" noun="stage" items={choices.stages} picked={filter.stage} onPick={(stage) => set({ stage })} />
        <RailChips id="epics" icon={Layers} title="Epics" noun="epic" items={choices.epics} picked={filter.epic} onPick={(epic) => set({ epic })} />
      </div>
    </NavSlotFor>
  )
}
