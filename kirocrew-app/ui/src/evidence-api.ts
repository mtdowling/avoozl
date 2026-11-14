// The task drawer's Evidence section (design §4.22, R76.3): the task's
// bundle from task.evidence, newest first, and one attachment on request.
// Kept free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type EvidenceKind = 'findings' | 'falsifier' | 'decision' | 'review' | 'check' | 'file' | 'note'

export interface EvidenceFile {
  name: string
  type: string
  size: number
  sha256: string
}

export interface EvidenceEntry {
  id: string
  kind: EvidenceKind
  at: string
  source: string
  text: string
  redacted?: boolean
  file?: EvidenceFile
}

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  findings: 'Findings',
  falsifier: 'Falsifier',
  decision: 'Decision',
  review: 'Review',
  check: 'Check',
  file: 'File',
  note: 'Note',
}

export function evidenceClient(api: AppApi) {
  const run = async <T>(input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation: 'task.evidence', input, workspaceId })).result
  return {
    list: (workspaceId: string, taskId: string) => run<{ taskId: string; entries: EvidenceEntry[] }>({ taskId }, workspaceId).then((r) => r.entries),
    file: (workspaceId: string, taskId: string, file: string) =>
      run<{ file: EvidenceFile; base64: string }>({ taskId, file }, workspaceId),
  }
}

// A data URL for an image or video the bundle holds; null for any other
// type, so nothing else is ever rendered inline.
export function mediaUrl(file: EvidenceFile, base64: string): string | null {
  if (!/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime))$/.test(file.type)) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null
  return `data:${file.type};base64,${base64}`
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
