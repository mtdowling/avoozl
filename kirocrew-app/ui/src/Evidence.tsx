// The task drawer's Evidence section (design §4.22, R76.3): what the task
// found, decided and checked, newest first. An attached image or video
// loads only when a person asks for it.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { SectionBox } from './ui/controls.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { EVIDENCE_LABELS, evidenceClient, mediaUrl, sizeText, type EvidenceEntry } from './evidence-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

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
    <Box mt="1" flex flexWrap items="center" gap="2" size="xs" tone="muted">
      <span>
        {file.type}, {sizeText(file.size)}
      </span>
      <button type="button" className="underline" onClick={() => void show()}>
        Show {file.type.startsWith('video/') ? 'video' : 'image'}
      </button>
      {error && (
        <ErrorText role="alert" as="span">
          {error}
        </ErrorText>
      )}
    </Box>
  )
}

// With `box`, the section draws only when there is evidence: nothing while it
// loads and nothing when there is none.
export function EvidenceFold({ workspaceId, taskId, box }: { workspaceId: string; taskId: string; box?: { id: string; title: string } }) {
  const api = useAppApi()
  const client = useMemo(() => evidenceClient(api), [api])
  const load = useCallback(() => client.list(workspaceId, taskId), [client, workspaceId, taskId])
  const { value, error } = useRead<EvidenceEntry[]>(`${workspaceId}:${taskId}`, load)
  if (error)
    return (
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (box && !value?.length) return null
  if (!value) return <Hint as="p" size="sm">Loading…</Hint>
  if (!value.length) return <Hint as="p" size="sm">No evidence yet.</Hint>
  const list = (
    <Stack as="ol" gap={2} data-evidence={taskId}>
      {value.map((entry) => (
        <Box key={entry.id} as="li" css-border-color="border" rounded="base" border="all" p="2">
          <Box flex flexWrap items="center" gap="2" size="xs" tone="muted">
            <Badge>{EVIDENCE_LABELS[entry.kind] ?? entry.kind}</Badge>
            <span>{entry.source}</span>
            <time dateTime={entry.at}>{relativeTime(entry.at)}</time>
            {entry.redacted && <span>Redacted by content rules</span>}
          </Box>
          <Box as="p" mt="1" whitespace="pre-wrap" breakWords size="sm">{entry.text}</Box>
          {entry.file && <Attachment workspaceId={workspaceId} taskId={taskId} entry={entry} />}
        </Box>
      ))}
    </Stack>
  )
  return box ? <SectionBox id={box.id} title={box.title}>{list}</SectionBox> : list
}
