// The Retros pill's Proposals page (design §4.18, R68.14; moved from Flow
// 2026-11-17): every retro proposal with its diff and evidence and a link
// back to the retro that made it, the prompt versions in use with Revert,
// and each override an update changed, as a three-way diff with its rebase.
// Every write here is a person's: Approve, Reject, Revert and Approve
// rebase. The Lessons view went with the lessons store (RC30.4).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { AskForHelp, SectionHeading, dangerStyle, useConfirm } from './controls.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  diffLines,
  directionText,
  evidenceText,
  flowClient,
  pdcaText,
  proposalText,
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

function ProposalCard({ proposal, busy, linked, onDecide, onOpenRetro }: { proposal: Proposal & { retro: string }; busy: boolean; linked: boolean; onDecide: (p: Proposal & { retro: string }, d: 'approve' | 'reject') => void; onOpenRetro: () => void }) {
  const pdca = pdcaText(proposal)
  return (
    <li className="flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0 text-sm" data-proposal={`${proposal.retro}:${proposal.id}`} data-linked={linked || undefined} style={{ borderColor: 'var(--border)', ...(linked ? { boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 6, padding: 8 } : {}) }}>
      <span className="flex flex-wrap items-center gap-2" style={{ overflowWrap: 'anywhere' }}>
        <Badge>{proposal.type}</Badge>
        <code className="text-xs">{proposalText(proposal)}</code>
        <span className="text-muted">{directionText(proposal)}</span>
        <button type="button" className="text-xs underline" data-proposal-retro={proposal.retro} onClick={onOpenRetro}>
          From {proposal.retro}
        </button>
        {proposal.removesCheck && <Badge variant="warning">removes a check</Badge>}
        {proposal.revertOf && <Badge>revert</Badge>}
        {proposal.pdca?.mixed && <Badge variant="warning">mixed window</Badge>}
      </span>
      {proposal.base && <span className="text-xs text-muted">Base {proposal.base.slice(0, 12)}</span>}
      <DiffBlock diff={proposal.diff} label={`Diff of ${proposalText(proposal)}`} />
      <span className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
        Evidence: {evidenceText(proposal)}
      </span>
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

export function ProposalsView({ workspaceId, target, onOpenRetro, onSeen }: { workspaceId: string | null; target?: { retro: string; proposal?: string } | null; onOpenRetro?: (retro: string) => void; onSeen?: () => void }) {
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
  const proposals = value?.proposals
  useScrollTo(target ? `[data-proposal="${target.retro}:${target.proposal ?? ''}"]` : null, Boolean(proposals), onSeen)
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value || !workspaceId) return <p className="text-sm text-muted">Loading…</p>
  const changes = value.proposals
  const decide = (p: Proposal & { retro: string }, decision: 'approve' | 'reject') =>
    act(async () => {
      let confirmRemoval = false
      if (decision === 'approve' && p.removesCheck) {
        confirmRemoval = await confirm({ title: 'Approve removing a check?', body: `${proposalText(p)} removes a review role or a declared check, so fewer things are checked before work lands.`, action: 'Remove the check' })
        if (!confirmRemoval) return
      }
      // Only a settings change is checked against the file's hash.
      const expectedHash = p.type === 'settings' ? (await client.settings(workspaceId)).hash : undefined
      await client.decide(workspaceId, { retroId: p.retro, proposalId: p.id, decision, ...(expectedHash ? { expectedHash } : {}), ...(confirmRemoval ? { confirmRemoval: true } : {}) })
    })
  return (
    <div className="flex flex-col gap-3" data-flow-proposals>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      {value.lessonsExport?.error && (
        <p role="alert" className="text-sm text-danger" data-lessons-export>
          {value.lessonsExport.error}
        </p>
      )}
      {!value.available && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>This Avoozl process has no settings folder, so prompt overrides are off.</span>
          <AskForHelp
            workspaceId={workspaceId}
            help={{
              page: 'Retros › Proposals',
              section: 'Prompt overrides are off',
              says: 'This Avoozl process has no settings folder, so prompt overrides are off.',
              settings: [{ key: 'settings folder', value: 'none for this process' }],
              docs: 'README.md, sections Flow and Configuration and secrets',
            }}
          />
        </p>
      )}
      <Card className="flex flex-col gap-2">
        <SectionHeading title="Proposals" />
        <p className="text-xs text-muted">A retro may propose a change to settings, specs, rules, or what agents are told. Nothing changes until you approve it.</p>
        {!changes.length ? (
          <p className="text-sm text-muted">No proposals yet. A retro runs after 10 finished tasks.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {changes.map((p) => (
              <ProposalCard
                key={`${p.retro}:${p.id}`}
                proposal={p}
                busy={busy}
                linked={Boolean(target && target.retro === p.retro && target.proposal === p.id)}
                onDecide={(q, decision) => void decide(q, decision)}
                onOpenRetro={() => onOpenRetro?.(p.retro)}
              />
            ))}
          </ul>
        )}
        {value.dropped.length > 0 && (
          <span className="text-xs text-muted">
            Dropped: {value.dropped.map((d) => `${d.retro} ${d.key ?? d.index} (${d.reason})`).join('; ')}
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

// Scroll to the element a link named once the page has its data, then let go
// of the target after a moment so the mark fades.
export function useScrollTo(selector: string | null, ready: boolean, onSeen?: () => void) {
  useEffect(() => {
    if (!selector || !ready) return
    document.querySelector(selector)?.scrollIntoView?.({ block: 'center' })
    const timer = setTimeout(() => onSeen?.(), 3000)
    return () => clearTimeout(timer)
  }, [selector, ready]) // eslint-disable-line react-hooks/exhaustive-deps
}
