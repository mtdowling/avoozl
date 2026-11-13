// How any view opens the shared task drawer: `openTask(id)` shows a task,
// `addTask()` opens the new-task form, `openReview(group)` lists a review
// group's tasks. App.tsx provides it; views only call it, so this file
// imports no view.
import { createContext, useContext } from 'react'
import type { ConflictItem } from './views-api.ts'

export interface TaskDrawerApi {
  openTask(id: string): void
  addTask(prefill?: { prerequisite?: string }): void
  // `onReviewed` runs after Mark reviewed, so the caller can reload.
  openReview(group: ConflictItem, onReviewed?: () => void): void
}

export const TaskDrawerContext = createContext<TaskDrawerApi>({
  openTask: () => undefined,
  addTask: () => undefined,
  openReview: () => undefined,
})

export const useTaskDrawer = () => useContext(TaskDrawerContext)
