// Links and notes on a task, and Mark done for a manual task, in the task
// drawer (design §4.16, Requirement 61.12, 61.16–61.23). Entries list
// newest first with who wrote each and when; a person adds a link or a
// note, edits one, removes one after a confirm, and ticks Show on the issue
// when the task has an issue. A save a content rule blocks offers Allow once
// in place. A manual task shows what the person checks and Mark done, a
// dialog with an outcome note, links, and Done or Skipped.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Modal } from './Modal.tsx'
import { RadioFold } from './RadioFold.tsx'
import { DangerBtn, ICON, IconLabel } from './controls.tsx'
import { Check, ClipboardCheck, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from './icons.ts'
import { safeHref, linkHref } from './views-api.ts'
import { relativeTime } from './task-api.ts'
import { errorMessage } from './workspace-api.ts'
import { authorLabel, blockedDecisions, linkProblem, noteProblem, notesClient, type ManualDone, type NoteEntry } from './notes-api.ts'

const fieldStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}

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
    <div role="alert" className="flex flex-col gap-2 rounded border p-2 text-sm" style={{ borderColor: 'var(--danger)' }} data-notes-blocked>
      <p className="text-danger">{props.blocked.message}</p>
      {props.blocked.decisions.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '12rem' }}>
            <span>Why this exact text may be saved once (required)</span>
            <Input value={reason} onChange={(event: { target: { value: string } }) => setReason(event.target.value)} />
          </label>
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
        </div>
      )}
    </div>
  )
}

function EntryView(props: {
  entry: NoteEntry
  onGitHub: boolean
  busy: boolean
  onEdit: (entry: NoteEntry, change: { url?: string; label?: string; text?: string }) => Promise<void>
  onRemove: (entry: NoteEntry) => void
  onShow: (entry: NoteEntry, on: boolean) => void
}) {
  const { entry } = props
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(entry.url ?? '')
  const [label, setLabel] = useState(entry.label ?? '')
  const [text, setText] = useState(entry.text ?? '')
  const problem = editing ? (entry.kind === 'link' ? linkProblem(url, label) : noteProblem(text)) : null
  const href = entry.kind === 'link' ? safeHref(entry.url ?? null) : null
  return (
    <li className="flex flex-col gap-1 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-note-entry={entry.kind}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span>{authorLabel(entry)}</span>
        <Tooltip text={entry.at}>
          <span>{relativeTime(entry.at)}</span>
        </Tooltip>
        {entry.editedAt && <span>· edited</span>}
        {entry.outcome && <Badge>Outcome</Badge>}
        {entry.onIssue && <Badge>On the issue</Badge>}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          {entry.kind === 'link' ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                URL
                <Input value={url} onChange={(event: { target: { value: string } }) => setUrl(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Label
                <Input value={label} onChange={(event: { target: { value: string } }) => setLabel(event.target.value)} />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-xs">
              Note
              <textarea
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="rounded border px-2 py-1 text-sm"
                style={fieldStyle}
              />
            </label>
          )}
          {problem && <span className="text-xs text-danger">{problem}</span>}
          <div className="flex flex-wrap gap-2">
            <Btn
              type="button"
              primary
              disabled={props.busy || Boolean(problem)}
              onClick={() =>
                void props.onEdit(entry, entry.kind === 'link' ? { url: url.trim(), label: label.trim() } : { text }).then(() => setEditing(false))
              }
            >
              Save
            </Btn>
            <Btn type="button" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      ) : entry.kind === 'link' ? (
        href ? (
          <a
            href={linkHref(href)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm underline"
            style={{ overflowWrap: 'anywhere' }}
          >
            <ExternalLink size={ICON} aria-hidden="true" />
            {entry.label}
          </a>
        ) : (
          <span className="text-sm">{entry.label}</span>
        )
      ) : (
        // A note is shown as typed, never as markup: people and agents write it.
        <p className="text-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {entry.text}
        </p>
      )}
      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <IconLabel icon={Pencil} disabled={props.busy} tooltip={`Edit this ${entry.kind}`} onClick={() => setEditing(true)}>
            Edit
          </IconLabel>
          <DangerBtn
            icon={Trash2}
            disabled={props.busy}
            tooltip={`Remove this ${entry.kind}. It stays in the activity log.`}
            confirm={{
              title: `Remove this ${entry.kind}?`,
              body: 'It leaves the list. The activity log keeps a record that it was removed.',
              action: 'Remove',
            }}
            onConfirm={() => props.onRemove(entry)}
          >
            Remove
          </DangerBtn>
          {props.onGitHub && (
            <Tooltip text="List it in the issue's managed section on GitHub. Off by default: notes may hold things not meant for the repository.">
              {(describedBy) => (
                <label className="inline-flex items-center gap-1.5 text-xs" aria-describedby={describedBy}>
                  <input type="checkbox" checked={entry.onIssue} disabled={props.busy} onChange={(event) => props.onShow(entry, event.target.checked)} />
                  Show on the issue
                </label>
              )}
            </Tooltip>
          )}
        </div>
      )}
    </li>
  )
}

// The drawer's Links and notes fold body.
export function LinksAndNotes(props: { workspaceId: string; taskId: string; onGitHub: boolean; refresh?: number }) {
  const api = useAppApi()
  const client = useMemo(() => notesClient(api), [api])
  const [entries, setEntries] = useState<NoteEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  const [tried, setTried] = useState<'link' | 'note' | null>(null)
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
  const linkIssue = tried === 'link' ? linkProblem(url, label) : null
  const noteIssue = tried === 'note' ? noteProblem(text) : null

  return (
    <div className="flex flex-col gap-3" data-links-and-notes>
      <p className="text-xs text-muted">
        What happened while the work ran: meeting outcomes, docs, findings. Kept here, not in the spec, so adding one changes no approval. Workers read them as
        data.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
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
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}
      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No links or notes yet.</p>
      ) : (
        <ul className="flex flex-col" aria-label="Links and notes, newest first">
          {entries.map((entry) => (
            <EntryView
              key={entry.id}
              entry={entry}
              onGitHub={props.onGitHub}
              busy={busy}
              onEdit={(target, change) => save(() => client.edit(props.workspaceId, props.taskId, target, change), 'Saved.')}
              onRemove={(target) => void save(() => client.remove(props.workspaceId, props.taskId, target.id), 'Removed. The activity log keeps a record.')}
              onShow={(target, on) =>
                void save(
                  () => client.show(props.workspaceId, props.taskId, target.id, on),
                  on ? 'It goes on the issue at the next tick.' : 'It comes off the issue at the next tick.',
                )
              }
            />
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 rounded border p-2"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Add link"
        onSubmit={(event) => {
          event.preventDefault()
          setTried('link')
          if (linkProblem(url, label)) return
          void save(
            () => client.addLink(props.workspaceId, props.taskId, url, label),
            'Link added.',
            () => {
              setUrl('')
              setLabel('')
              setTried(null)
            },
          )
        }}
      >
        <span className="text-sm font-semibold">Add link</span>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '12rem' }}>
            URL
            <Input value={url} placeholder="https://" onChange={(event: { target: { value: string } }) => setUrl(event.target.value)} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '10rem' }}>
            Label
            <Input value={label} placeholder="Review notes" onChange={(event: { target: { value: string } }) => setLabel(event.target.value)} />
          </label>
        </div>
        {linkIssue && <span className="text-xs text-danger">{linkIssue}</span>}
        <div>
          <Btn type="submit" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={ICON} aria-hidden="true" />
            Add link
          </Btn>
        </div>
      </form>
      <form
        className="flex flex-col gap-2 rounded border p-2"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Add note"
        onSubmit={(event) => {
          event.preventDefault()
          setTried('note')
          if (noteProblem(text)) return
          void save(
            () => client.addNote(props.workspaceId, props.taskId, text),
            'Note added.',
            () => {
              setText('')
              setTried(null)
            },
          )
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Add note
          <textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="rounded border px-2 py-1 text-sm font-normal"
            style={fieldStyle}
          />
        </label>
        {noteIssue && <span className="text-xs text-danger">{noteIssue}</span>}
        <div>
          <Btn type="submit" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={ICON} aria-hidden="true" />
            Add note
          </Btn>
        </div>
      </form>
    </div>
  )
}

type Choice = 'done' | 'skipped'

// Mark done (R61.12): an optional outcome note and links, then Done or
// Skipped. Either releases the tasks that wait on it.
export function MarkDoneDialog(props: {
  workspaceId: string
  taskId: string
  title: string
  onIssue: boolean
  onClose: () => void
  onDone: (text: string) => void
}) {
  const client = notesClient(useAppApi())
  const [choice, setChoice] = useState<Choice>('done')
  const [note, setNote] = useState('')
  const [links, setLinks] = useState<{ url: string; label: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [busy, setBusy] = useState(false)
  const problems = links.map((link) => linkProblem(link.url, link.label))
  const dirty = Boolean(note.trim() || links.length)
  const setLink = (i: number, change: Partial<{ url: string; label: string }>) => setLinks(links.map((link, j) => (j === i ? { ...link, ...change } : link)))
  const submit = async () => {
    if (problems.some(Boolean)) return
    setBusy(true)
    setError(null)
    setBlocked(null)
    const attempt = async () => {
      await client.markDone(props.workspaceId, props.taskId, {
        choice,
        ...(note.trim() ? { note } : {}),
        ...(links.length
          ? {
              links: links.map((link) => ({
                url: link.url.trim(),
                label: link.label.trim(),
              })),
            }
          : {}),
      })
      props.onDone(choice === 'done' ? 'Marked done. The tasks that wait on it may start.' : 'Marked skipped. The tasks that wait on it may start.')
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
      describedBy="avoozl-mark-done-line"
      attrs={{ 'data-mark-done-dialog': true }}
      unsaved={
        dirty && {
          title: 'Discard the outcome?',
          body: 'The task stays open. What you typed is lost.',
          action: 'Discard',
        }
      }
      onDismiss={props.onClose}
    >
      <div>
        <h3 id="avoozl-mark-done-title" className="flex items-center gap-1.5 text-base font-semibold">
          <ClipboardCheck size={ICON} aria-hidden="true" />
          Mark done: {props.title}
        </h3>
        <p id="avoozl-mark-done-line" className="text-sm text-muted">
          {props.onIssue ? 'This closes its issue as you, on GitHub. ' : ''}The tasks that wait on it may start after either choice.
        </p>
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
        ]}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span>
          Outcome note <span className="text-xs text-muted">(optional)</span>
        </span>
        <textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={fieldStyle}
          data-outcome-note
        />
        <span className="text-xs text-muted">What was decided. The workers after it read this as data.</span>
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend>
          Links <span className="text-xs text-muted">(optional)</span>
        </legend>
        {links.map((link, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '10rem' }}>
              URL
              <Input value={link.url} placeholder="https://" onChange={(event: { target: { value: string } }) => setLink(i, { url: event.target.value })} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '8rem' }}>
              Label
              <Input value={link.label} onChange={(event: { target: { value: string } }) => setLink(i, { label: event.target.value })} />
            </label>
            <IconLabel icon={X} aria-label={`Drop link ${i + 1} from this form`} onClick={() => setLinks(links.filter((_, j) => j !== i))}>
              Drop
            </IconLabel>
            {problems[i] && link.url && <span className="w-full text-xs text-danger">{problems[i]}</span>}
          </div>
        ))}
        <div>
          <IconLabel icon={Plus} onClick={() => setLinks([...links, { url: '', label: '' }])}>
            Add a link
          </IconLabel>
        </div>
      </fieldset>
      {blocked && <AllowOnce workspaceId={props.workspaceId} blocked={blocked} onDone={() => setBlocked(null)} onError={(failed) => setError(failed)} />}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn type="button" onClick={props.onClose}>
          Cancel
        </Btn>
        <Btn
          type="button"
          primary
          disabled={busy || problems.some(Boolean)}
          onClick={() => void submit()}
          data-mark-done-confirm
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ClipboardCheck size={ICON} aria-hidden="true" />
          {choice === 'done' ? 'Mark done' : 'Mark skipped'}
        </Btn>
      </div>
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
    onGitHub: boolean
  }
  onChanged: (text: string) => void
}) {
  const client = notesClient(useAppApi())
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = props.task.manualDone
  return (
    <section aria-label="Manual task" className="flex flex-col gap-2 rounded border p-3" style={{ borderColor: 'var(--accent)' }} data-manual-task>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Manual</Badge>
        <span className="text-sm">A person does this step. No agent works on it.</span>
      </div>
      <div>
        <h4 className="text-sm font-semibold">What you check</h4>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {props.task.acceptance.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      {done ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{done.choice === 'skipped' ? 'Skipped' : 'Done'}</Badge>
          <span className="text-xs text-muted">
            by {done.login ?? done.by} {relativeTime(done.at)}
            {done.via === 'github' ? ', closed on GitHub' : ''}
          </span>
          <DangerBtn
            icon={RotateCcw}
            tooltip="Open it again. The tasks that wait on it stop starting; running chats are left alone."
            confirm={{
              title: 'Reopen this task?',
              body: `${props.task.onGitHub ? 'Its issue reopens. ' : ''}New work on the tasks that wait on it stops until it is done again. Chats already running are left alone.`,
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
        </div>
      ) : (
        <div>
          <IconLabel icon={ClipboardCheck} primary tooltip="Record that the step happened, with what was decided" onClick={() => setOpen(true)}>
            Mark done
          </IconLabel>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {open && (
        <MarkDoneDialog
          workspaceId={props.workspaceId}
          taskId={props.task.id}
          title={props.task.title}
          onIssue={props.task.onGitHub}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false)
            props.onChanged(text)
          }}
        />
      )}
    </section>
  )
}
