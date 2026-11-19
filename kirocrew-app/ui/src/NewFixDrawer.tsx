// New fix (triage-agent TA9.2): one change with no spec files, beside New
// spec. A sentence and a repository; starting it approves it, and a worker
// picks it up on the next tick like any ready task.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Modal } from './ui/Modal.tsx'
import { Box } from './ui/Box'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { Stack } from './ui/Stack'
import { PlainTextarea } from './ui/Plain'
import { SelectField } from './ui/SelectField'
import { Play } from './icons.ts'
import { ICON } from './ui/controls.tsx'
import { errorMessage, workspaceClient, type Repository } from './workspace-api.ts'
import { fixClient, fixProblem, fixRepositories } from './fix-api.ts'

export default function NewFixDrawer(props: { workspaceId: string; onClose: (notice: string | null) => void }) {
  const api = useAppApi()
  const client = useMemo(() => fixClient(api), [api])
  const [repositories, setRepositories] = useState<Repository[] | null>(null)
  const [repository, setRepository] = useState('')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    workspaceClient(api)
      .repositories(props.workspaceId)
      .then(
        (all) => {
          if (!live) return
          const items = fixRepositories(all)
          setRepositories(items)
          if (items.length === 1) setRepository(items[0].id)
        },
        (caught: unknown) => live && (setRepositories([]), setError(errorMessage(caught))),
      )
    return () => {
      live = false
    }
  }, [api, props.workspaceId])

  const problem = fixProblem(text, repository)
  const submit = async () => {
    setTried(true)
    if (problem || busy) return
    setBusy(true)
    setError(null)
    try {
      const started = await client.start(props.workspaceId, text.trim(), repository)
      props.onClose(`Started ${started.taskId}. A worker picks it up on the next tick.`)
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <Modal
      id="avoozl-new-fix"
      width="36rem"
      height="32rem"
      title="New fix"
      kind="drawer"
      backLabel="Close New fix"
      dismissLabel="Cancel"
      attrs={{ 'data-new-fix-drawer': true }}
      unsaved={text.trim() !== '' && { title: 'Discard this fix?', body: 'What you typed is not saved anywhere.', action: 'Discard' }}
      onDismiss={() => {
        if (!busy) props.onClose(null)
      }}
      footer={
        <Btn type="submit" form="avoozl-new-fix-form" primary disabled={busy || repositories === null} css-display="inline-flex" css-align-items="center" css-gap="6">
          <Play size={ICON} aria-hidden="true" />
          {busy ? 'Starting…' : 'Start fix'}
        </Btn>
      }
    >
      <Stack
        id="avoozl-new-fix-form"
        as="form"
        gap={3}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Hint as="p" size="xs">
          One change, with no spec files. Starting it approves it: a worker codes it, Avoozl checks it, and it lands like any task. If it grows, make it a spec from its task.
        </Hint>
        <Box flex flexCol gap="1" size="sm">
          <Box htmlFor="avoozl-new-fix-repository" as="label" weight="medium">
            Repository
          </Box>
          {repositories !== null && repositories.length === 0 ? (
            <Hint size="xs">No repository with a local checkout yet. Add one in Settings › Repositories.</Hint>
          ) : (
            <SelectField id="avoozl-new-fix-repository" value={repository} onChange={(event) => setRepository(event.target.value)} disabled={!repositories} data-new-fix-repository>
              <option value="">{repositories ? 'Pick a repository' : 'Loading…'}</option>
              {(repositories ?? []).map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name || repo.id}
                  {repo.github ? ` (${repo.github})` : ''}
                </option>
              ))}
            </SelectField>
          )}
        </Box>
        <Box flex flexCol gap="1" size="sm">
          <Box htmlFor="avoozl-new-fix-text" as="label" weight="medium">
            What to change
          </Box>
          <PlainTextarea
            id="avoozl-new-fix-text"
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            css-border-color="border"
            css-color="text"
            css-background="card-transparent"
            rounded="base"
            border="all"
            px="2"
            py="1"
            size="sm"
            data-new-fix-text
          />
          <Hint size="xs">The first line becomes its title. Its acceptance: it does what this asks, and the repository's checks pass on the head that lands.</Hint>
        </Box>
        {tried && problem && (
          <ErrorText role="alert" as="span" size="xs" data-new-fix-problem>
            {problem}
          </ErrorText>
        )}
        {error && (
          <ErrorText role="alert" as="span" size="xs">
            {error}
          </ErrorText>
        )}
      </Stack>
    </Modal>
  )
}
