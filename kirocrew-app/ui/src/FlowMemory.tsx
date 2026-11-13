// The Flow tab's Proposals and Lessons views (design §4.18, R68.14, R69.10,
// R70.7). Proposals lists every retro proposal with its diff, evidence and
// cited lessons, the prompt versions in use with Revert, and each override
// an update changed, as a three-way diff with its rebase. Lessons lists what
// retros learned on this computer, with confidence, last confirmed, state
// and history. Every write here is a person's: Approve, Reject, Revert,
// Approve rebase and Export.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { FilterPanel } from './FilterPanel.tsx'
import { SectionHeading, dangerStyle, useConfirm } from './controls.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  STAGES,
  STAGE_LABELS,
  diffLines,
  directionText,
  evidenceText,
  flowClient,
  lessonStateText,
  pdcaText,
  proposalText,
  shareResultText,
  type LessonFilter,
  type SharePreview,
  type LessonRow,
  type PromptDrift,
  type PromptRow,
  type Proposal,
  type ProposalsModel,
} from './flow-api.ts'

const LINE = { add: 'var(--success, #1a7f37)', del: 'var(--danger)', hunk: 'var(--muted)', same: 'var(--text)' } as const

export function DiffBlock({ diff, label }: { diff: string | undefined; label: string }) {
  const lines = diffLines(diff)
  if (!lines.length) return null
  return (
    <pre
      aria-label={label}
      className="max-h-64 overflow-auto rounded border p-2 text-xs"
      style={{ borderColor: 'var(--border)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}
      data-diff
    >
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', color: LINE[line.kind] }}>
          {line.text || ' '}
        </span>
      ))}
    </pre>
  )
}

function ProposalCard({ proposal, busy, onDecide }: { proposal: Proposal & { retro: string }; busy: boolean; onDecide: (p: Proposal & { retro: string }, d: 'approve' | 'reject') => void }) {
  const pdca = pdcaText(proposal)
  return (
    <li className="flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0 text-sm" style={{ borderColor: 'var(--border)' }} data-proposal={`${proposal.retro}:${proposal.id}`}>
      <span className="flex flex-wrap items-center gap-2" style={{ overflowWrap: 'anywhere' }}>
        <Badge>{proposal.type}</Badge>
        <code className="text-xs">{proposalText(proposal)}</code>
        <span className="text-muted">{directionText(proposal)}</span>
        <span className="text-xs text-muted">{proposal.retro}</span>
        {proposal.revertOf && <Badge>revert</Badge>}
        {proposal.pdca?.mixed && <Badge variant="warning">mixed window</Badge>}
      </span>
      {proposal.base && <span className="text-xs text-muted">Base {proposal.base.slice(0, 12)}</span>}
      <DiffBlock diff={proposal.diff} label={`Diff of ${proposalText(proposal)}`} />
      <span className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
        Evidence: {evidenceText(proposal)}
      </span>
      {proposal.lessons && proposal.lessons.length > 0 && <span className="text-xs text-muted">Cites {proposal.lessons.join(', ')}</span>}
      {proposal.lessonRefused && <span className="text-xs text-muted">Its lesson was not kept: {proposal.lessonRefused}.</span>}
      {proposal.leaf && <span className="text-xs">Delivered as task {proposal.leaf}.</span>}
      {proposal.note && <span className="text-xs">A suggested change waits on {proposal.note.plugin ? `plugin ${proposal.note.plugin}'s card` : 'this page'}; nothing was sent.</span>}
      {proposal.status !== 'open' ? (
        <span className="text-xs">
          {proposal.status === 'approved' ? 'Approved' : `Rejected${proposal.reason ? `: ${proposal.reason}` : ''}`}
          {pdca ? ` · ${pdca}` : ''}
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Btn type="button" disabled={busy} onClick={() => onDecide(proposal, 'reject')}>
            Reject
          </Btn>
          <Btn type="button" primary disabled={busy} onClick={() => onDecide(proposal, 'approve')}>
            Approve
          </Btn>
        </div>
      )}
    </li>
  )
}

function DriftBlock({ drift, target, busy, onRebase }: { drift: PromptDrift; target: string; busy: boolean; onRebase: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 rounded border p-2 text-sm" style={{ borderColor: 'var(--warning, var(--border))' }} data-prompt-drift={`${target}:${drift.section}`}>
      <span className="font-medium">
        The built-in {target} § {drift.section} changed under your override.
      </span>
      <span className="text-xs text-muted">Sessions keep your override until you approve the rebase.</span>
      <span className="text-xs font-medium">Built-in: old to new</span>
      <DiffBlock diff={drift.diffs.builtIn} label="Built-in change" />
      <span className="text-xs font-medium">Your override against the old built-in</span>
      <DiffBlock diff={drift.diffs.override} label="Override" />
      {drift.conflict ? (
        <span className="text-xs text-danger">The override does not merge onto the new text. Revert it, or approve a new proposal later.</span>
      ) : (
        <>
          <span className="text-xs font-medium">Rebased override</span>
          <pre className="max-h-48 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {drift.rebased}
          </pre>
          <div>
            <Btn type="button" primary disabled={busy} onClick={onRebase}>
              Approve rebase
            </Btn>
          </div>
        </>
      )}
    </div>
  )
}

function PromptVersions({ prompts, busy, onRevert, onRebase }: { prompts: PromptRow[]; busy: boolean; onRevert: (p: PromptRow) => void; onRebase: (p: PromptRow, d: PromptDrift) => void }) {
  return (
    <Card className="flex flex-col gap-2" data-prompt-versions>
      <SectionHeading title="Prompt versions" />
      <p className="text-xs text-muted">Overrides live on this computer, for this workspace only. Locked sections always use the built-in text.</p>
      <ul className="flex flex-col gap-2">
        {prompts.map((p) => (
          <li key={p.target} className="flex flex-col gap-1.5 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <code className="text-xs">{p.target}</code>
              <span className="text-muted">{p.active ? `override ${p.version.split('+')[1] ?? ''}` : 'built-in'}</span>
              {p.versions.length > 0 && <span className="text-xs text-muted">last change {relativeTime(p.versions.at(-1)!.at, Date.now())}</span>}
              {p.drift.length > 0 && <Badge variant="warning">built-in changed</Badge>}
              {p.versions.length > 0 && (
                <Btn type="button" disabled={busy} onClick={() => onRevert(p)} style={dangerStyle}>
                  Revert
                </Btn>
              )}
            </span>
            {p.drift.map((d) => (
              <DriftBlock key={d.section} drift={d} target={p.target} busy={busy} onRebase={() => onRebase(p, d)} />
            ))}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ProposalsView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const confirm = useConfirm()
  const load = useCallback((id: string) => client.proposals(id), [client])
  const { value, error, reload } = useRead<ProposalsModel>(workspaceId, load)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const act = async (run: () => Promise<unknown>) => {
    setBusy(true)
    setMessage(null)
    try {
      await run()
      await reload()
    } catch (caught) {
      setMessage(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value || !workspaceId) return <p className="text-sm text-muted">Loading…</p>
  const changes = value.proposals.filter((p) => ['prompt', 'skill', 'lesson'].includes(p.type))
  return (
    <div className="flex flex-col gap-3" data-flow-proposals>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      {!value.available && <p className="text-sm text-muted">This Avoozl process has no settings folder, so prompt overrides and lessons are off.</p>}
      <Card className="flex flex-col gap-2">
        <SectionHeading title="Prompt and skill proposals" />
        <p className="text-xs text-muted">A retro may propose a change to what agents are told. Nothing changes until you approve it.</p>
        {!changes.length ? (
          <p className="text-sm text-muted">No prompt, skill or lesson proposals yet. Settings and spec proposals are under Overview.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {changes.map((p) => (
              <ProposalCard
                key={`${p.retro}:${p.id}`}
                proposal={p}
                busy={busy}
                onDecide={(q, decision) =>
                  void act(async () => {
                    if (decision === 'approve' && q.type === 'lesson' && q.kind === 'retire') {
                      const yes = await confirm({ title: 'Retire these lessons?', body: `${(q.lessons ?? []).join(', ')} stop being offered and count as "did not work". They stay as history.`, action: 'Retire' })
                      if (!yes) return
                    }
                    await client.decide(workspaceId, { retroId: q.retro, proposalId: q.id, decision })
                  })
                }
              />
            ))}
          </ul>
        )}
        {value.dropped.some((d) => d.type) && (
          <span className="text-xs text-muted">
            Dropped: {value.dropped.filter((d) => d.type).map((d) => `${d.retro} ${d.key ?? d.index} (${d.reason})`).join('; ')}
          </span>
        )}
      </Card>
      <PromptVersions
        prompts={value.prompts}
        busy={busy}
        onRevert={(p) =>
          void act(async () => {
            const yes = await confirm({ title: `Revert ${p.target}?`, body: 'Sessions that start after this use the version before it. The revert is recorded, and you can revert it too.', action: 'Revert' })
            if (yes) await client.revertPrompt(workspaceId, p.target)
          })
        }
        onRebase={(p, d) => void act(() => client.rebasePrompt(workspaceId, { target: p.target, section: d.section, hash: d.hash! }))}
      />
      {value.notes.filter((n) => !n.plugin).length > 0 && (
        <Card className="flex flex-col gap-2">
          <SectionHeading title="Suggested skill changes" />
          <p className="text-xs text-muted">For skills no plugin owns. Copy one to its owner; Avoozl sends nothing.</p>
          {value.notes
            .filter((n) => !n.plugin)
            .map((n) => (
              <SkillNoteCard key={`${n.retro}:${n.proposal}`} note={n} />
            ))}
        </Card>
      )}
    </div>
  )
}

export function SkillNoteCard({ note }: { note: { file: string; diff: string; summary: string } }) {
  const [copied, setCopied] = useState(false)
  const text = `Suggested change to ${note.file}\n\n${note.summary}\n\n${note.diff}\n`
  return (
    <div className="flex flex-col gap-1 text-sm" data-skill-note={note.file}>
      <span className="font-medium">
        Suggested change to <code className="text-xs">{note.file}</code>
      </span>
      <span className="text-xs text-muted">{note.summary}</span>
      <DiffBlock diff={note.diff} label={`Suggested change to ${note.file}`} />
      <div>
        <Btn
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>
    </div>
  )
}

function LessonItem({ lesson }: { lesson: LessonRow }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0 text-sm" style={{ borderColor: 'var(--border)' }} data-lesson={lesson.id}>
      <span className="flex flex-wrap items-center gap-2">
        <code className="text-xs">{lesson.id}</code>
        <span className="text-xs text-muted">{[lesson.pattern.stage, lesson.pattern.check, lesson.pattern.tool].filter(Boolean).join(' · ')}</span>
        <Badge variant={lesson.state === 'ok' ? (lesson.outcome === 'undone' ? 'warning' : undefined) : 'warning'}>{lessonStateText({ ...lesson, staleReason: null })}</Badge>
        <span className="tabular-nums text-xs">confidence {lesson.confidence.toFixed(2)}</span>
      </span>
      {lesson.staleReason && (
        <span className="text-xs" style={{ color: 'var(--warning, var(--text))', overflowWrap: 'anywhere' }} data-stale-reason>
          {lesson.state === 'retired' ? 'Retired' : 'Why'}: {lesson.staleReason}
        </span>
      )}
      <span style={{ overflowWrap: 'anywhere' }}>{lesson.finding}</span>
      <span className="text-xs text-muted">
        {lesson.change.summary ?? lesson.change.type} · {lesson.confirmedAt ? `confirmed ${relativeTime(lesson.confirmedAt, Date.now())}` : 'not confirmed yet'} · from {lesson.source}
      </span>
      <div>
        <Btn type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide history' : 'History'}
        </Btn>
      </div>
      {open && (
        <ol className="flex flex-col gap-0.5 text-xs text-muted" data-lesson-history>
          {lesson.history.map((h, i) => (
            <li key={i}>
              {relativeTime(h.at, Date.now())}: {h.what}
              {h.state ? ` ${h.state}` : ''}
              {h.outcome ? ` ${h.outcome}` : ''}
              {h.reason ? ` (${h.reason})` : ''} by {h.by}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

export function LessonsView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const [filter, setFilter] = useState<LessonFilter>({})
  const key = JSON.stringify(filter)
  const load = useCallback((id: string) => client.lessons(id, JSON.parse(key)), [client, key])
  const { value, error } = useRead(workspaceId, load)
  const [file, setFile] = useState('')
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const set = (change: Partial<LessonFilter>) => setFilter({ ...filter, ...change })
  const [picked, setPicked] = useState<string[]>([])
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [shareMsg, setShareMsg] = useState<{ ok?: string; error?: string } | null>(null)
  const shareAct = async (run: () => Promise<void>) => {
    setShareMsg(null)
    try {
      await run()
    } catch (caught) {
      setShareMsg({ error: errorMessage(caught) })
    }
  }
  const exportNow = async () => {
    if (!workspaceId) return
    setMessage(null)
    try {
      const result = await client.exportLessons(workspaceId, file.trim())
      setMessage({ ok: `Wrote ${result.lessons} lessons to ${result.path}.` })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  return (
    <div className="flex flex-col gap-3" data-flow-lessons>
      <p className="text-sm text-muted">What retros learned, kept on this computer. Lessons hold summaries only, never task text, paths or repository names.</p>
      <FilterPanel
        id="avoozl-lessons"
        label="Filter lessons"
        active={Object.values(filter).some(Boolean)}
        onClear={() => setFilter({})}
        fields={[
          { kind: 'select', key: 'stage', label: 'Pattern', value: filter.stage ?? '', options: STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })), onChange: (stage) => set({ stage: stage || undefined }) },
          { kind: 'select', key: 'outcome', label: 'Outcome', value: filter.outcome ?? '', options: ['untested', 'kept', 'undone'].map((v) => ({ value: v, label: v })), onChange: (outcome) => set({ outcome: outcome || undefined }) },
          { kind: 'select', key: 'source', label: 'Source', value: filter.source ?? '', options: [{ value: 'this', label: 'This workspace' }, { value: 'other', label: 'Other workspaces' }, { value: 'pack', label: 'Plugin packs' }], onChange: (source) => set({ source: source || undefined }) },
          { kind: 'select', key: 'state', label: 'State', value: filter.state ?? '', options: ['ok', 'stale', 'needs re-check', 'retired'].map((v) => ({ value: v, label: v })), onChange: (state) => set({ state: state || undefined }) },
        ]}
      />
      <Card className="flex flex-col gap-2">
        <SectionHeading title="Lessons" />
        {!value.lessons.length ? (
          <p className="text-sm text-muted">No lessons yet. A lesson is written when you approve a retro proposal that carries one.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {value.lessons.map((l) => (
              <LessonItem key={l.id} lesson={l} />
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex flex-col gap-2" data-lessons-share>
        <SectionHeading title="Share proven lessons" />
        {value.share?.off ? (
          <p className="text-sm text-muted">{value.share.off}</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Pick lessons to share with your team as summaries in {value.share?.file ?? '.avoozl/lessons.json'} on {value.share?.repository ?? 'the repository'}. Avoozl opens a pull request; nothing else leaves this computer.
            </p>
            {!(value.candidates ?? []).length ? (
              <p className="text-sm text-muted">No candidates yet. A lesson can be shared once the PDCA check keeps it.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm" data-share-candidates>
                {(value.candidates ?? []).map((c) => (
                  <li key={c.id}>
                    <label className="flex flex-wrap items-baseline gap-2">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.id)}
                        onChange={(event) => {
                          setPreview(null)
                          setPicked(event.target.checked ? [...picked, c.id] : picked.filter((id) => id !== c.id))
                        }}
                      />
                      <code className="text-xs">{c.id}</code>
                      <span className="text-xs text-muted">{c.why}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn type="button" disabled={!picked.length} onClick={() => void shareAct(async () => setPreview(await client.sharePreview(workspaceId!, picked)))}>
                Preview share
              </Btn>
              {preview && (
                <Btn
                  type="button"
                  primary
                  onClick={() =>
                    void shareAct(async () => {
                      const result = await client.share(workspaceId!, picked, preview.hash)
                      setShareMsg({ ok: shareResultText(result) })
                      setPreview(null)
                      setPicked([])
                    })
                  }
                >
                  Share
                </Btn>
              )}
            </div>
            {preview && (
              <pre className="max-h-64 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)', whiteSpace: 'pre-wrap', margin: 0 }} data-share-preview>
                {preview.text}
              </pre>
            )}
            {shareMsg?.error && (
              <span role="alert" className="text-sm text-danger">
                {shareMsg.error}
              </span>
            )}
            {shareMsg?.ok && <span className="text-sm text-muted">{shareMsg.ok}</span>}
          </>
        )}
      </Card>
      <Card className="flex flex-col gap-2" data-lessons-export>
        <SectionHeading title="Export as a pack" />
        <p className="text-xs text-muted">Export writes a lessons pack file you can put in a plugin; it passes your content rules first.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: '28rem', flex: '1 1 16rem' }}>
            <span className="font-medium">Pack file (required)</span>
            <Input value={file} placeholder="/path/to/avoozl-lessons.json" onChange={(event) => setFile(event.target.value)} />
          </label>
          <Btn type="button" disabled={!file.trim()} onClick={() => void exportNow()}>
            Export lessons
          </Btn>
        </div>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
      </Card>
    </div>
  )
}
