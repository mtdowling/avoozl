// Checks from a plugin on the page (plugin-checks D10): what a person
// reviews in Settings › Plugins before approving a checks part, a task's
// plugin check results with its decide answers (Run it, Skip it), and the
// phase and branch results. Every value is the plugin's or the check's own
// text, rendered as text.
import { useCallback, useMemo, useState } from 'react'
import Badge from './ui/Badge.tsx'
import { Input } from './ui/Input'
import { TipBtn } from './ui/controls.tsx'
import { Card } from './ui/Card'
import { SectionHeading } from './ui/controls.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  RESULT_VARIANT,
  decideLine,
  parseMapping,
  pluginChecksClient,
  resultLine,
  stepLine,
  type PluginCheckDef,
  type PluginChecksPart,
  type StageRun,
  type TaskPluginChecks,
} from './plugin-checks-api.ts'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box contents>
      <Hint as="dt">{label}</Hint>
      <Box as="dd" breakAll>
        {children}
      </Box>
    </Box>
  )
}

function Text({ text }: { text: string | null }) {
  return (
    <Box as="pre" css-border-color="border" mt="1" overflow="auto" whitespace="pre-wrap" breakWords rounded="base" border="all" p="2" size="xs">
      {text ?? '(could not be read)'}
    </Box>
  )
}

function CheckFacts({ check }: { check: PluginCheckDef }) {
  const step = check.step
  return (
    <Box as="li" flex flexCol gap="1" data-plugin-check={check.name}>
      <Row gap={2}>
        <Box as="span" weight="semibold">
          {check.name}
        </Box>
        <Badge>{check.stage} stage</Badge>
        <Badge variant={step.kind === 'mcp' ? 'info' : undefined}>{step.kind === 'mcp' ? 'MCP step' : 'run step'}</Badge>
      </Row>
      <Box as="dl" css-grid-template-columns="auto-1fr" grid gapX="3" gapY="1" size="xs">
        <Fact label="Repositories">
          <code>{check.repos.join(', ')}</code>
        </Fact>
        <Fact label="Paths">{check.paths ? <code>{check.paths.join(', ')}</code> : 'every change'}</Fact>
        <Fact label={step.kind === 'mcp' ? 'Calls' : 'Runs'}>
          <code>{stepLine(step)}</code>
        </Fact>
        {step.kind === 'run' && (
          <>
            <Fact label="Environment">{step.env?.length ? <code>{step.env.join(', ')}</code> : 'basics only'}</Fact>
            <Fact label="Network">{step.network ? 'on' : 'off'}</Fact>
          </>
        )}
        {step.kind === 'mcp' && (
          <Fact label="Arguments">
            <code>{JSON.stringify({ start: step.start?.args ?? {}, ...(step.poll ? { poll: step.poll.args ?? {} } : {}) })}</code>
          </Fact>
        )}
        <Fact label="Timeout">{check.timeout ? `${check.timeout} s` : 'the repository default'}</Fact>
        <Fact label="Applies here to">{check.appliesTo.length ? check.appliesTo.join(', ') : 'no registered repository'}</Fact>
      </Box>
      {step.kind === 'mcp' &&
        Object.entries(step.files ?? {}).map(([name, text]) => (
          <div key={name} data-plugin-check-file={name}>
            <Hint size="xs">Sends {name}:</Hint>
            <Text text={text} />
          </div>
        ))}
      {check.decide && (
        <div data-plugin-check-decide>
          <Hint size="xs">
            Decide prompt {check.decide.file}, asked at {check.decide.at.join(' and ')}:
          </Hint>
          <Text text={check.decide.text} />
        </div>
      )}
    </Box>
  )
}

function ServerMapping(props: { plugin: string; server: PluginChecksPart['servers'][number]; busy: boolean; act: (fn: () => Promise<unknown>) => void; workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => pluginChecksClient(api), [api])
  const [editing, setEditing] = useState(false)
  const [command, setCommand] = useState(JSON.stringify(props.server.mapping?.command ?? []))
  const [env, setEnv] = useState((props.server.mapping?.env ?? []).join(', '))
  const [problem, setProblem] = useState<string | null>(null)
  const save = () => {
    const parsed = parseMapping(command, env)
    if ('error' in parsed) return setProblem(parsed.error)
    setProblem(null)
    setEditing(false)
    props.act(() => client.map(props.workspaceId, props.plugin, props.server.alias, parsed.command, parsed.env))
  }
  return (
    <Box as="li" flex flexCol gap="1" data-plugin-server={props.server.alias}>
      <Row gap={2}>
        <Box as="span" weight="semibold">
          {props.server.alias}
        </Box>
        <Hint size="xs">{props.server.about}</Hint>
      </Row>
      <Hint size="xs">
        {props.server.mapping ? (
          <>
            This machine runs <code>{props.server.mapping.command.join(' ')}</code>
            {props.server.mapping.env.length ? (
              <>
                {' '}
                with <code>{props.server.mapping.env.join(', ')}</code>
              </>
            ) : null}
            .
          </>
        ) : (
          'Not mapped on this machine: its checks do not run.'
        )}
      </Hint>
      {editing ? (
        <Stack gap={2}>
          <Input aria-label={`Command for ${props.server.alias}`} value={command} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)} />
          <Input
            aria-label={`Environment names for ${props.server.alias}`}
            value={env}
            placeholder="REVIEW_TOKEN"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnv(e.target.value)}
          />
          {problem ? <ErrorText size="xs">{problem}</ErrorText> : null}
          <Row gap={2}>
            <TipBtn tooltip="Save this machine's mapping. The plugin needs approving again." primary disabled={props.busy} onClick={save}>
              Save mapping
            </TipBtn>
            <TipBtn tooltip="Keep the mapping as it is" disabled={props.busy} onClick={() => setEditing(false)}>
              Cancel
            </TipBtn>
          </Row>
        </Stack>
      ) : (
        <Row gap={2}>
          <TipBtn
            tooltip="Name the local stdio MCP server command for this alias, and the environment names it may read. No credential goes in it."
            disabled={props.busy}
            onClick={() => setEditing(true)}
            data-set-mapping
          >
            Set mapping
          </TipBtn>
        </Row>
      )}
    </Box>
  )
}

// Settings › Plugins: a checks part, everything a person approves (PK7.2).
export function PluginChecksFacts(props: { plugin: string; part: PluginChecksPart; busy: boolean; act: (fn: () => Promise<unknown>) => void; workspaceId: string }) {
  const { part } = props
  return (
    <Stack gap={2} data-plugin-checks>
      <Box as="ul" flex flexCol gap="3" size="xs">
        {part.checks.map((check) => (
          <CheckFacts key={check.name} check={check} />
        ))}
      </Box>
      {part.shadowed.map((entry) => (
        <Hint key={`s-${entry.repository}-${entry.name}`} as="p" size="xs" data-plugin-check-shadowed>
          {entry.repository} has its own check {entry.name}, so this plugin's does not run there.
        </Hint>
      ))}
      {part.clashes.map((entry) => (
        <ErrorText key={`c-${entry.repository}-${entry.name}`} size="xs">
          Plugins {entry.plugins.join(' and ')} both define {entry.name} for {entry.repository}; neither runs there.
        </ErrorText>
      ))}
      {part.servers.length > 0 && (
        <Box as="ul" flex flexCol gap="2" size="xs" data-plugin-servers>
          {part.servers.map((server) => (
            <ServerMapping key={server.alias} plugin={props.plugin} server={server} busy={props.busy} act={props.act} workspaceId={props.workspaceId} />
          ))}
        </Box>
      )}
    </Stack>
  )
}

// A task's plugin checks (PK8.1) and its decide answers with Run it and
// Skip it (PK3.5). Shows nothing for a task no plugin check touched.
export function TaskPluginChecksBox(props: { workspaceId: string; taskId: string; view: TaskPluginChecks | undefined; onChanged?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => pluginChecksClient(api), [api])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const view = props.view
  if (!view || (!view.results.length && !view.decides.length)) return null
  const flip = (check: string, plugin: string, needed: boolean) => {
    setBusy(true)
    setProblem(null)
    client
      .flip(props.workspaceId, props.taskId, check, plugin, needed, view.commit)
      .then(() => props.onChanged?.())
      .catch((caught) => setProblem(errorMessage(caught)))
      .finally(() => setBusy(false))
  }
  const decided = [...new Map(view.decides.map((answer) => [`${answer.plugin}:${answer.check}`, answer])).values()]
  return (
    <div data-task-plugin-checks>
      <Box as="h4" size="sm" weight="semibold">
        Plugin checks
      </Box>
      <Box as="ul" mt="1" flex flexCol gap="1" size="sm">
        {view.results.map((check) => (
          <Box as="li" key={`${check.plugin}-${check.name}-${check.result}`} flex flexWrap items="baseline" gapX="2" data-plugin-check-result={check.result}>
            <code>{check.name}</code>
            <Badge variant={RESULT_VARIANT[check.result]}>{resultLine(check)}</Badge>
            {check.plugin ? <Hint size="xs">from {check.plugin}</Hint> : null}
            {check.reason ? <Hint size="xs">{check.reason}</Hint> : null}
          </Box>
        ))}
      </Box>
      {view.decides.length > 0 && (
        <Box as="ul" mt="2" flex flexCol gap="1" size="xs" data-plugin-decides>
          {view.decides.map((answer, i) => (
            <li key={`${answer.check}-${answer.at}-${i}`}>
              <code>{answer.check}</code> <Hint>{decideLine(answer)}</Hint>
            </li>
          ))}
        </Box>
      )}
      {decided.map((answer) => (
        <Row key={`${answer.plugin}-${answer.check}`} gap={2}>
          <TipBtn tooltip={`Run ${answer.check} on this task's commit whatever the decide answer says`} disabled={busy} onClick={() => flip(answer.check, answer.plugin, true)}>
            Run it
          </TipBtn>
          <TipBtn tooltip={`Skip ${answer.check} on this task's commit. A new commit asks again.`} disabled={busy} onClick={() => flip(answer.check, answer.plugin, false)}>
            Skip it
          </TipBtn>
        </Row>
      ))}
      {problem ? <ErrorText size="xs">{problem}</ErrorText> : null}
    </div>
  )
}

function StageRow({ row }: { row: StageRun }) {
  return (
    <Box data-stage-run={row.kind} flex flexWrap items="baseline" gapX="3" gapY="1" size="sm">
      <Box as="span" weight="medium">
        {row.title}
      </Box>
      <Hint size="xs">
        {row.kind} at {row.commit.slice(0, 7)}
      </Hint>
      {row.state !== 'finished' ? <Badge variant="warning">{row.state}</Badge> : null}
      {row.checks.map((check) => (
        <Badge key={check.name} variant={check.result === 'passed' ? 'success' : check.result === 'failed' ? 'danger' : 'warning'}>
          {check.name} {check.result}
        </Badge>
      ))}
      {row.skipped.map((skip) => (
        <Hint key={skip.name} size="xs">
          {skip.name} skipped by {skip.filter}
        </Hint>
      ))}
    </Box>
  )
}

// The phase and branch plugin check results (PK4.6), beside the
// integration branches. Nothing shows when none ran.
export default function StageChecks(props: { workspaceId: string | null; value?: { phases: Record<string, StageRun>; branches: Record<string, StageRun> } }) {
  const api = useAppApi()
  const client = useMemo(() => pluginChecksClient(api), [api])
  const load = useCallback((id: string) => client.stages(id), [client])
  const read = useRead(props.value ? null : props.workspaceId, load)
  const value = props.value ?? read.value
  const rows = value ? [...Object.values(value.phases), ...Object.values(value.branches)] : []
  if (!rows.length) return null
  return (
    <div data-stage-checks>
      <Card css-display="flex" css-flex-direction="column" css-gap="8" flex flexCol gap="2">
        <SectionHeading title="Phase and branch checks" mb="0" />
        {rows.map((row) => (
          <StageRow key={row.run} row={row} />
        ))}
      </Card>
    </div>
  )
}
