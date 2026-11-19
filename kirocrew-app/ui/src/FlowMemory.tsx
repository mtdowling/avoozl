// The Retros pill's Proposals page (design §4.18, R68.14; moved from Flow
// 2026-11-17): every retro proposal with its diff and evidence and a link
// back to the retro that made it, the prompt versions in use with Revert,
// and each override an update changed, as a three-way diff with its rebase.
// Every write here is a person's: Approve, Reject, Revert and Approve
// rebase. The Lessons view went with the lessons store (RC30.4).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { AskForHelp, SectionHeading, useConfirm } from './ui/controls.tsx'
import { Button } from './ui/Button.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { diffLines, directionText, evidenceText, flowClient, pdcaText, proposalText, type PromptDrift, type PromptRow, type Proposal, type ProposalsModel } from './flow-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

const LINE = { add: 'var(--success, #1a7f37)', del: 'var(--danger)', hunk: 'var(--muted)', same: 'var(--text)' } as const

export function DiffBlock({ diff, label }: { diff: string | undefined; label: string }) {
  const lines = diffLines(diff)
  if (!lines.length) return null
  return (
    <Box
      aria-label={label}
      as="pre"
      css-border-color="border"
      css-white-space="pre-wrap"
      css-overflow-wrap="anywhere"
      css-margin="0"
      maxH64
      overflow="auto"
      rounded="base"
      border="all"
      p="2"
      size="xs"
      data-diff
    >
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', color: LINE[line.kind] }}>
          {line.text || ' '}
        </span>
      ))}
    </Box>
  )
}

function ProposalCard({
  proposal,
  busy,
  linked,
  onDecide,
  onOpenRetro,
}: {
  proposal: Proposal & { retro: string }
  busy: boolean
  linked: boolean
  onDecide: (p: Proposal & { retro: string }, d: 'approve' | 'reject') => void
  onOpenRetro: () => void
}) {
  const pdca = pdcaText(proposal)
  return (
    <li
      className="flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0 text-sm"
      data-proposal={`${proposal.retro}:${proposal.id}`}
      data-linked={linked || undefined}
      style={{ borderColor: 'var(--border)', ...(linked ? { boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 6, padding: 8 } : {}) }}
    >
      <Box as="span" css-overflow-wrap="anywhere" flex flexWrap items="center" gap="2">
        <Badge>{proposal.type}</Badge>
        <Box as="code" size="xs">
          {proposalText(proposal)}
        </Box>
        <Hint>{directionText(proposal)}</Hint>
        <PlainButton type="button" size="xs" underline data-proposal-retro={proposal.retro} onClick={onOpenRetro}>
          From {proposal.retro}
        </PlainButton>
        {proposal.removesCheck && <Badge variant="warning">removes a check</Badge>}
        {proposal.revertOf && <Badge>revert</Badge>}
        {proposal.pdca?.mixed && <Badge variant="warning">mixed window</Badge>}
      </Box>
      {proposal.base && <Hint size="xs">Base {proposal.base.slice(0, 12)}</Hint>}
      <DiffBlock diff={proposal.diff} label={`Diff of ${proposalText(proposal)}`} />
      <Box as="span" css-overflow-wrap="anywhere" size="xs" tone="muted">
        Evidence: {evidenceText(proposal)}
      </Box>
      {proposal.leaf && (
        <Box as="span" size="xs">
          Delivered as task {proposal.leaf}.
        </Box>
      )}
      {proposal.note && (
        <Box as="span" size="xs">
          A suggested change waits on {proposal.note.plugin ? `plugin ${proposal.note.plugin}'s card` : 'this page'}; nothing was sent.
        </Box>
      )}
      {proposal.status !== 'open' ? (
        <Box as="span" size="xs">
          {proposal.status === 'approved' ? 'Approved' : `Rejected${proposal.reason ? `: ${proposal.reason}` : ''}`}
          {pdca ? ` · ${pdca}` : ''}
        </Box>
      ) : (
        <Row gap={2} align="start">
          <Btn type="button" disabled={busy} onClick={() => onDecide(proposal, 'reject')}>
            Reject
          </Btn>
          <Btn type="button" primary disabled={busy} onClick={() => onDecide(proposal, 'approve')}>
            Approve
          </Btn>
        </Row>
      )}
    </li>
  )
}

function DriftBlock({ drift, target, busy, onRebase }: { drift: PromptDrift; target: string; busy: boolean; onRebase: () => void }) {
  return (
    <Box css-border-color="warning-border" flex flexCol gap="1.5" rounded="base" border="all" p="2" size="sm" data-prompt-drift={`${target}:${drift.section}`}>
      <Box as="span" weight="medium">
        The built-in {target} § {drift.section} changed under your override.
      </Box>
      <Hint size="xs">Sessions keep your override until you approve the rebase.</Hint>
      <Box as="span" size="xs" weight="medium">
        Built-in: old to new
      </Box>
      <DiffBlock diff={drift.diffs.builtIn} label="Built-in change" />
      <Box as="span" size="xs" weight="medium">
        Your override against the old built-in
      </Box>
      <DiffBlock diff={drift.diffs.override} label="Override" />
      {drift.conflict ? (
        <ErrorText as="span" size="xs">
          The override does not merge onto the new text. Revert it, or approve a new proposal later.
        </ErrorText>
      ) : (
        <>
          <Box as="span" size="xs" weight="medium">
            Rebased override
          </Box>
          <Box as="pre" css-border-color="border" css-white-space="pre-wrap" css-margin="0" maxH48 overflow="auto" rounded="base" border="all" p="2" size="xs">
            {drift.rebased}
          </Box>
          <div>
            <Btn type="button" primary disabled={busy} onClick={onRebase}>
              Approve rebase
            </Btn>
          </div>
        </>
      )}
    </Box>
  )
}

function PromptVersions({
  prompts,
  busy,
  onRevert,
  onRebase,
}: {
  prompts: PromptRow[]
  busy: boolean
  onRevert: (p: PromptRow) => void
  onRebase: (p: PromptRow, d: PromptDrift) => void
}) {
  return (
    <Card flex flexCol gap="2" data-prompt-versions>
      <SectionHeading title="Prompt versions" />
      <Hint as="p" size="xs">
        Overrides live on this computer, for this workspace only. Locked sections always use the built-in text.
      </Hint>
      <Stack as="ul" gap={2}>
        {prompts.map((p) => (
          <Box key={p.target} as="li" flex flexCol gap="1.5" size="sm">
            <Row as="span" gap={2}>
              <Box as="code" size="xs">
                {p.target}
              </Box>
              <Hint>{p.active ? `override ${p.version.split('+')[1] ?? ''}` : 'built-in'}</Hint>
              {p.versions.length > 0 && <Hint size="xs">last change {relativeTime(p.versions.at(-1)!.at, Date.now())}</Hint>}
              {p.drift.length > 0 && <Badge variant="warning">built-in changed</Badge>}
              {p.versions.length > 0 && (
                <Button type="button" variant="danger" disabled={busy} onClick={() => onRevert(p)}>
                  Revert
                </Button>
              )}
            </Row>
            {p.drift.map((d) => (
              <DriftBlock key={d.section} drift={d} target={p.target} busy={busy} onRebase={() => onRebase(p, d)} />
            ))}
          </Box>
        ))}
      </Stack>
    </Card>
  )
}

export function ProposalsView({
  workspaceId,
  target,
  onOpenRetro,
  onSeen,
}: {
  workspaceId: string | null
  target?: { retro: string; proposal?: string } | null
  onOpenRetro?: (retro: string) => void
  onSeen?: () => void
}) {
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
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!value || !workspaceId)
    return (
      <Hint as="p" size="sm">
        Loading…
      </Hint>
    )
  const changes = value.proposals
  const decide = (p: Proposal & { retro: string }, decision: 'approve' | 'reject') =>
    act(async () => {
      let confirmRemoval = false
      if (decision === 'approve' && p.removesCheck) {
        confirmRemoval = await confirm({
          title: 'Approve removing a check?',
          body: `${proposalText(p)} removes a review role or a declared check, so fewer things are checked before work lands.`,
          action: 'Remove the check',
        })
        if (!confirmRemoval) return
      }
      // Only a settings change is checked against the file's hash.
      const expectedHash = p.type === 'settings' ? (await client.settings(workspaceId)).hash : undefined
      await client.decide(workspaceId, {
        retroId: p.retro,
        proposalId: p.id,
        decision,
        ...(expectedHash ? { expectedHash } : {}),
        ...(confirmRemoval ? { confirmRemoval: true } : {}),
      })
    })
  return (
    <Stack gap={3} data-flow-proposals>
      {message && (
        <ErrorText role="alert" size="sm">
          {message}
        </ErrorText>
      )}
      {!value.available && (
        <Box as="p" flex flexWrap items="center" gapX="3" gapY="1" size="sm" tone="muted">
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
        </Box>
      )}
      <Card flex flexCol gap="2">
        <SectionHeading title="Proposals" />
        <Hint as="p" size="xs">
          A retro may propose a change to settings, specs, rules, or what agents are told. Nothing changes until you approve it.
        </Hint>
        {!changes.length ? (
          <Hint as="p" size="sm">
            No proposals yet. A retro runs after 10 finished tasks.
          </Hint>
        ) : (
          <Stack as="ul" gap={3}>
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
          </Stack>
        )}
        {value.dropped.length > 0 && <Hint size="xs">Dropped: {value.dropped.map((d) => `${d.retro} ${d.key ?? d.index} (${d.reason})`).join('; ')}</Hint>}
      </Card>
      <PromptVersions
        prompts={value.prompts}
        busy={busy}
        onRevert={(p) =>
          void act(async () => {
            const yes = await confirm({
              title: `Revert ${p.target}?`,
              body: 'Sessions that start after this use the version before it. The revert is recorded, and you can revert it too.',
              action: 'Revert',
            })
            if (yes) await client.revertPrompt(workspaceId, p.target)
          })
        }
        onRebase={(p, d) => void act(() => client.rebasePrompt(workspaceId, { target: p.target, section: d.section, hash: d.hash! }))}
      />
      {value.notes.filter((n) => !n.plugin).length > 0 && (
        <Card flex flexCol gap="2">
          <SectionHeading title="Suggested skill changes" />
          <Hint as="p" size="xs">
            For skills no plugin owns. Copy one to its owner; Avoozl sends nothing.
          </Hint>
          {value.notes
            .filter((n) => !n.plugin)
            .map((n) => (
              <SkillNoteCard key={`${n.retro}:${n.proposal}`} note={n} />
            ))}
        </Card>
      )}
    </Stack>
  )
}

export function SkillNoteCard({ note }: { note: { file: string; diff: string; summary: string } }) {
  const [copied, setCopied] = useState(false)
  const text = `Suggested change to ${note.file}\n\n${note.summary}\n\n${note.diff}\n`
  return (
    <Box flex flexCol gap="1" size="sm" data-skill-note={note.file}>
      <Box as="span" weight="medium">
        Suggested change to{' '}
        <Box as="code" size="xs">
          {note.file}
        </Box>
      </Box>
      <Hint size="xs">{note.summary}</Hint>
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
    </Box>
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
