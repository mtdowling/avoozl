// Ideas (design §8.8, R63): the New idea dialog, the Ideas list on the
// Intake tab, and one idea's dialog with its notes and links. An idea never
// runs work. Riff on this opens a chat that may only append to the idea;
// Make it a spec opens the New spec drawer filled from it.
import { useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, EmptyState, Input, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import { IconBtn, IconLabel, useAskChat, useConfirm } from './controls.tsx'
import { Archive, ArchiveRestore, FileText, Lightbulb, MessagesSquare, Plus } from './icons.ts'
import { relativeTime } from './task-api.ts'
import { errorMessage } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import { EMPTY_IDEA, IDEA_STATES, ideaProblems, ideasClient, ideasOf, type Idea, type IdeaState, type NewIdeaForm } from './ideas-api.ts'

const fieldStyle: CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }
const HEAD: CSSProperties = { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--muted)', padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const CELL: CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'top' }

export const NEW_IDEA_TIP = 'Jot down a rough idea. It never starts work; later you can riff on it or make it a spec.'
export const RIFF_TIP = 'Open a chat to think this through. It changes nothing except adding notes and links to this idea.'
export const MAKE_SPEC_TIP = 'Open New spec filled in from this idea. The idea is marked as a spec once you send it.'

// The header button that opens New idea, shared by Specs and Intake.
export function NewIdeaButton(props: { onClick: () => void; disabled?: boolean }) {
  return (
    <IconLabel icon={Plus} onClick={props.onClick} disabled={props.disabled} tooltip={NEW_IDEA_TIP}>
      New idea
    </IconLabel>
  )
}

export function NewIdeaDialog(props: { workspaceId: string; onClose: (made: Idea | null) => void }) {
  const api = useAppApi()
  const client = useMemo(() => ideasClient(api), [api])
  const ask = useConfirm()
  const [form, setForm] = useState<NewIdeaForm>(EMPTY_IDEA)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problems = ideaProblems(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_IDEA)
  const dismiss = async () => {
    if (busy) return
    if (dirty && !(await ask({ title: 'Discard this idea?', body: 'What you typed is not saved anywhere.', action: 'Discard' }))) return
    props.onClose(null)
  }
  const save = async () => {
    setTried(true)
    if (problems.length) return
    setBusy(true)
    setError(null)
    try {
      props.onClose(await client.capture(props.workspaceId, form))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      id="avoozl-new-idea"
      title="New idea"
      onDismiss={() => void dismiss()}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn type="button" onClick={() => void dismiss()} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="button" primary onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save idea'}
          </Btn>
        </div>
      }
    >
      <form
        className="flex max-w-2xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <p className="text-sm text-muted">An idea is a rough note. It never starts work. Riff on it in a chat, then make it a spec when it is ready.</p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Title <span className="font-normal text-muted">(required)</span>
          </span>
          <Input value={form.title} placeholder="Graph minimap for big specs" onChange={(event) => setForm({ ...form, title: event.target.value })} style={{ maxWidth: '32rem' }} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Notes <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea rows={6} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="rounded border px-2 py-1 text-sm" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Links <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea rows={3} value={form.links} placeholder="https://…" onChange={(event) => setForm({ ...form, links: event.target.value })} className="rounded border px-2 py-1 text-sm" style={fieldStyle} />
          <span className="text-xs text-muted">One http or https link per line.</span>
        </label>
        {tried && problems.length > 0 && (
          <p role="alert" className="text-sm text-danger">
            {problems[0]}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const stateBadge = (idea: Idea) =>
  idea.state === 'graduated' ? <Badge variant="success">Spec {idea.graduated?.spec}</Badge> : idea.state === 'archived' ? <Badge>Archived</Badge> : null

// One idea: its notes and links, Add note, Add link, and the actions.
function IdeaDialog(props: { workspaceId: string; idea: Idea; onChanged: (idea: Idea) => void; onClose: () => void; onRiff: () => void; onMakeSpec: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => ideasClient(api), [api])
  const { idea } = props
  const [note, setNote] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = idea.state === 'open'
  const run = async (call: () => Promise<Idea>, done?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      props.onChanged(await call())
      done?.()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      id="avoozl-idea"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Lightbulb size={18} aria-hidden="true" />
          {idea.title} {stateBadge(idea)}
        </span>
      }
      onDismiss={props.onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {open && (
            <IconLabel icon={Archive} onClick={() => void run(() => client.archive(props.workspaceId, idea.id))} disabled={busy} tooltip="Hide this idea from the list. Restore brings it back.">
              Archive
            </IconLabel>
          )}
          {idea.state === 'archived' && (
            <IconLabel icon={ArchiveRestore} onClick={() => void run(() => client.restore(props.workspaceId, idea.id))} disabled={busy}>
              Restore
            </IconLabel>
          )}
          <span className="flex-1" />
          {open && (
            <>
              <IconLabel icon={MessagesSquare} onClick={props.onRiff} tooltip={RIFF_TIP}>
                Riff on this
              </IconLabel>
              <IconLabel icon={FileText} primary onClick={props.onMakeSpec} tooltip={MAKE_SPEC_TIP}>
                Make it a spec
              </IconLabel>
            </>
          )}
          <Btn type="button" onClick={props.onClose}>
            Close
          </Btn>
        </div>
      }
    >
      <div className="flex max-w-3xl flex-col gap-4 text-sm">
        <p className="text-xs text-muted">
          Saved by {idea.author} {relativeTime(idea.createdAt)}
          {idea.graduated ? ` · became spec ${idea.graduated.spec} ${relativeTime(idea.graduated.at)}` : ''}
        </p>
        <section aria-labelledby="avoozl-idea-notes" className="flex flex-col gap-2">
          <h4 id="avoozl-idea-notes" className="font-semibold">
            Notes
          </h4>
          {idea.notes.length === 0 ? (
            <p className="text-muted">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {idea.notes.map((entry, index) => (
                <li key={index} className="rounded border p-2" style={{ borderColor: 'var(--border)' }}>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{entry.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {entry.author} · {relativeTime(entry.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {open && (
            <div className="flex flex-col gap-1">
              <textarea aria-label="New note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="rounded border px-2 py-1 text-sm" style={fieldStyle} />
              <span>
                <IconLabel icon={Plus} disabled={busy || !note.trim()} onClick={() => void run(() => client.append(props.workspaceId, idea.id, { note }), () => setNote(''))}>
                  Add note
                </IconLabel>
              </span>
            </div>
          )}
        </section>
        <section aria-labelledby="avoozl-idea-links" className="flex flex-col gap-2">
          <h4 id="avoozl-idea-links" className="font-semibold">
            Links
          </h4>
          {idea.links.length === 0 ? (
            <p className="text-muted">No links yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {idea.links.map((entry, index) => (
                <li key={index}>
                  {safeHref(entry.url) ? (
                    <a href={safeHref(entry.url)!} target="_blank" rel="noopener noreferrer" className="underline" style={{ overflowWrap: 'anywhere' }}>
                      {entry.label || entry.url}
                    </a>
                  ) : (
                    <span style={{ overflowWrap: 'anywhere' }}>{entry.label || entry.url}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {open && (
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="New link" value={link} placeholder="https://…" onChange={(event) => setLink(event.target.value)} style={{ maxWidth: '28rem', flex: '1 1 16rem' }} />
              <IconLabel icon={Plus} disabled={busy || !link.trim()} onClick={() => void run(() => client.append(props.workspaceId, idea.id, { link: link.trim() }), () => setLink(''))}>
                Add link
              </IconLabel>
            </div>
          )}
        </section>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// The Intake tab's Ideas view: Open, Became a spec, Archived.
export function IdeasList(props: { workspaceId: string; ideas: Idea[]; narrow: boolean; onChanged: () => void; onMakeSpec: (idea: Idea) => void }) {
  const chat = useAskChat(props.workspaceId)
  const [state, setState] = useState<IdeaState>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [changed, setChanged] = useState<Record<string, Idea>>({})
  const ideas = props.ideas.map((idea) => changed[idea.id] ?? idea)
  const shown = ideasOf(ideas, state)
  const current = ideas.find((idea) => idea.id === openId) ?? null
  const riff = (idea: Idea) => void chat.ask({ purpose: 'riff-idea', idea: idea.id })
  return (
    <div className="flex flex-col gap-3" data-ideas-view>
      <p className="text-xs text-muted">Rough ideas from you and your agents. An idea never starts work. Riff on one in a chat, then make it a spec when it is ready.</p>
      <div>
        <SegmentedControl
          layoutId="avoozl-ideas-state"
          ariaLabel="Ideas to show"
          segments={IDEA_STATES.map((entry) => ({ key: entry.key, label: `${entry.label} (${ideasOf(ideas, entry.key).length})` }))}
          value={state}
          onChange={(key: IdeaState) => setState(key)}
        />
      </div>
      {chat.error && (
        <p role="alert" className="text-sm text-danger">
          {chat.error}
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={36} aria-hidden="true" />}
          title={state === 'open' ? 'No ideas yet' : state === 'archived' ? 'Nothing archived' : 'No idea has become a spec yet'}
          subtitle={state === 'open' ? 'Use New idea to jot one down. Agents can add ideas too.' : 'Ideas show here when they move.'}
        />
      ) : props.narrow ? (
        <ul className="flex flex-col gap-2" data-ideas-stack>
          {shown.map((idea) => (
            <li key={idea.id} className="rounded border p-3" style={{ borderColor: 'var(--border)' }}>
              <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setOpenId(idea.id)}>
                {idea.title}
              </button>
              <p className="mt-1 text-xs text-muted">
                {count(idea.notes.length, 'note')} · {count(idea.links.length, 'link')} · {relativeTime(idea.updatedAt)} {stateBadge(idea)}
              </p>
              {idea.state === 'open' && (
                <div className="mt-2 flex gap-1.5">
                  <IconBtn icon={MessagesSquare} label={`Riff on ${idea.title}`} tooltip={RIFF_TIP} onClick={() => riff(idea)} />
                  <IconBtn icon={FileText} label={`Make ${idea.title} a spec`} tooltip={MAKE_SPEC_TIP} onClick={() => props.onMakeSpec(idea)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }} data-ideas-table>
            <thead>
              <tr>
                <th style={HEAD}>Idea</th>
                <th style={HEAD}>Notes</th>
                <th style={HEAD}>Links</th>
                <th style={HEAD}>By</th>
                <th style={HEAD}>Changed</th>
                <th style={HEAD}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((idea) => (
                <tr key={idea.id} data-idea-row={idea.id}>
                  <td style={{ ...CELL, minWidth: '16rem' }}>
                    <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setOpenId(idea.id)}>
                      {idea.title}
                    </button>{' '}
                    {stateBadge(idea)}
                  </td>
                  <td style={CELL} className="tabular-nums">
                    {idea.notes.length}
                  </td>
                  <td style={CELL} className="tabular-nums">
                    {idea.links.length}
                  </td>
                  <td style={CELL} className="text-muted">
                    {idea.author}
                  </td>
                  <td style={{ ...CELL, whiteSpace: 'nowrap' }} className="text-muted">
                    {relativeTime(idea.updatedAt)}
                  </td>
                  <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                    {idea.state === 'open' && (
                      <span className="flex gap-1.5">
                        <IconBtn icon={MessagesSquare} label={`Riff on ${idea.title}`} tooltip={RIFF_TIP} onClick={() => riff(idea)} />
                        <IconBtn icon={FileText} label={`Make ${idea.title} a spec`} tooltip={MAKE_SPEC_TIP} onClick={() => props.onMakeSpec(idea)} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {current && (
        <IdeaDialog
          workspaceId={props.workspaceId}
          idea={current}
          onChanged={(next) => {
            setChanged({ ...changed, [next.id]: next })
            props.onChanged()
          }}
          onClose={() => setOpenId(null)}
          onRiff={() => riff(current)}
          onMakeSpec={() => {
            setOpenId(null)
            props.onMakeSpec(current)
          }}
        />
      )}
    </div>
  )
}
