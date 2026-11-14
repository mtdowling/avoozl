// Trace (RC8.2, design D10): one issue's eight steps with GitHub's times, as a
// drawer from a row and as a page. The page is in the Back history; the
// drawer is one Back step. Times are the backend's (never a marker's
// `updated=`); this file only draws them.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import { useNav } from './NavHistory.tsx'
import { useRead } from './useRead.ts'
import { afterPrevious, clock, parseTraceLink, traceClient, type Trace, type TraceStep, type TraceTarget } from './trace-api.ts'
import { linkHref } from './views-api.ts'

const DOT: Record<TraceStep['state'], { border: string; background: string }> = {
  done: { border: 'var(--ok)', background: 'var(--ok)' },
  now: { border: 'var(--accent)', background: 'var(--accent)' },
  later: { border: 'var(--border)', background: 'transparent' },
  skipped: { border: 'var(--border)', background: 'transparent' },
}

function Step({ steps, index }: { steps: TraceStep[]; index: number }) {
  const step = steps[index],
    wait = afterPrevious(steps, index),
    href = linkHref(step.link),
    dot = DOT[step.state]
  return (
    <li data-trace-step={step.key} data-state={step.state} className="flex gap-3 pb-3">
      <span
        aria-hidden="true"
        style={{ flex: '0 0 12px', height: 12, marginTop: 4, borderRadius: 6, border: `2px ${step.state === 'skipped' ? 'dashed' : 'solid'} ${dot.border}`, background: dot.background }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium" style={step.state === 'later' || step.state === 'skipped' ? { color: 'var(--muted)' } : undefined}>
            {step.label}
          </span>
          <span data-trace-time className="text-xs text-muted">
            {step.at ? clock(step.at) : step.state === 'skipped' ? 'Skipped' : step.state === 'now' ? 'In progress' : ''}
          </span>
          {step.rounds && step.rounds > 1 ? <Badge variant="warning">{step.rounds} rounds</Badge> : null}
        </span>
        <span className="block break-words text-xs text-muted">
          {[step.by && `by ${step.by}`, wait, step.detail].filter(Boolean).join(' · ')}
        </span>
        {href && (
          <a href={linkHref(step.link)} target="_blank" rel="noreferrer" className="text-xs underline">
            Open on GitHub
          </a>
        )}
      </span>
    </li>
  )
}

export function TraceBody({ trace }: { trace: Trace }) {
  const links = [
    ['Issue', trace.links.issue],
    ['Pull request', trace.links.pr],
    ['Claim comment', trace.links.claim],
  ] as const
  return (
    <div data-trace className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{trace.title}</span> <span className="text-xs text-muted">{trace.repository} #{trace.number}</span>
      </p>
      <p className="text-xs text-muted">Times are GitHub's, not the crew's own.</p>
      <ol className="m-0 list-none p-0">
        {trace.steps.map((_, index) => (
          <Step key={trace.steps[index].key} steps={trace.steps} index={index} />
        ))}
      </ol>
      {trace.crew && (
        <p data-trace-crew className="text-sm">
          Crew {trace.crew.name ?? trace.crew.id ?? 'unnamed'}
          {trace.crew.id && trace.crew.name ? <span className="text-xs text-muted"> · {trace.crew.id}</span> : null}
          {trace.crewLastWordAt ? <span className="block text-xs text-muted">Last edit to its comment {clock(trace.crewLastWordAt)}</span> : null}
        </p>
      )}
      <p className="flex flex-wrap gap-x-3 text-sm">
        {links.map(([label, url]) => (linkHref(url) ? (
          <a key={label} href={linkHref(url)} target="_blank" rel="noreferrer" className="underline">
            {label}
          </a>
        ) : null))}
      </p>
      {trace.problems.length > 0 && (
        <ul role="status" data-trace-problems className="m-0 list-none p-0 text-xs" style={{ color: 'var(--warning, #b45309)' }}>
          {trace.problems.map((problem) => (
            <li key={problem}>GitHub could not be read for part of this trace: {problem}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function useTrace(workspaceId: string | null, target: TraceTarget) {
  const api = useAppApi()
  const client = useMemo(() => traceClient(api), [api])
  const load = useCallback((id: string) => client.read(id, target), [client, target.repository, target.number]) // eslint-disable-line react-hooks/exhaustive-deps
  return useRead(workspaceId, load)
}

function Loaded({ read }: { read: ReturnType<typeof useTrace> }) {
  if (read.error)
    return (
      <p role="alert" className="text-sm text-danger">
        {read.error}
      </p>
    )
  if (!read.value) return <p className="text-sm text-muted">Reading the trace from GitHub…</p>
  return <TraceBody trace={read.value} />
}

// A drawer from a row: the shared top-layer Modal, one Back step.
export function TraceDrawer(props: { workspaceId: string | null; target: TraceTarget; onClose: () => void; onOpenPage: () => void }) {
  const read = useTrace(props.workspaceId, props.target)
  return (
    <Modal
      id="avoozl-trace"
      kind="drawer"
      width="32rem"
      backLabel="Close"
      title={`Trace · #${props.target.number}`}
      attrs={{ 'data-trace-drawer': true }}
      onDismiss={props.onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Btn type="button" onClick={props.onClose}>
            Close
          </Btn>
          <Btn type="button" primary onClick={props.onOpenPage}>
            Open page
          </Btn>
        </div>
      }
    >
      <Loaded read={read} />
    </Modal>
  )
}

// Trace opened from the nav with no issue chosen: say what it is, take an
// issue, and point at the rows that open one.
export function TraceStart({ onPick }: { onPick?: (target: TraceTarget) => void }) {
  const [text, setText] = useState('')
  const target = parseTraceLink(`?trace=${encodeURIComponent(text.trim())}`)
  return (
    <section data-trace-start className="mx-auto flex max-w-2xl flex-col gap-3 py-2">
      <h2 className="m-0 text-base font-semibold">Trace</h2>
      <p className="text-sm text-muted">
        The steps one issue took: spec approved, issue created, ready, claimed, pull request, checks, merged. Open one from an On the line row on Home, or enter an issue here.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (target) onPick?.(target)
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span>Issue</span>
          <Input value={text} placeholder="owner/repo#52" onChange={(event) => setText(event.target.value)} style={{ minWidth: '16rem' }} />
        </label>
        <Btn type="submit" primary disabled={!target}>
          Open trace
        </Btn>
      </form>
    </section>
  )
}

// The page: its own tab state in the Back history, so Back returns to the
// view the person came from.
export function TracePage({ workspaceId, target, onPick }: { workspaceId: string | null; target: TraceTarget | null; onPick?: (target: TraceTarget) => void }) {
  const nav = useNav()
  if (!target) return <TraceStart onPick={onPick} />
  return <TracePageFor workspaceId={workspaceId} target={target} onBack={() => nav.history.back()} />
}

function TracePageFor({ workspaceId, target, onBack }: { workspaceId: string | null; target: TraceTarget; onBack: () => void }) {
  const read = useTrace(workspaceId, target)
  return (
    <section data-trace-page className="mx-auto flex max-w-2xl flex-col gap-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn type="button" onClick={onBack}>
          ← Back
        </Btn>
        <h2 className="m-0 text-base font-semibold">Trace</h2>
        <Btn type="button" onClick={() => void read.reload()} disabled={read.busy}>
          {read.busy ? 'Reading…' : 'Refresh'}
        </Btn>
      </div>
      <Loaded read={read} />
    </section>
  )
}

