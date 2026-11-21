// Settings › Epic context (epic-context EC9.4): a form for this machine's
// own context (repos, folders, tools and content rules), each machine
// plugin's context part read-only, and the last ten sessions that got
// context with their tests. Saving is a person's act, the same operation as
// avoozl context set.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { Checkbox } from './ui/Checkbox'
import { ErrorText } from './ui/ErrorText'
import { Field } from './ui/Field.tsx'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Hint } from './ui/Hint'
import { Input } from './ui/Input'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { IconBtn } from './ui/controls.tsx'
import { Plus, Trash2, X } from './icons.ts'
import { ContextPartFacts } from './ContextPart.tsx'
import { FolderField } from './FolderPicker.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { contentClient } from './content-api.ts'
import {
  contextClient,
  draftOf,
  draftProblems,
  emptyTool,
  envProblem,
  fieldOfError,
  folderProblem,
  machineOf,
  repoProblem,
  testLine,
  type ContextDraft,
  type ContextSession,
  type ContextTool,
  type ContextView,
  type MachineContext,
} from './context-api.ts'
import { errorMessage, workspaceClient } from './workspace-api.ts'

// A field's problem, next to it.
const Problem = ({ field, problems }: { field: string; problems: Record<string, string> }) =>
  problems[field] ? (
    <ErrorText role="alert" size="xs" data-field-error={field}>
      {problems[field]}
    </ErrorText>
  ) : null

// Values as removable chips.
function Chips(props: { name: string; items: string[]; onRemove: (at: number) => void }) {
  if (!props.items.length) return null
  return (
    <Box as="ul" css-list-style="none" css-margin="0" css-padding-left="0" flex flexWrap gap="1" data-context-chips={props.name}>
      {props.items.map((item, at) => (
        <Box as="li" key={`${item}-${at}`} css-border="1px-solid-border" css-padding="0-0-0-8px" flex items="center" gap="1" rounded="base" size="xs">
          <code>{item}</code>
          <IconBtn icon={X} label={`Remove ${item}`} onClick={() => props.onRemove(at)} look={{ 'css-border': 'none', 'css-background': 'none' }} />
        </Box>
      ))}
    </Box>
  )
}

// One text box that adds a chip on Enter or Add, after its own check.
function AddChip(props: { id: string; placeholder: string; check: (text: string) => string | null; onAdd: (text: string) => void; label: string }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const add = () => {
    const value = text.trim()
    if (!value) return
    const found = props.check(value)
    if (found) return setProblem(found)
    props.onAdd(value)
    setText('')
    setProblem(null)
  }
  return (
    <Stack gap={1}>
      <Row gap={2} wrap={false}>
        <Input
          id={props.id}
          value={text}
          placeholder={props.placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          css-flex="1"
          css-min-width="0"
          data-chip-input={props.id}
        />
        <Btn type="button" onClick={add} disabled={!text.trim()} css-flex-shrink="0" data-chip-add={props.id}>
          {props.label}
        </Btn>
      </Row>
      {problem ? (
        <ErrorText role="alert" size="xs">
          {problem}
        </ErrorText>
      ) : null}
    </Stack>
  )
}

function Tool(props: { at: number; tool: ContextTool; problem: ReactNode; onChange: (tool: ContextTool) => void; onRemove: () => void }) {
  const { tool, at } = props
  const id = `ctx-tool-${at}`
  const set = (patch: Partial<ContextTool>) => props.onChange({ ...tool, ...patch })
  const setArg = (index: number, value: string) => set({ command: tool.command.map((part, i) => (i === index ? value : part)) })
  return (
    <Box as="li" css-border="1px-solid-border" css-padding="10" flex flexCol gap="2" rounded="base" data-context-tool={at}>
      <Row gap={2}>
        <Box as="span" css-flex="1" weight="semibold">
          {tool.alias.trim() || `Tool ${at + 1}`}
        </Box>
        <Btn type="button" onClick={props.onRemove} css-display="inline-flex" css-align-items="center" css-gap="6" data-tool-remove={at}>
          <Trash2 size={14} aria-hidden="true" /> Remove
        </Btn>
      </Row>
      <Field id={`${id}-alias`} label="Name" help="A short name the worker calls it by.">
        <Input id={`${id}-alias`} value={tool.alias} placeholder="research" onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ alias: e.target.value })} />
      </Field>
      <Field id={`${id}-about`} label="What it does" help="One line the worker reads to know when to use it.">
        <Input
          id={`${id}-about`}
          value={tool.about}
          placeholder="Answers questions from the team's design archive"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ about: e.target.value })}
        />
      </Field>
      <Field id={`${id}-arg-0`} label="Command" help="The program, then one argument per box. No shell: nothing is split or expanded.">
        <Stack gap={1}>
          {tool.command.map((part, index) => (
            <Row key={index} gap={2} wrap={false}>
              <Input
                id={`${id}-arg-${index}`}
                aria-label={index === 0 ? 'Program' : `Argument ${index}`}
                value={part}
                placeholder={index === 0 ? 'research-mcp' : '--stdio'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setArg(index, e.target.value)}
                css-flex="1"
                css-min-width="0"
                css-font-family="mono-monospace"
                data-tool-arg={index}
              />
              {index > 0 ? <IconBtn icon={X} label={`Remove argument ${index}`} onClick={() => set({ command: tool.command.filter((_, i) => i !== index) })} /> : null}
            </Row>
          ))}
          <Box>
            <Btn type="button" onClick={() => set({ command: [...tool.command, ''] })} data-tool-add-arg>
              Add argument
            </Btn>
          </Box>
        </Stack>
      </Field>
      <Field
        id={`${id}-env`}
        label="Environment variable names"
        help="Names only, such as a token's name. The tool reads the values from your own environment; Avoozl never stores them."
      >
        <Stack gap={1}>
          <Chips name={`${id}-env`} items={tool.env} onRemove={(index) => set({ env: tool.env.filter((_, i) => i !== index) })} />
          <AddChip
            id={`${id}-env`}
            label="Add name"
            placeholder="RESEARCH_TOKEN"
            check={(text) => envProblem(text) ?? (tool.env.includes(text) ? 'Already added.' : null)}
            onAdd={(text) => set({ env: [...tool.env, text] })}
          />
        </Stack>
      </Field>
      {props.problem}
    </Box>
  )
}

function Machine(props: { block: MachineContext | null; sets: string[] | null; workspaceId: string; onSaved: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => contextClient(api), [api])
  const folders = useMemo(() => workspaceClient(api), [api])
  const saved = useMemo(() => draftOf(props.block), [props.block])
  const [draft, setDraft] = useState<ContextDraft>(saved)
  const [adding, setAdding] = useState(false)
  const [folder, setFolder] = useState('')
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(saved), [saved])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const change = (patch: Partial<ContextDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setProblems({})
    setOk(null)
  }
  const discard = () => {
    setDraft(saved)
    setProblems({})
    setError(null)
    setAdding(false)
  }
  const save = async () => {
    const found = draftProblems(draft)
    setProblems(found)
    setError(null)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      await client.setMachine(props.workspaceId, machineOf(draft))
      setOk('Saved.')
      setAdding(false)
      props.onSaved()
    } catch (caught) {
      const message = errorMessage(caught)
      const field = fieldOfError(message, draft)
      if (field) setProblems({ [field]: message })
      else setError(message)
    } finally {
      setSaving(false)
    }
  }
  const addFolder = () => {
    const value = folder.trim()
    const found = folderProblem(value) ?? (draft.reads.includes(value) ? 'Already added.' : null)
    if (found) return setProblems({ reads: found })
    change({ reads: [...draft.reads, value] })
    setFolder('')
  }
  const sets = [...new Set([...(props.sets ?? []), ...draft.contentSets])]
  const open = props.block !== null || adding
  return (
    <FieldGroup title="Extra context for your work" boxed>
      <Stack gap={3} data-context-machine>
        <Hint size="xs">Give your workers more to read on your own approved specs: skills, folders and tools.</Hint>
        {!open ? (
          <Row gap={3} data-context-empty>
            <Hint size="sm">None set. Workers get only the task and the repo.</Hint>
            <Btn type="button" primary onClick={() => setAdding(true)} data-context-add>
              Add context
            </Btn>
          </Row>
        ) : (
          <>
            <Field id="ctx-repos" label="Repos" help="Which of your repos this is for. owner/name, or owner/* for all of one owner's repos.">
              <Stack gap={1}>
                <Chips name="repos" items={draft.repos} onRemove={(at) => change({ repos: draft.repos.filter((_, i) => i !== at) })} />
                <AddChip
                  id="ctx-repos"
                  label="Add repo"
                  placeholder="acme/widgets or acme/*"
                  check={(text) => repoProblem(text) ?? (draft.repos.includes(text) ? 'Already added.' : null)}
                  onAdd={(text) => change({ repos: [...draft.repos, text] })}
                />
                <Problem field="repos" problems={problems} />
              </Stack>
            </Field>
            <Field id="ctx-folder" label="Folders to read" help="Workers may read these folders but not change them. Each must be on this computer.">
              <Stack gap={1}>
                <Chips name="reads" items={draft.reads} onRemove={(at) => change({ reads: draft.reads.filter((_, i) => i !== at) })} />
                <FolderField id="ctx-folder" label="Folder to add" value={folder} placeholder="~/notes/acme-widgets" client={folders} onChange={setFolder} />
                <Box>
                  <Btn type="button" onClick={addFolder} disabled={!folder.trim()} data-context-add-folder>
                    Add folder
                  </Btn>
                </Box>
                <Problem field="reads" problems={problems} />
              </Stack>
            </Field>
            <Field id="ctx-tools" label="Tools" help="MCP servers a worker may call. Each runs outside the worker's sandbox, so the worker never holds its sign-in.">
              <Stack gap={2}>
                {draft.tools.length > 0 && (
                  <Box as="ul" css-list-style="none" css-margin="0" css-padding-left="0" flex flexCol gap="2">
                    {draft.tools.map((tool, at) => (
                      <Tool
                        key={at}
                        at={at}
                        tool={tool}
                        problem={<Problem field={`tool.${at}`} problems={problems} />}
                        onChange={(next) => change({ tools: draft.tools.map((old, i) => (i === at ? next : old)) })}
                        onRemove={() => change({ tools: draft.tools.filter((_, i) => i !== at) })}
                      />
                    ))}
                  </Box>
                )}
                <Box>
                  <Btn
                    id="ctx-tools"
                    type="button"
                    onClick={() => change({ tools: [...draft.tools, emptyTool()] })}
                    css-display="inline-flex"
                    css-align-items="center"
                    css-gap="6"
                    data-context-add-tool
                  >
                    <Plus size={14} aria-hidden="true" /> Add tool
                  </Btn>
                </Box>
              </Stack>
            </Field>
            <Field id="ctx-sets" label="Content rules" help="Rule sets that also check these tasks' commits, GitHub posts and briefs.">
              <Stack gap={1} data-context-sets>
                {sets.length === 0 ? (
                  <Hint size="xs">{props.sets === null ? 'Loading rule sets…' : 'No rule sets yet. Add one in Content rules.'}</Hint>
                ) : (
                  sets.map((id) => (
                    <Box as="label" key={id} flex items="center" gap="2" size="sm">
                      <Checkbox
                        checked={draft.contentSets.includes(id)}
                        onChange={(e) => change({ contentSets: e.target.checked ? [...draft.contentSets, id] : draft.contentSets.filter((set) => set !== id) })}
                        data-context-set={id}
                      />
                      <code>{id}</code>
                      {props.sets && !props.sets.includes(id) ? <Hint size="xs">not on this computer</Hint> : null}
                    </Box>
                  ))
                )}
                <Problem field="contentSets" problems={problems} />
              </Stack>
            </Field>
            <Box as="details" size="xs" data-context-json>
              <Box as="summary" css-cursor="pointer">
                View as JSON
              </Box>
              <Box as="pre" css-overflow-x="auto" css-margin="6px-0-0" css-font-family="mono-monospace" size="xs">
                {JSON.stringify(machineOf(draft), null, 2)}
              </Box>
            </Box>
          </>
        )}
        <SaveFooter dirty={dirty || (adding && !props.block)} saving={saving} error={error} ok={ok} onSave={() => void save()} onDiscard={discard} />
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
  const content = useMemo(() => contentClient(api), [api])
  const [view, setView] = useState<ContextView | null>(null)
  const [sets, setSets] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { workspaceId } = props
  const read = useCallback(() => {
    client.get(workspaceId).then(setView, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId])
  useEffect(read, [read])
  useEffect(() => {
    content.list(workspaceId).then(
      (rules) => setSets(rules.sets.map((set) => set.id)),
      () => setSets([]),
    )
  }, [content, workspaceId])
  if (!view) return error ? <ErrorText role="alert">{error}</ErrorText> : null
  return (
    <Stack gap={4} data-epic-context-settings>
      <Machine block={view.machine} sets={sets} workspaceId={workspaceId} onSaved={read} />
      <FieldGroup title="From plugins" boxed>
        <Stack gap={3}>
          {view.plugins.length === 0 ? (
            <Hint size="xs">No plugin on this computer gives context.</Hint>
          ) : (
            <Hint size="xs">What each plugin gives. Answer a plugin's questions and set up its tools in Plugins.</Hint>
          )}
          {view.plugins.map((plugin) => (
            <FieldGroup key={plugin.id} level={4} title={`${plugin.id} ${plugin.version}`}>
              <ContextPartFacts plugin={plugin.id} part={plugin} />
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
