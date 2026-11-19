// Links on a task, and Mark done for a manual task, in the task drawer
// (design §4.16, Requirement 61.12, 61.16–61.23). Links list newest first
// with who added each and when; a person adds one from the Add link button,
// edits one, removes one after a confirm, and ticks Show on the issue when
// the task has an issue. A save a content rule blocks offers Allow once in
// place. A manual task shows what the person checks and Mark done, a dialog
// with links and Done, Skipped or Refused. Tasks keep no notes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { Modal } from './ui/Modal.tsx'
import { RadioFold } from './ui/RadioFold.tsx'
import { DangerBtn, ICON, IconLabel } from './ui/controls.tsx'
import { Ban, Check, ClipboardCheck, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from './icons.ts'
import { safeHref, linkHref } from './views-api.ts'
import { relativeTime } from './task-api.ts'
import { errorMessage } from './workspace-api.ts'
import { authorLabel, blockedDecisions, linkProblem, notesClient, type ManualDone, type NoteEntry } from './notes-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainLink } from './ui/Plain'

// A save a content rule blocked: the decisions to allow, and the save to
// run again once allowed.
type Blocked = {
  message: string
  decisions: string[]
  retry: () => Promise<void>
}

// Allow once in place (R61.18, R40.7): a reason, a confirm, then the same
// save again. The allowance binds to this exact text.
function AllowOnce(props: { workspaceId: string; blocked: Blocked; onDone: (text: string) => void; onError: (text: string) => void }) {
  const client = notesClient(useAppApi())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Box role="alert" css-border-color="danger" flex flexCol gap="2" rounded="base" border="all" p="2" size="sm" data-notes-blocked>
      <ErrorText>{props.blocked.message}</ErrorText>
      {props.blocked.decisions.length > 0 && (
        <Row gap={2} align="end">
          <Box as="label" css-min-width="12rem" flex flex1 flexCol gap="1" size="xs">
            <span>Why this exact text may be saved once (required)</span>
            <Input value={reason} onChange={(event: { target: { value: string } }) => setReason(event.target.value)} />
          </Box>
          <DangerBtn
            icon={Check}
            disabled={busy || !reason.trim()}
            tooltip="Save this exact text once, though a rule matched it. Any change is checked again."
            confirm={{
              title: 'Allow this once?',
              body: 'This exact text is saved, though a content rule matched it. Any change is checked again.',
              action: 'Allow once',
            }}
            onConfirm={() => {
              setBusy(true)
              void (async () => {
                try {
                  for (const id of props.blocked.decisions) await client.allowOnce(props.workspaceId, id, reason.trim())
                  await props.blocked.retry()
                  props.onDone('Allowed once and saved.')
                } catch (caught) {
                  props.onError(errorMessage(caught))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Allow once
          </DangerBtn>
        </Row>
      )}
    </Box>
  )
}

function EntryView(props: {
  entry: NoteEntry
  busy: boolean
  onEdit: (entry: NoteEntry, change: { url: string; label: string }) => Promise<void>
  onRemove: (entry: NoteEntry) => void
}) {
  const { entry } = props
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(entry.url)
  const [label, setLabel] = useState(entry.label)
  const problem = editing ? linkProblem(url, label) : null
  const href = safeHref(entry.url)
  return (
    <Box as="li" css-border-color="border" flex flexCol gap="1" border="t" py="2" firstBorderT0 data-link-entry>
      <Box flex flexWrap items="center" gap="1.5" size="xs" tone="muted">
        <span>{authorLabel(entry)}</span>
        <Tooltip text={entry.at}>
          <span>{relativeTime(entry.at)}</span>
        </Tooltip>
        {entry.editedAt && <span>· edited</span>}
        {entry.outcome && <Badge>Outcome</Badge>}
      </Box>
      {editing ? (
        <Stack gap={2}>
          <Box as="label" flex flexCol gap="1" size="xs">
            URL
            <Input value={url} onChange={(event: { target: { value: string } }) => setUrl(event.target.value)} />
          </Box>
          <Box as="label" flex flexCol gap="1" size="xs">
            Label
            <Input value={label} onChange={(event: { target: { value: string } }) => setLabel(event.target.value)} />
          </Box>
          {problem && (
            <ErrorText as="span" size="xs">
              {problem}
            </ErrorText>
          )}
          <Row gap={2} align="start">
            <Btn
              type="button"
              primary
              disabled={props.busy || Boolean(problem)}
              onClick={() => void props.onEdit(entry, { url: url.trim(), label: label.trim() }).then(() => setEditing(false))}
            >
              Save
            </Btn>
            <Btn type="button" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </Row>
        </Stack>
      ) : href ? (
        <PlainLink href={linkHref(href)} target="_blank" rel="noopener noreferrer" css-overflow-wrap="anywhere" inlineFlex items="center" gap="1" size="sm" underline>
          <ExternalLink size={ICON} aria-hidden="true" />
          {entry.label}
        </PlainLink>
      ) : (
        <Box as="span" size="sm">
          {entry.label}
        </Box>
      )}
      {!editing && (
        <Row gap={2}>
          <IconLabel icon={Pencil} disabled={props.busy} tooltip="Edit this link" onClick={() => setEditing(true)}>
            Edit
          </IconLabel>
          <DangerBtn
            icon={Trash2}
            disabled={props.busy}
            tooltip="Remove this link. It stays in the activity log."
            confirm={{
              title: 'Remove this link?',
              body: 'It leaves the list. The activity log keeps a record that it was removed.',
              action: 'Remove',
            }}
            onConfirm={() => props.onRemove(entry)}
          >
            Remove
          </DangerBtn>
        </Row>
      )}
    </Box>
  )
}

// The drawer's Links box: the links, then an Add link button that opens the
// fields for one link. Adding or Cancel closes them again.
export function TaskLinks(props: { workspaceId: string; taskId: string; refresh?: number }) {
  const api = useAppApi()
  const client = useMemo(() => notesClient(api), [api])
  const [entries, setEntries] = useState<NoteEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  const load = useCallback(async () => {
    try {
      setEntries((await client.list(props.workspaceId, props.taskId)).entries)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [client, props.workspaceId, props.taskId])
  useEffect(() => {
    void load()
  }, [load, props.refresh])

  const closeForm = () => {
    setAdding(false)
    setUrl('')
    setLabel('')
    setTried(false)
  }
  // One save: on a content rule block, offer Allow once with this save.
  const save = async (call: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    setBlocked(null)
    const attempt = async () => {
      await call()
      after?.()
      await load()
    }
    try {
      await attempt()
      setNotice(done)
    } catch (caught) {
      const decisions = blockedDecisions(caught)
      if (decisions.length)
        setBlocked({
          message: errorMessage(caught),
          decisions,
          retry: attempt,
        })
      else setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const linkIssue = tried ? linkProblem(url, label) : null

  return (
    <Stack gap={3} data-task-links>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {blocked && (
        <AllowOnce
          workspaceId={props.workspaceId}
          blocked={blocked}
          onDone={(done) => {
            setBlocked(null)
            setNotice(done)
          }}
          onError={(failed) => setError(failed)}
        />
      )}
      {notice && (
        <Hint role="status" as="p" size="sm">
          {notice}
        </Hint>
      )}
      {entries === null ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : entries.length === 0 ? null : (
        <Stack as="ul" aria-label="Links, newest first">
          {entries.map((entry) => (
            <EntryView
              key={entry.id}
              entry={entry}
              busy={busy}
              onEdit={(target, change) => save(() => client.edit(props.workspaceId, props.taskId, target, change), 'Saved.')}
              onRemove={(target) => void save(() => client.remove(props.workspaceId, props.taskId, target.id), 'Removed. The activity log keeps a record.')}
            />
          ))}
        </Stack>
      )}
      {adding ? (
        <form
          className="flex flex-col gap-2 rounded border p-2"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Add link"
          data-add-link-form
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (linkProblem(url, label)) return
            void save(() => client.addLink(props.workspaceId, props.taskId, url, label), 'Link added.', closeForm)
          }}
        >
          <Row gap={2} align="start">
            <Box as="label" css-min-width="12rem" flex flex1 flexCol gap="1" size="xs">
              URL
              <Input autoFocus value={url} placeholder="https://" onChange={(event: { target: { value: string } }) => setUrl(event.target.value)} />
            </Box>
            <Box as="label" css-min-width="10rem" flex flex1 flexCol gap="1" size="xs">
              Label
              <Input value={label} placeholder="Review doc" onChange={(event: { target: { value: string } }) => setLabel(event.target.value)} />
            </Box>
          </Row>
          {linkIssue && (
            <ErrorText as="span" size="xs">
              {linkIssue}
            </ErrorText>
          )}
          <Row gap={2} align="start">
            <Btn type="submit" primary disabled={busy} data-add-link-submit>
              Add
            </Btn>
            <Btn type="button" disabled={busy} onClick={closeForm}>
              Cancel
            </Btn>
          </Row>
        </form>
      ) : (
        <div>
          <Btn type="button" onClick={() => setAdding(true)} data-add-link css-display="inline-flex" css-align-items="center" css-gap="6">
            <Plus size={ICON} aria-hidden="true" />
            Add link
          </Btn>
        </div>
      )}
    </Stack>
  )
}

type Choice = 'done' | 'skipped' | 'refused'

const MARKED: Record<Choice, string> = {
  done: 'Marked done. The tasks that wait on it may start.',
  skipped: 'Marked skipped. The tasks that wait on it may start.',
  refused: 'Marked refused. The tasks that wait on it stay held.',
}

// Mark done (R61.12): optional outcome links, then Done,
// Skipped or Refused. Done and Skipped release the tasks that wait on it;
// Refused is a no-go and keeps them held.
export function MarkDoneDialog(props: { workspaceId: string; taskId: string; title: string; onClose: () => void; onDone: (text: string) => void }) {
  const client = notesClient(useAppApi())
  const [choice, setChoice] = useState<Choice>('done')
  const [links, setLinks] = useState<{ url: string; label: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [busy, setBusy] = useState(false)
  const problems = links.map((link) => linkProblem(link.url, link.label))
  const dirty = links.length > 0
  const setLink = (i: number, change: Partial<{ url: string; label: string }>) => setLinks(links.map((link, j) => (j === i ? { ...link, ...change } : link)))
  const submit = async () => {
    if (problems.some(Boolean)) return
    setBusy(true)
    setError(null)
    setBlocked(null)
    const attempt = async () => {
      await client.markDone(props.workspaceId, props.taskId, {
        choice,
        ...(links.length
          ? {
              links: links.map((link) => ({
                url: link.url.trim(),
                label: link.label.trim(),
              })),
            }
          : {}),
      })
      props.onDone(MARKED[choice])
    }
    try {
      await attempt()
    } catch (caught) {
      const decisions = blockedDecisions(caught)
      if (decisions.length)
        setBlocked({
          message: errorMessage(caught),
          decisions,
          retry: attempt,
        })
      else setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      id="avoozl-mark-done"
      width="34rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-mark-done-line"
      attrs={{ 'data-mark-done-dialog': true }}
      unsaved={
        dirty && {
          title: 'Discard the outcome?',
          body: 'The task stays open. What you typed is lost.',
          action: 'Discard',
        }
      }
      title={
        <Box as="span" inlineFlex items="center" gap="1.5">
          <ClipboardCheck size={ICON} aria-hidden="true" /> Mark done: {props.title}
        </Box>
      }
      onDismiss={props.onClose}
      footer={
        <>
          <Btn
            type="button"
            primary
            disabled={busy || problems.some(Boolean)}
            onClick={() => void submit()}
            data-mark-done-confirm
            css-display="inline-flex"
            css-align-items="center"
            css-gap="6"
          >
            <ClipboardCheck size={ICON} aria-hidden="true" />
            {choice === 'done' ? 'Mark done' : choice === 'skipped' ? 'Mark skipped' : 'Mark refused'}
          </Btn>
        </>
      }
    >
      <div>
        <Hint id="avoozl-mark-done-line" as="p" size="sm">
          The tasks that wait on it may start after Done or Skipped. Refused keeps them held.
        </Hint>
      </div>
      <RadioFold<Choice>
        name="avoozl-mark-done-choice"
        label="How it ended"
        value={choice}
        onChange={setChoice}
        sections={[
          {
            key: 'done',
            title: 'Done',
            line: 'The step happened and its acceptance holds.',
            icon: Check,
          },
          {
            key: 'skipped',
            title: 'Skipped',
            line: 'It was not needed. It shows as skipped on the task and in Flow.',
            icon: X,
          },
          {
            key: 'refused',
            title: 'Refused',
            line: 'A no-go. The tasks that wait on it stay held until you reopen it.',
            icon: Ban,
          },
        ]}
      />
      <Box as="fieldset" flex flexCol gap="2" size="sm">
        <legend>
          Links <Hint size="xs">(optional)</Hint>
        </legend>
        {links.map((link, i) => (
          <Row key={i} gap={2} align="end">
            <Box as="label" css-min-width="10rem" flex flex1 flexCol gap="1" size="xs">
              URL
              <Input value={link.url} placeholder="https://" onChange={(event: { target: { value: string } }) => setLink(i, { url: event.target.value })} />
            </Box>
            <Box as="label" css-min-width="8rem" flex flex1 flexCol gap="1" size="xs">
              Label
              <Input value={link.label} onChange={(event: { target: { value: string } }) => setLink(i, { label: event.target.value })} />
            </Box>
            <IconLabel icon={X} aria-label={`Drop link ${i + 1} from this form`} onClick={() => setLinks(links.filter((_, j) => j !== i))}>
              Drop
            </IconLabel>
            {problems[i] && link.url && (
              <Box as="span" wFull size="xs" tone="danger">
                {problems[i]}
              </Box>
            )}
          </Row>
        ))}
        <div>
          <IconLabel icon={Plus} onClick={() => setLinks([...links, { url: '', label: '' }])}>
            Add a link
          </IconLabel>
        </div>
      </Box>
      {blocked && <AllowOnce workspaceId={props.workspaceId} blocked={blocked} onDone={() => setBlocked(null)} onError={(failed) => setError(failed)} />}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Modal>
  )
}

// A manual task's panel at the top of the drawer: what the person checks,
// and Mark done, or how it was marked and Reopen.
export function ManualTask(props: {
  workspaceId: string
  task: {
    id: string
    title: string
    acceptance: string[]
    manualDone: ManualDone | null
  }
  onChanged: (text: string) => void
}) {
  const client = notesClient(useAppApi())
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = props.task.manualDone
  return (
    <Box aria-label="Manual task" as="section" css-border-color="accent" flex flexCol gap="2" rounded="base" border="all" p="3" data-manual-task>
      <Row gap={2}>
        <Badge variant="warning">Manual</Badge>
        <Box as="span" size="sm">
          A person does this step. No agent works on it.
        </Box>
      </Row>
      <div>
        <Box as="h4" size="sm" weight="semibold">
          What you check
        </Box>
        <Box as="ul" mt="1" listDisc pl="5" size="sm">
          {props.task.acceptance.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </Box>
      </div>
      {done ? (
        <Box flex flexWrap items="center" gap="2" size="sm">
          {done.choice === 'refused' ? <Badge variant="danger">Refused</Badge> : <Badge>{done.choice === 'skipped' ? 'Skipped' : 'Done'}</Badge>}
          <Hint size="xs">
            by {done.login ?? done.by} {relativeTime(done.at)}
            {done.via === 'github' ? ', closed on GitHub' : ''}
          </Hint>
          <DangerBtn
            icon={RotateCcw}
            tooltip="Open it again. The tasks that wait on it stop starting; running chats are left alone."
            confirm={{
              title: 'Reopen this task?',
              body: `New work on the tasks that wait on it stops until it is done again. Chats already running are left alone.`,
              action: 'Reopen',
            }}
            onConfirm={() =>
              void client.reopen(props.workspaceId, props.task.id).then(
                () => props.onChanged('Reopened. The tasks that wait on it wait again.'),
                (caught: unknown) => setError(errorMessage(caught)),
              )
            }
          >
            Reopen
          </DangerBtn>
        </Box>
      ) : (
        <div>
          <IconLabel icon={ClipboardCheck} primary tooltip="Record that the step happened" onClick={() => setOpen(true)}>
            Mark done
          </IconLabel>
        </div>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {open && (
        <MarkDoneDialog
          workspaceId={props.workspaceId}
          taskId={props.task.id}
          title={props.task.title}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false)
            props.onChanged(text)
          }}
        />
      )}
    </Box>
  )
}
