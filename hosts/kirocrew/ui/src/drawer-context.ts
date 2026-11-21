// How any view opens the shared task drawer: `openTask(id)` shows a task,
// `openReview(group)` lists a review
// group's tasks. App.tsx provides it; views only call it, so this file
// imports no view.
import { createContext, useContext } from 'react'
import type { ConflictItem } from './views-api.ts'
import type { TaskTab } from './task-api.ts'

export interface TaskDrawerApi {
  // `tab` opens a tab other than Overview.
  openTask(id: string, tab?: TaskTab): void
  // `onReviewed` runs after Mark reviewed, so the caller can reload.
  openReview(group: ConflictItem, onReviewed?: () => void): void
  // Closes whatever the drawer shows.
  close(): void
}

export const TaskDrawerContext = createContext<TaskDrawerApi>({
  openTask: () => undefined,
  openReview: () => undefined,
  close: () => undefined,
})

export const useTaskDrawer = () => useContext(TaskDrawerContext)
