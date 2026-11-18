// Pull the Andon cord (design §4.11, R64): the Stop the line icon in
// the Dashboards › Delivery heading and the side panel, and its dialog. The person picks Stop the line (new
// work in a scope) or Stop all agents (everything, and every running chat
// Avoozl opened), and gives a one-line reason. Nothing is written until the
// dialog's red button (and, for Stop all agents, its confirm); Cancel, Esc
// and a click outside change nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from './host.ts'
import { Input } from './ui/Input'
import { ICON, useConfirm } from './ui/controls.tsx'
import { Pause, Play } from './icons.ts'
import { Picker, taskItems } from './Picker.tsx'
import type { PickItem } from './picker.ts'
import { RadioFold } from './ui/RadioFold.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { NAV_ICON, SQUARE } from './LeftNav.tsx'
import { Modal } from './ui/Modal.tsx'
import { Button } from './ui/Button.tsx'
import { FULL_STOP_WARNING, LINE_EVENT, MAX_REASON, PULL_KINDS, PULL_SCOPES, emptyPull, flowClient, lineChanged, toPull, type LineStop, type PullForm } from './flow-api.ts'
import { plansClient } from './plans-api.ts'
import { viewsClient } from './views-api.ts'
import { workspaceClient, errorMessage } from './workspace-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'

const FILL = { display: 'inline-flex', alignItems: 'center', gap: 6 }
// Stopped: a red frame on a red tint, the text in the theme's own color.
const STOPPED = { ...FILL, borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))', color: 'var(--text)', borderWidth: 2 }
const FIELD = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)', maxWidth: '100%' }

interface Choices {
  repositories: string[]
  specs: PickItem[]
  tasks: PickItem[]
}

// How often the nav reads whether the line is stopped; a pull or
// resume on the page (LINE_EVENT) reads at once.
const LINE_READ_MS = 60000

// The open stops, read through flow.view; [] until read or when it fails.
export function useOpenStops(workspaceId: string | null) {
  const api = useAppApi()
  const flows = useMemo(() => flowClient(api), [api])
  const [stops, setStops] = useState<LineStop[]>([])
  useEffect(() => {
    if (!workspaceId) return setStops([])
    let live = true
    const read = () =>
      flows.view(workspaceId, { window: '10' }).then(
        (view) => live && setStops((view.line ?? []).filter((stop) => !stop.closedAt)),
        () => undefined,
      )
    void read()
    const timer = setInterval(read, LINE_READ_MS)
    window.addEventListener(LINE_EVENT, read)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener(LINE_EVENT, read)
    }
  }, [flows, workspaceId])
  return stops
}

// The Delivery heading's icon (DeliveryView.tsx): pause or play, with its words in the
// tooltip and aria-label only. While a stop is open it says Line stopped; pressing it still
// opens the dialog to stop more.
export function StopLineButton(props: { workspaceId: string | null; onPulled?: () => void; bare?: boolean; nav?: boolean; square?: boolean }) {
  const [open, setOpen] = useState(false)
  const stops = useOpenStops(props.workspaceId)
  const api = useAppApi()
  const flows = useMemo(() => flowClient(api), [api])
  const confirm = useConfirm()
  if (!props.workspaceId) return null
  const stopped = stops.length > 0
  const why = stops
    .map((stop) => stop.reason ?? (stop.check ? `${stop.check} fails on ${stop.branch}` : `the line on ${stop.branch}`))
    .slice(0, 3)
    .join('; ')
  const dialog = open && (
    <StopLineDialog
      workspaceId={props.workspaceId}
      onClose={() => setOpen(false)}
      onPulled={() => {
        setOpen(false)
        lineChanged()
        props.onPulled?.()
      }}
    />
  )
  // The side panel's icon: pause to stop, play to resume. Never text.
  if (props.bare || props.nav || props.square) {
    const resumeAll = async () => {
      const yes = await confirm({ title: 'Resume the line?', body: `New work starts again. The line was stopped for: ${why}`, action: 'Resume' })
      if (!yes || !props.workspaceId) return
      for (const stop of stops) await flows.resume(props.workspaceId, stop.id)
      lineChanged()
    }
    const label = stopped ? 'Resume the line' : 'Stop the line'
    const Icon = stopped ? Play : Pause
    return (
      <>
        <Tooltip text={label}>
          <button type="button" {...(props.nav || props.square ? {} : { 'data-pp-icon': '', 'data-bare': '' })} data-stop-line data-stopped={stopped ? '' : undefined} aria-label={label} onClick={() => (stopped ? void resumeAll() : setOpen(true))} style={{ ...(props.square ? SQUARE : props.nav ? NAV_ICON : {}), color: stopped ? 'var(--ok)' : 'var(--danger)', borderColor: 'var(--border)' }}>
            <Icon size={props.bare ? 13 : 14} aria-hidden="true" />
          </button>
        </Tooltip>
        {dialog}
      </>
    )
  }
  return (
    <>
      <Tooltip text={stopped ? `The line is stopped: ${why}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : 'Stop new work in a scope, or stop all agents, with a reason'}>
        {(describedBy) => (
          <Button
            type="button"
            variant="danger"
            data-stop-line
            data-stopped={stopped ? '' : undefined}
            aria-describedby={describedBy}
            aria-label={stopped ? `Line stopped, ${stops.length} open stop${stops.length === 1 ? '' : 's'}. Stop more` : undefined}
            onClick={() => setOpen(true)}
            // A pause icon; the words are the tooltip and the button's name.
            style={{ ...(stopped ? STOPPED : FILL), padding: '4px 6px' }}
          >
            <Pause size={ICON} aria-hidden="true" style={stopped ? { color: 'var(--danger)' } : undefined} />
            <span className="sr-only">{stopped ? 'Line stopped' : 'Stop the line'}</span>
          </Button>
        )}
      </Tooltip>
      {dialog}
    </>
  )
}

export function StopLineDialog(props: { workspaceId: string; onClose: () => void; onPulled: () => void }) {
  const api = useAppApi()
  const flows = useMemo(() => flowClient(api), [api])
  const [form, setForm] = useState<PullForm>(emptyPull)
  const [choices, setChoices] = useState<Choices | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const box = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<PullForm>) => setForm((current) => ({ ...current, ...patch }))
  const close = useCallback(() => props.onClose(), [props])
  useEffect(() => {
    let live = true
    const id = props.workspaceId
    Promise.allSettled([workspaceClient(api).repositories(id), plansClient(api).stored(id), viewsClient(api).graph(id)]).then(([repos, plans, graph]) => {
      if (!live) return
      setChoices({
        repositories: repos.status === 'fulfilled' ? repos.value.map((r) => r.id) : [],
        specs: plans.status === 'fulfilled' ? plans.value.items.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, title: p.title || p.id, state: p.state })) : [],
        tasks: graph.status === 'fulfilled' ? taskItems(graph.value.tasks) : [],
      })
    })
    return () => {
      live = false
    }
  }, [api, props.workspaceId])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [])
  const pull = async () => {
    const { input, error: problem } = toPull(form)
    if (!input) return setError(problem ?? null)
    if (input.full && !(await confirm({ title: 'Stop all agents?', body: FULL_STOP_WARNING, action: 'Stop all agents' }))) return
    setBusy(true)
    setError(null)
    try {
      await flows.stop(props.workspaceId, input)
      props.onPulled()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const empty = (text: string) => <Hint as="p" size="sm">{choices ? text : 'Reading…'}</Hint>
  const required = (label: string) => (
    <span>
      {label} <Hint size="xs">(required)</Hint>
    </span>
  )
  const pick = (label: string, value: string, items: PickItem[], onPick: (id: string) => void, none: string) =>
    items.length ? <Picker label={required(label)} items={items} value={value} onPick={onPick} placeholder={`Type a ${label.toLowerCase()} ID or title`} /> : empty(none)
  const fields = {
    all: null,
    repo: choices?.repositories.length ? (
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        {required('Repository')}
        <select value={form.repository} onChange={(e) => set({ repository: e.target.value })} className="rounded border px-2 py-1 text-sm" style={FIELD} data-stop-target>
          <option value="">Choose…</option>
          {choices.repositories.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
    ) : (
      empty('No repository is registered.')
    ),
    spec: pick('Spec', form.spec, choices?.specs ?? [], (spec) => set({ spec }), 'No spec is stored yet.'),
    task: pick('Task', form.taskId, choices?.tasks ?? [], (taskId) => set({ taskId }), 'No task yet.'),
  }
  return (
    // Esc, Back and a click outside do what Cancel does, asking first once
    // something was entered.
    <Modal
      id="avoozl-stop"
      width="36rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-stop-line"
      boxRef={box}
      attrs={{ 'data-stop-dialog': true }}
      unsaved={JSON.stringify(form) !== JSON.stringify(emptyPull()) && { title: 'Discard this stop?', body: 'The line keeps running. What you entered is lost.', action: 'Discard' }}
      title={
        <span className="inline-flex items-center gap-1.5">
          <Pause size={ICON} aria-hidden="true" style={{ color: 'var(--danger)' }} /> Stop the line
        </span>
      }
      onDismiss={close}
      footer={
        <>
          <Button type="button" variant="danger" data-stop-confirm onClick={() => void pull()} disabled={busy} style={FILL}>
            <Pause size={ICON} aria-hidden="true" />
            {form.kind === 'agents' ? 'Stop all agents' : 'Stop the line'}
          </Button>
        </>
      }
    >
      <div>
        <Hint id="avoozl-stop-line" as="p" size="sm">
          Only a person can resume it.
        </Hint>
      </div>
      <RadioFold
        name="avoozl-stop-kind"
        label="How to stop"
        value={form.kind}
        onChange={(kind) => set({ kind })}
        sections={PULL_KINDS.map((k) => ({
          key: k.value,
          title: k.label,
          line: k.line,
          ...(k.value === 'agents'
            ? { description: <Hint as="p" size="sm" data-full-warning>{FULL_STOP_WARNING}</Hint> }
            : {
                fields: (
                  <RadioFold
                    name="avoozl-stop-scope"
                    label="What to stop"
                    value={form.scope}
                    onChange={(scope) => set({ scope })}
                    sections={PULL_SCOPES.map((s) => ({ key: s.value, title: s.label, line: s.line, fields: fields[s.value] }))}
                  />
                ),
              }),
        }))}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span>
          Reason <Hint size="xs">(required)</Hint>
        </span>
        <Input
          value={form.reason}
          maxLength={MAX_REASON}
          placeholder="The base is broken; looking into it"
          onChange={(e: { target: { value: string } }) => set({ reason: e.target.value })}
          data-stop-reason
        />
        <Hint size="xs">One line. It shows on the banner and in Flow.</Hint>
      </label>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Modal>
  )
}
