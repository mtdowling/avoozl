// The task drawer's Evidence section (design §4.22, R76.3): what the task
// found, decided and checked, newest first. An attached image or video
// loads only when a person asks for it.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import Badge from './Badge.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { EVIDENCE_LABELS, evidenceClient, mediaUrl, sizeText, type EvidenceEntry } from './evidence-api.ts'

function Attachment({ workspaceId, taskId, entry }: { workspaceId: string; taskId: string; entry: EvidenceEntry }) {
  const api = useAppApi()
  const client = useMemo(() => evidenceClient(api), [api])
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = entry.file!
  const show = async () => {
    try {
      const got = await client.file(workspaceId, taskId, file.name)
      const made = mediaUrl(got.file, got.base64)
      if (!made) setError('This file type is not shown here.')
      setUrl(made)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  if (url)
    return file.type.startsWith('video/') ? (
      <video controls src={url} className="mt-1 max-w-full rounded" aria-label={entry.text} />
    ) : (
      <img src={url} alt={entry.text} className="mt-1 max-w-full rounded border" style={{ borderColor: 'var(--border)' }} />
    )
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>
        {file.type}, {sizeText(file.size)}
      </span>
      <button type="button" className="underline" onClick={() => void show()}>
        Show {file.type.startsWith('video/') ? 'video' : 'image'}
      </button>
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </div>
  )
}

export function EvidenceFold({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const api = useAppApi()
  const client = useMemo(() => evidenceClient(api), [api])
  const load = useCallback(() => client.list(workspaceId, taskId), [client, workspaceId, taskId])
  const { value, error } = useRead<EvidenceEntry[]>(`${workspaceId}:${taskId}`, load)
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  if (!value.length) return <p className="text-sm text-muted">No evidence yet.</p>
  return (
    <ol className="flex flex-col gap-2" data-evidence={taskId}>
      {value.map((entry) => (
        <li key={entry.id} className="rounded border p-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{EVIDENCE_LABELS[entry.kind] ?? entry.kind}</Badge>
            <span>{entry.source}</span>
            <time dateTime={entry.at}>{relativeTime(entry.at)}</time>
            {entry.redacted && <span>Redacted by content rules</span>}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.text}</p>
          {entry.file && <Attachment workspaceId={workspaceId} taskId={taskId} entry={entry} />}
        </li>
      ))}
    </ol>
  )
}
