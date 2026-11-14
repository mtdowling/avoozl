// "Who codes": one card per coder, with a small flow picture, one line,
// "Use it when", who reviews and a Default tag, plus the shared walkthrough
// that follows a task from ready to merged. Each claim is checked against
// the code: github-policy.mjs (default coder per mode; three coders
// in both GitHub modes), delivery.mjs (the tick opens a worker chat per ready task,
// a verifier runs its checks, reviewer roles review the exact commit),
// github-crew.mjs (Issue Radar crews code single-repo issues carrying the
// ready label), and github-close.mjs (required checks and the branch review
// rule on the pull request).
import { useState } from 'react'
import { Flow, Walkthrough, type WalkStep } from './Walkthrough.tsx'
import { IconLabel } from './controls.tsx'
import { CircleHelp } from './icons.ts'
import { CODER_CARDS, coderSource, defaultCoder, modeKey } from './settings-api.ts'

const WORKER_STEPS: WalkStep[] = [
  {
    title: 'A task becomes ready',
    text: 'When everything a task waits on is done, the tick marks it ready and starts it, up to the limit at once.',
    picture: <Flow boxes={['Waits on', 'Ready', 'Started']} on={1} note="Every minute, the tick looks for ready tasks." />,
    points: ['Watch it in Delivery, under Ready', 'Defer pauses it before it starts'],
  },
  {
    title: 'A worker chat codes it',
    text: 'Avoozl opens a Kiro Crew chat on this Mac with the task brief. It works on its own branch and reports its commit.',
    picture: <Flow boxes={['Brief', 'Worker chat', 'Commit']} on={1} />,
    points: ['Open the chat from the task to watch', 'Type in the chat to step in'],
  },
  {
    title: 'Checks and reviewer chats',
    text: 'A fresh chat runs the task checks on that exact commit. Reviewer chats then review it.',
    picture: <Flow boxes={['Commit', 'Checks', 'Reviewer chats']} on={2} />,
    points: ['A failed check starts a new attempt', 'A question shows up under Needs you'],
  },
  {
    title: 'It merges',
    text: 'Local only merges the branch in your checkout. A GitHub mode opens a pull request, and GitHub closes the issue when it merges.',
    picture: <Flow boxes={['Approved', 'Branch', 'Merged']} on={2} />,
  },
  {
    title: 'If you switch',
    text: 'The choice is per repository. Tasks already running keep their chat. New tasks use the new coder after you save.',
    picture: <Flow boxes={['Worker chats', 'Save', 'Issue Radar']} on={1} />,
  },
]

const RADAR_STEPS: WalkStep[] = [
  {
    title: 'A task becomes ready',
    text: "When everything it waits on is done, Avoozl adds the repository's ready label to its issue.",
    picture: <Flow boxes={['Waits on', 'Ready label']} on={1} note="Scope the crew to this exact label in Issue Radar." />,
  },
  {
    title: 'Issue Radar takes it',
    text: 'The crew scoped to that label claims the issue and codes it in its own session.',
    picture: <Flow boxes={['Ready label', 'Crew claims', 'Codes']} on={1} />,
    points: ['Watch it on the Issue Radar page', 'A "needs human" label shows under Needs you'],
  },
  {
    title: 'A pull request with Closes #N',
    text: 'The crew opens a pull request that names the issue. Required checks and the review rule run on it.',
    picture: <Flow boxes={['Pull request', 'Checks', 'Review']} on={0} />,
  },
  {
    title: 'It merges',
    text: 'GitHub closes the issue when the pull request merges. Avoozl counts it done and starts what waited on it.',
    picture: <Flow boxes={['Merged', 'Issue closed', 'Next ready']} on={1} />,
    points: ['A claimed issue closed without a merged pull request waits for your decision', 'Blocked again? Avoozl takes the ready label off'],
  },
  {
    title: 'If you switch',
    text: 'The choice is per repository. Tasks already running stay with their crew. New tasks use the new coder after you save.',
    picture: <Flow boxes={['Issue Radar', 'Save', 'Worker chats']} on={1} />,
  },
]

export function CoderPicker(props: { id: string; mode: string; value: string; onChange: (coder: string) => void }) {
  const [walk, setWalk] = useState<string | null>(null)
  const mode = modeKey(props.mode)
  const chosen = props.value || defaultCoder(props.mode)
  const cards = CODER_CARDS.filter((card) => (card.modes as readonly string[]).includes(mode))
  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label="Who codes" className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        {cards.map((card) => {
          const selected = chosen === card.coder
          const isDefault = defaultCoder(props.mode) === card.coder
          return (
            <div
              key={card.coder}
              id={`${props.id}-${card.coder}`}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-coder={card.coder}
              onClick={() => props.onChange(isDefault ? '' : card.coder)}
              onKeyDown={(event) => {
                const at = cards.indexOf(card)
                const next =
                  event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? cards[(at + 1) % cards.length]
                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                      ? cards[(at - 1 + cards.length) % cards.length]
                      : event.key === ' ' || event.key === 'Enter'
                        ? card
                        : null
                if (!next) return
                event.preventDefault()
                props.onChange(defaultCoder(props.mode) === next.coder ? '' : next.coder)
                document.getElementById(`${props.id}-${next.coder}`)?.focus()
              }}
              className="flex cursor-pointer flex-col gap-2 rounded-lg p-3"
              style={{
                border: `${selected ? 2 : 1}px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                padding: selected ? 11 : 12,
                background: selected ? 'color-mix(in srgb, var(--accent) 5%, var(--card))' : 'var(--card)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{card.title}</span>
                {isDefault && (
                  <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    Default
                  </span>
                )}
                {selected && <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--accent)' }}>Selected</span>}
              </div>
              <p className="text-sm">{card.line}</p>
              <div aria-hidden="true">
                <Flow boxes={[...card.flow]} />
              </div>
              <div className="text-xs">
                <span className="font-semibold">Use it when</span>
                <ul className="mt-1 flex flex-col gap-0.5 pl-4" style={{ listStyle: 'disc' }}>
                  {card.useWhen.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs">
                <span className="text-muted">Who reviews: </span>
                {card.reviews}
              </p>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted" data-coder-source>{coderSource(props.mode, props.value)}</p>
      {mode === 'plans-repo' && <p className="text-xs text-muted">A Radar crew opens pull requests only in its own repository.</p>}
      {mode === 'local' && <p className="text-xs text-muted">Radar crew and Remote coder need GitHub, so Local only uses the Avoozl worker.</p>}
      {chosen !== 'remote' && <div>
        <IconLabel icon={CircleHelp} onClick={() => setWalk(walk ? null : chosen)} aria-label={walk ? 'Hide how this works' : 'How does this work?'}>
          {walk ? 'Hide how this works' : 'How does this work?'}
        </IconLabel>
      </div>}
      {walk && (
        <Walkthrough
          id={`${props.id}-walk`}
          label={walk === 'issue-radar' ? 'How a Radar crew codes a task' : 'How the Avoozl worker codes a task'}
          steps={walk === 'issue-radar' ? RADAR_STEPS : WORKER_STEPS}
          onClose={() => setWalk(null)}
        />
      )}
    </div>
  )
}
