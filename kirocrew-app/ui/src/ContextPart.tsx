// A plugin's context part on the page (epic-context EC4.1): what a person
// approves before it gives anything. Read-only in the Add plugin preview;
// with `workspaceId` the asks and server mappings can be set. Every value is
// the plugin's own text or this machine's, rendered as text.
import { useMemo, useState } from 'react'
import Badge from './ui/Badge.tsx'
import { Input } from './ui/Input'
import { MappingForm } from './MappingForm.tsx'
import { TipBtn } from './ui/controls.tsx'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { useAppApi } from './host.ts'
import { contextClient, parseServerMapping, stateWords, type ContextPart } from './context-api.ts'

function Ask(props: { plugin: string; ask: ContextPart['ask'][number]; busy: boolean; act: (fn: () => Promise<unknown>) => void; workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => contextClient(api), [api])
  const [value, setValue] = useState(props.ask.answer ?? '')
  return (
    <Box as="li" flex flexCol gap="1" data-context-ask={props.ask.name}>
      <Hint size="xs">{props.ask.question}</Hint>
      <Row gap={2}>
        <Input aria-label={props.ask.question} value={value} placeholder="~/src/acme/team-notes" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} />
        <TipBtn
          tooltip="Save your answer on this machine. The plugin needs approving again."
          disabled={props.busy || !value.trim() || value === props.ask.answer}
          onClick={() => props.act(() => client.answer(props.workspaceId, props.plugin, props.ask.name, value.trim()))}
          data-save-answer
        >
          Save answer
        </TipBtn>
      </Row>
    </Box>
  )
}

function Server(props: { plugin: string; server: ContextPart['servers'][number]; busy: boolean; act: (fn: () => Promise<unknown>) => void; workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => contextClient(api), [api])
  const { server } = props
  const [editing, setEditing] = useState(false)
  const [command, setCommand] = useState(server.replaced ? JSON.stringify(server.command) : '')
  const [env, setEnv] = useState(server.env.join(', '))
  const [problem, setProblem] = useState<string | null>(null)
  const save = () => {
    const parsed = parseServerMapping(command, env)
    if ('error' in parsed) return setProblem(parsed.error)
    setProblem(null)
    setEditing(false)
    if (props.workspaceId) {
      const workspaceId = props.workspaceId
      props.act(() => client.map(workspaceId, props.plugin, server.alias, parsed.env, parsed.command))
    }
  }
  return (
    <Box as="li" flex flexCol gap="1" data-context-server={server.alias}>
      <Row gap={2}>
        <Box as="span" weight="semibold">
          {server.alias}
        </Box>
        <Hint size="xs">{server.about}</Hint>
      </Row>
      <Hint size="xs">
        Runs <code>{server.command.join(' ')}</code>
        {server.replaced ? ' (this machine’s own command)' : ''}
        {server.env.length ? (
          <>
            {' '}
            and may read <code>{server.env.join(', ')}</code>
          </>
        ) : null}
        .{server.mapped ? '' : ' Not mapped on this machine yet.'}
      </Hint>
      {props.workspaceId ? (
        <MappingForm
          alias={server.alias}
          busy={props.busy}
          editing={editing}
          setEditing={setEditing}
          command={command}
          setCommand={setCommand}
          commandPlaceholder="Empty runs the plugin’s own command"
          env={env}
          setEnv={setEnv}
          envPlaceholder="RESEARCH_TOKEN"
          openTip="Name the environment variables this server may read. No credential goes in it."
          problem={problem}
          onSave={save}
          openAttribute="data-set-context-mapping"
        />
      ) : null}
    </Box>
  )
}

export function ContextPartFacts(props: { plugin: string; part: ContextPart; busy?: boolean; act?: (fn: () => Promise<unknown>) => void; workspaceId?: string | null }) {
  const { part } = props
  const busy = props.busy ?? false
  const act = props.act ?? (() => undefined)
  const workspaceId = props.workspaceId ?? null
  return (
    <Stack gap={2} data-plugin-context>
      <Row gap={2}>
        <Badge variant={part.state === 'approved' ? 'success' : 'warning'}>{stateWords(part.state)}</Badge>
        {part.ignored ? <Hint size="xs">{part.ignored}</Hint> : null}
      </Row>
      <Hint size="xs">Gives context on its owner's own approved spec tasks in: {part.repos.join(', ')}</Hint>
      {part.skills.length > 0 && (
        <Box as="ul" flex flexCol gap="1" size="xs" data-context-skills>
          {part.skills.map((skill) => (
            <Box as="li" key={skill.name}>
              <Box as="span" weight="semibold">
                {skill.name}
              </Box>{' '}
              {skill.description}{' '}
              <Hint as="span" size="xs">
                SKILL.md {skill.hash.slice(0, 12)}
              </Hint>
            </Box>
          ))}
        </Box>
      )}
      {part.reads.length > 0 && (
        <Box as="ul" flex flexCol gap="1" size="xs" data-context-reads>
          {part.reads.map((read) => (
            <Box as="li" key={read.id}>
              {read.about}: <code>{read.written}</code>
              {read.written !== read.filled ? (
                <>
                  {' '}
                  is <code>{read.filled}</code> here
                </>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
      {part.ask.length > 0 && (
        <Box as="ul" flex flexCol gap="2" size="xs" data-context-asks>
          {part.ask.map((ask) =>
            workspaceId ? (
              <Ask key={ask.name} plugin={props.plugin} ask={ask} busy={busy} act={act} workspaceId={workspaceId} />
            ) : (
              <Box as="li" key={ask.name}>
                {ask.question}
              </Box>
            ),
          )}
        </Box>
      )}
      {part.servers.length > 0 && (
        <Box as="ul" flex flexCol gap="2" size="xs" data-context-servers>
          {part.servers.map((server) => (
            <Server key={server.alias} plugin={props.plugin} server={server} busy={busy} act={act} workspaceId={workspaceId} />
          ))}
        </Box>
      )}
      {part.contentSets.length > 0 && <Hint size="xs">Content rule sets that also check this task's diff, GitHub writes and briefs: {part.contentSets.join(', ')}</Hint>}
    </Stack>
  )
}
