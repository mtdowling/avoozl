// The Forward screen's client. Two operations: the read
// that shows the exact public diff, title and body, and the push that carries
// the hash the person saw.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ForwardReview {
  diff: string
  title: string
  body: string
  hash: string
  commit: string
  branch: string
  // "owner/repository:branch", where the public pull request goes.
  target: string
  person: string
  paths: string[]
}

export interface ForwardAnswer {
  ok: boolean
  // The checks refused the change; `reason` names the rule, never the text.
  blocked?: boolean
  // What was shown no longer matches; `review` is the new one.
  changed?: boolean
  // An open Stop the line: its reason. Forward stays off until a person resumes.
  stopped?: string
  reason?: string
  review?: ForwardReview
  record?: { state: string; publicPr?: number | null }
}

export function forwardClient(api: Pick<AppApi, 'post'>) {
  const run = async (operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: ForwardAnswer }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    review: (workspaceId: string, id: string) => run('mirror.forward.review', { id }, workspaceId),
    push: (workspaceId: string, id: string, seenHash: string) => run('mirror.forward', { id, seenHash }, workspaceId),
  }
}

// What the screen says after a push.
export function forwardOutcome(answer: ForwardAnswer): string {
  if (answer.stopped) return `Forwarding is stopped: ${answer.stopped}`
  if (answer.changed) return 'The change differs from what you reviewed. Review the new one below.'
  if (answer.blocked) return answer.reason ?? 'The checks blocked this change. Nothing was pushed.'
  const number = answer.record?.publicPr
  return number ? `Forwarded. Public pull request #${number} is open.` : 'Forwarded.'
}
