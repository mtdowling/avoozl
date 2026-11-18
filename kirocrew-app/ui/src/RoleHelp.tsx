// What the roles make (R105.4): one card per outcome, with the picture,
// "Use it when" and facts the old mode panes showed. Read only; the role
// itself is picked in each repository's row. Theme variables only.
import type { CSSProperties, ReactNode } from 'react'
import { MODE_CARDS } from './settings-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

const OPEN = 'var(--ok)'
const MERGED = 'var(--tile-purple, var(--accent))'

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-4"
      style={{ background: color, color: 'var(--card)' }}
    >
      {children}
    </span>
  )
}

function Lock() {
  return (
    <svg width={10} height={10} viewBox="0 0 16 16" aria-label="private" role="img" style={{ flex: 'none' }}>
      <path
        fill="currentColor"
        d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0Z"
      />
    </svg>
  )
}

function IssueIcon({ color }: { color: string }) {
  return (
    <svg width={11} height={11} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', color }}>
      <circle cx={8} cy={8} r={6.25} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={8} cy={8} r={1.6} fill="currentColor" />
    </svg>
  )
}

function PullIcon({ color }: { color: string }) {
  return (
    <svg width={11} height={11} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', color }}>
      <circle cx={4} cy={3.5} r={1.8} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx={4} cy={12.5} r={1.8} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx={12} cy={12.5} r={1.8} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path d="M4 5.3v5.4M12 10.7V6.5A2 2 0 0 0 10 4.5H7.5" fill="none" stroke="currentColor" strokeWidth={1.4} />
    </svg>
  )
}

const box: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--card)',
  minWidth: 0,
  overflow: 'hidden',
}

// One repository in GitHub's look: a header with owner/name, then rows.
function Repo({ name, locked, children }: { name: string; locked?: boolean; children: ReactNode }) {
  return (
    <div style={box} className="flex-1 text-[11px] leading-4">
      <div
        className="flex items-center gap-1 px-2 py-1 font-semibold"
        style={{ background: 'var(--bg-elevated, transparent)', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}
      >
        {locked && <Lock />}
        <Box as="span" truncate>{name}</Box>
      </div>
      <Stack>{children}</Stack>
    </div>
  )
}

function Row({ icon, title, pill, sub }: { icon: ReactNode; title: string; pill: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1" style={{ borderTop: '1px solid var(--border)' }}>
      <Box flex items="center" gap="1">
        {icon}
        <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text)' }}>
          {title}
        </span>
        {pill}
      </Box>
      {sub && <Box truncate tone="muted">{sub}</Box>}
    </div>
  )
}

function PlansRepoPicture() {
  return (
    <div aria-hidden="true">
    <Box flex gap="3">
      <Repo name="acme/plans" locked>
        <Row icon={<IssueIcon color={OPEN} />} title="Add login" pill={<Pill color={OPEN}>Open</Pill>} sub="#12 · spec 1.2" />
      </Repo>
      <Repo name="acme/app">
        <Row
          icon={<PullIcon color={MERGED} />}
          title="Add login"
          pill={<Pill color={MERGED}>Merged</Pill>}
          sub="branch avoozl/1.2"
        />
      </Repo>
    </Box>
      {/* The linked branch: merging its pull request closes the planning issue. */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--accent)' }}>
        <svg width={64} height={10} viewBox="0 0 64 10" style={{ flex: 'none' }}>
          <path d="M62 5H4" fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 2" />
          <path d="M6 1 1 5l5 4" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>linked branch avoozl/1.2 closes #12 on merge</span>
      </div>
    </div>
  )
}

function SingleRepoPicture() {
  return (
    <Box flex aria-hidden="true">
      <Repo name="acme/app">
        <Row icon={<IssueIcon color={OPEN} />} title="Add login" pill={<Pill color={OPEN}>Open</Pill>} sub="#12 · spec 1.2" />
        <Row
          icon={<PullIcon color={MERGED} />}
          title="Add login"
          pill={<Pill color={MERGED}>Merged</Pill>}
          sub={
            <>
              body: <code>Closes #12</code>
            </>
          }
        />
      </Repo>
    </Box>
  )
}

function LocalPicture() {
  return (
    <Box flex aria-hidden="true">
      <Repo name="This Mac · Avoozl workspace">
        <Row icon={<IssueIcon color={OPEN} />} title="Add login" pill={<Pill color={MERGED}>Done</Pill>} sub="task 1.2 · in the database" />
        <Row icon={<PullIcon color={MERGED} />} title="avoozl/1.2 → main" pill={<Pill color={MERGED}>Merged</Pill>} sub="merged in your checkout" />
      </Repo>
    </Box>
  )
}

const PICTURE: Record<string, () => ReactNode> = {
  local: LocalPicture,
  'plans-repo': PlansRepoPicture,
  'single-repo': SingleRepoPicture,
}

const CAPTION: Record<string, string> = {
  local: 'A worker chat codes the task, Avoozl checks it and merges the branch on this Mac. Nothing is sent to GitHub.',
  'plans-repo': 'The pull request merges from the linked branch; GitHub closes the private issue. The code repository never names the plans repository.',
  'single-repo': 'The pull request says Closes #12; GitHub closes the issue when it merges.',
}

// Which roles make each outcome.
const MAKES: Record<string, string> = {
  local: 'Every repository is Local only.',
  'plans-repo': 'One repository is the Planning repository and every other GitHub repository is a Code repository.',
  'single-repo': 'Every GitHub repository is Code and planning.',
}

export function RoleHelp() {
  return (
    <Box as="details" size="sm" data-role-help>
      <Box as="summary" cursorPointer weight="medium">What the roles make</Box>
      <Box mt="2" flex flexCol gap="4">
        {MODE_CARDS.map((card) => {
          const Picture = PICTURE[card.mode]
          return (
            <Box key={card.mode} flex minW0 flexCol gap="2" data-role-outcome={card.mode}>
              <div>
                <Box as="span" weight="semibold">{card.title}</Box>
                <Hint as="p" size="xs">{MAKES[card.mode]}</Hint>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
                <div className="rounded-md p-2.5" style={{ background: 'var(--bg-elevated, transparent)' }}>
                  <Picture />
                  <Box as="p" mt="2" size="11" tone="muted">{CAPTION[card.mode]}</Box>
                </div>
                <Box flex flexCol gap="2" size="xs">
                  <div>
                    <Box as="span" weight="semibold">Use it when</Box>
                    <ul className="mt-1 flex flex-col gap-0.5 pl-4" style={{ listStyle: 'disc' }}>
                      {card.useWhen.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <dl className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                    {card.facts.map(([label, text]) => (
                      <Box key={label} contents>
                        <Hint as="dt">{label}</Hint>
                        <dd>{text}</dd>
                      </Box>
                    ))}
                  </dl>
                </Box>
              </div>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
