// Settings › Epic context (epic-context EC9.4): this machine's epicContext
// block, each machine plugin's context part with its state, and the last
// ten sessions that got context with their three tests. The block is edited
// here or with avoozl context set; both are a person's act.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Box } from './ui/Box'
import { ErrorText } from './ui/ErrorText'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Hint } from './ui/Hint'
import { PlainTextarea } from './ui/Plain'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TipBtn } from './ui/controls.tsx'
import { ContextPartFacts } from './ContextPart.tsx'
import { contextClient, testLine, type ContextSession, type ContextView, type MachineContext } from './context-api.ts'
import { errorMessage } from './workspace-api.ts'

function Machine(props: { block: MachineContext | null; workspaceId: string; onSaved: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => contextClient(api), [api])
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const edit = () => {
    setText(JSON.stringify(props.block ?? { repos: ['acme/*'] }, null, 2))
    setProblem(null)
    setEditing(true)
  }
  const save = async () => {
    let value: MachineContext | null
    try {
      value = text.trim() ? (JSON.parse(text) as MachineContext) : null
    } catch {
      return setProblem('Write the block as JSON.')
    }
    try {
      await client.setMachine(props.workspaceId, value)
      setEditing(false)
      props.onSaved()
    } catch (caught) {
      setProblem(errorMessage(caught))
    }
  }
  return (
    <FieldGroup title="This machine" boxed>
      <Stack gap={2} data-context-machine>
        {editing ? (
          <>
            <PlainTextarea
              aria-label="epicContext block"
              spellCheck={false}
              value={text}
              rows={12}
              onChange={(e) => setText(e.target.value)}
              css-font-family="mono-monospace"
              css-font-size="12"
              data-context-machine-text
            />
            {problem ? <ErrorText size="xs">{problem}</ErrorText> : null}
            <Row gap={2}>
              <TipBtn tooltip="Save the block in this machine's config.json" primary onClick={() => void save()}>
                Save
              </TipBtn>
              <TipBtn tooltip="Keep the block as it is" onClick={() => setEditing(false)}>
                Cancel
              </TipBtn>
            </Row>
          </>
        ) : props.block ? (
          <>
            <Hint size="xs">Repositories: {props.block.repos.join(', ')}</Hint>
            <Hint size="xs">Read-only folders: {props.block.reads?.length ? props.block.reads.join(', ') : 'none'}</Hint>
            <Hint size="xs">MCP servers: {props.block.mcp && Object.keys(props.block.mcp).length ? Object.keys(props.block.mcp).join(', ') : 'none'}</Hint>
            <Hint size="xs">Content rule sets: {props.block.contentSets?.length ? props.block.contentSets.join(', ') : 'none'}</Hint>
          </>
        ) : (
          <Hint size="xs">No epicContext block. A worker gets only what a plugin gives.</Hint>
        )}
        {!editing && (
          <Row gap={2}>
            <TipBtn tooltip="Change the epicContext block of this machine's config.json" onClick={edit} data-context-edit>
              Edit
            </TipBtn>
          </Row>
        )}
      </Stack>
    </FieldGroup>
  )
}

function Session(props: { session: ContextSession }) {
  const { session } = props
  return (
    <Box as="li" flex flexCol gap="0.5" data-context-session={session.taskId}>
      <Box as="span" weight="semibold">
        {session.resumed ? 'Resumed' : 'Started'} {session.taskId}
        {session.briefOnly ? ' (brief only)' : ''}
      </Box>
      <Hint size="xs">{session.tests.map(testLine).join('; ') || 'no tests run'}</Hint>
      {session.given ? <Hint size="xs">Given: {session.items || 'nothing'}</Hint> : null}
      {session.left.length > 0 ? <Hint size="xs">Left out: {session.left.map((l) => `${l.item} (${l.why})`).join(', ')}</Hint> : null}
    </Box>
  )
}

export function EpicContextSettings(props: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => contextClient(api), [api])
  const [view, setView] = useState<ContextView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { workspaceId } = props
  const read = useCallback(() => {
    client.get(workspaceId).then(setView, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId])
  useEffect(read, [read])
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    fn()
      .then(read, (caught) => setError(errorMessage(caught)))
      .finally(() => setBusy(false))
  }
  if (!view) return error ? <ErrorText role="alert">{error}</ErrorText> : null
  return (
    <Stack gap={4} data-epic-context-settings>
      <Machine block={view.machine} workspaceId={workspaceId} onSaved={read} />
      <FieldGroup title="Plugins" boxed>
        <Stack gap={3}>
          {view.plugins.length === 0 && <Hint size="xs">No plugin on this machine provides a context part. Add one in Plugins.</Hint>}
          {view.plugins.map((plugin) => (
            <FieldGroup key={plugin.id} level={4} title={`${plugin.id} ${plugin.version}`}>
              <ContextPartFacts plugin={plugin.id} part={plugin} busy={busy} act={act} workspaceId={workspaceId} />
            </FieldGroup>
          ))}
        </Stack>
      </FieldGroup>
      <FieldGroup title="Last sessions with context" boxed>
        {view.sessions.length ? (
          <Box as="ul" flex flexCol gap="2" size="xs">
            {view.sessions.map((session) => (
              <Session key={`${session.taskId}-${session.at}`} session={session} />
            ))}
          </Box>
        ) : (
          <Hint size="xs">No session has got epic context yet.</Hint>
        )}
      </FieldGroup>
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </Stack>
  )
}
