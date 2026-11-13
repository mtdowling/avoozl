import type { ReactNode } from 'react'
import { FilterPanel, useStoredFilter, writeStored } from './FilterPanel.tsx'
import { FILTER_EVENT, changed, filterActive, readFilter, writeFilter, type TaskFilter, type filterChoices } from './filters.ts'
import type { NodeState } from './graph-layout.ts'
import { optionItems } from './picker.ts'

const TASK_STORE = { event: FILTER_EVENT, read: readFilter, write: writeFilter, empty: {} as TaskFilter }

// The workspace's shared task filter. A change on one tab reaches the other
// through storage and one window event.
export function useSharedFilter(workspaceId: string | null): [TaskFilter, (next: TaskFilter) => void] {
  return useStoredFilter(workspaceId, TASK_STORE)
}

// Set the shared filter from outside the tabs (a Plans row, a Dashboard
// count), before the tab opens.
export function setSharedFilter(workspaceId: string, filter: TaskFilter) {
  writeStored(TASK_STORE, workspaceId, filter)
}

// The Graph and Delivery task filter: search, plan, epic, repository, state,
// wave range, owner and Needs me, in the shared filter panel.
export function FilterBar(props: {
  id: string
  filter: TaskFilter
  choices: ReturnType<typeof filterChoices>
  onChange: (filter: TaskFilter) => void
  children?: ReactNode
}) {
  const { filter, choices } = props
  const set = (change: Partial<TaskFilter>) => props.onChange(changed(filter, change))
  return (
    <FilterPanel
      id={props.id}
      label="Filter tasks"
      active={filterActive(filter)}
      onClear={() => props.onChange({})}
      fields={[
        { kind: 'search', key: 'q', label: 'Search', value: filter.q ?? '', placeholder: 'Task name or ID', onChange: (q) => set({ q }) },
        { kind: 'pick', key: 'plan', label: 'Plan', value: filter.plan ?? '', items: optionItems(choices.plans), onChange: (plan) => set({ plan }) },
        { kind: 'select', key: 'epic', label: 'Epic', value: filter.epic ?? '', options: choices.epics, onChange: (epic) => set({ epic }) },
        {
          kind: 'select',
          key: 'repository',
          label: 'Repository',
          value: filter.repository ?? '',
          options: choices.repositories,
          onChange: (repository) => set({ repository }),
        },
        {
          kind: 'select',
          key: 'state',
          label: 'State',
          value: filter.state ?? '',
          options: choices.states,
          onChange: (state) => set({ state: (state || undefined) as NodeState | undefined }),
        },
        {
          kind: 'range',
          key: 'wave',
          label: 'Wave',
          min: filter.waveMin,
          max: filter.waveMax,
          limit: choices.waves,
          onChange: (waveMin, waveMax) => set({ waveMin, waveMax }),
        },
        {
          kind: 'select',
          key: 'authority',
          label: 'Owner',
          value: filter.authority ?? '',
          options: choices.authorities,
          onChange: (authority) => set({ authority }),
        },
        { kind: 'check', key: 'needs-you', label: 'Needs me', checked: Boolean(filter.needsYou), onChange: (needsYou) => set({ needsYou }) },
        { kind: 'check', key: 'archived', label: 'Show archived', checked: Boolean(filter.archived), onChange: (archived) => set({ archived }) },
      ]}
    >
      {props.children}
    </FilterPanel>
  )
}
