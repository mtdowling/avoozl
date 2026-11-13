// The spec driver on the page (design §6.10, R66.17): the header chip, the
// read-only banner with Take over or Force take over, the stepped Hand off
// dialog, the loss list and confirm dialogs, and Settings › General › This
// computer. Nothing moves until a person presses the dialog's own button;
// Cancel, Esc and a click outside change nothing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import { IconLabel, dangerStyle } from './controls.tsx'
import { ExternalLink, KeyRound, Laptop, Lock, Send } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
import { errorMessage } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import {
  HEARTBEAT_PLACEHOLDER,
  LABEL_MAX,
  ago,
  bannerAction,
  bannerTitle,
  chipText,
  driverClient,
  forceReady,
  setupText,
  toMachineSettings,
  type DriverSpec,
  type DriverStatus,
  type TakeoverPreview,
} from './driver-api.ts'

const FIELD = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)', maxWidth: '100%' }

// The driver status for one spec, read again every minute and after each
// action here.
export function useDriver(workspaceId: string | null, planId: string | null) {
  const api = useAppApi()
  const client = useMemo(() => driverClient(api), [api])
  const [status, setStatus] = useState<DriverStatus | null>(null)
  const reload = useCallback(() => {
    if (!workspaceId) return
    client.status(workspaceId, planId ?? undefined).then(setStatus, () => undefined)
  }, [client, workspaceId, planId])
  useEffect(() => {
    reload()
    const timer = setInterval(reload, 60000)
    return () => clearInterval(timer)
  }, [reload])
  const spec = planId ? (status?.specs.find((item) => item.planId === planId) ?? null) : null
  return { status, spec, reload, client }
}

// "Driver: you", or the login, machine label and when it was last seen.
export function DriverChip(props: { spec: DriverSpec | null }) {
  const { spec } = props
  if (!spec) return null
  return (
    <span data-driver-chip className="inline-flex items-center gap-1.5 text-sm">
      <Laptop size={14} aria-hidden="true" style={{ color: 'var(--muted)' }} />
      <Badge variant={spec.you ? 'success' : spec.stale ? 'warning' : undefined}>{chipText(spec)}</Badge>
    </span>
  )
}

// The App header: how many specs read only on this machine.
export function DriverSummary(props: { workspaceId: string | null }) {
  const { status } = useDriver(props.workspaceId, null)
  if (!status?.enabled || !status.specs.length) return null
  const readOnly = status.readOnly ?? 0
  const text = readOnly ? `${readOnly} of ${status.specs.length} specs read only here` : 'Driver: you'
  return (
    <Tooltip text={readOnly ? 'Another machine or person drives these specs. Open one in Specs to see why.' : 'This machine drives every approved spec.'}>
      {(describedBy) => (
        <span data-driver-summary aria-describedby={describedBy} className="inline-flex items-center gap-1.5 text-sm">
          <Laptop size={14} aria-hidden="true" style={{ color: 'var(--muted)' }} />
          <Badge variant={readOnly ? 'warning' : 'success'}>{text}</Badge>
        </span>
      )}
    </Tooltip>
  )
}

// A read-only spec's banner: why, with Take over or Force take over.
export function DriverBanner(props: { workspaceId: string; spec: DriverSpec | null; onChanged: () => void }) {
  const { spec } = props
  const [dialog, setDialog] = useState<'takeover' | 'force' | null>(null)
  if (!spec || spec.you || spec.state === 'unknown') return null
  const action = bannerAction(spec)
  const issueUrl = safeHref(spec.issue?.url ?? null)
  return (
    <div
      role="status"
      data-driver-banner
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
      style={{ borderColor: 'var(--warning, var(--border))', background: 'color-mix(in srgb, var(--warning, var(--muted)) 10%, var(--card, transparent))' }}
    >
      <Lock size={18} aria-hidden="true" style={{ color: 'var(--muted)' }} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">Read only here. {bannerTitle(spec)}.</span> <span className="text-muted">{spec.text}</span>
        {issueUrl && (
          <>
            {' '}
            <a href={safeHref(issueUrl) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              Plan issue #{spec.issue?.number} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </>
        )}
      </span>
      {action === 'takeover' && (
        <IconLabel icon={KeyRound} primary tooltip="Drive this spec on this machine. You choose how its run state comes over." onClick={() => setDialog('takeover')}>
          Take over
        </IconLabel>
      )}
      {action === 'force' && (
        <IconLabel icon={KeyRound} tooltip="Assign the plan issue to you and drive the spec here. You confirm first." onClick={() => setDialog('force')} style={dangerStyle}>
          Force take over
        </IconLabel>
      )}
      {dialog === 'takeover' && (
        <TakeOverDialog
          workspaceId={props.workspaceId}
          spec={spec}
          onClose={(changed) => {
            setDialog(null)
            if (changed) props.onChanged()
          }}
        />
      )}
      {dialog === 'force' && (
        <ForceTakeOverDialog
          workspaceId={props.workspaceId}
          spec={spec}
          onClose={(changed) => {
            setDialog(null)
            if (changed) props.onChanged()
          }}
        />
      )}
    </div>
  )
}

// What to set up again after a take-over; nothing moves with the driver.
export function SetupList(props: { spec: DriverSpec | null }) {
  const items = props.spec?.you ? props.spec.setup : []
  if (!items.length) return null
  return (
    <div data-driver-setup className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
      <p className="font-medium">Set these up on this machine</p>
      <p className="text-xs text-muted">They stay on each machine. Until they are back, their tasks wait and their checks block writes.</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item) => (
          <li key={item.kind + (item.id ?? '')}>{setupText(item)}</li>
        ))}
      </ul>
    </div>
  )
}

function Loss(props: { preview: TakeoverPreview | null }) {
  if (!props.preview?.lost.length) return null
  return (
    <div data-driver-loss className="flex flex-col gap-1 text-sm">
      <p className="font-medium">A rebuild from GitHub loses</p>
      <ul className="list-disc pl-5">
        {props.preview.lost.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-xs text-muted">The next tick raises again: {props.preview.reraised.join(', ')}.</p>
    </div>
  )
}

function FileField(props: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={props.id}>
      Export file <span className="text-xs text-muted">(full path to {'<spec>'}.avoozl-driver.json)</span>
      <Input id={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)} style={FIELD} placeholder="/path/to/s1.avoozl-driver.json" />
    </label>
  )
}

export function TakeOverDialog(props: { workspaceId: string; spec: DriverSpec; onClose: (changed: boolean) => void }) {
  const { spec } = props
  const api = useAppApi()
  const client = useMemo(() => driverClient(api), [api])
  const [how, setHow] = useState<'file' | 'rebuild' | 'claim'>(spec.mode === 'local' ? 'file' : 'file')
  const [file, setFile] = useState('')
  const [preview, setPreview] = useState<TakeoverPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (how !== 'rebuild') return setPreview(null)
    client.preview(props.workspaceId, spec.planId, true).then(setPreview, (caught: unknown) => setError(errorMessage(caught)))
  }, [client, how, props.workspaceId, spec.planId])
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await client.takeover(props.workspaceId, spec.planId, how === 'file' ? { file: file.trim() } : how === 'rebuild' ? { rebuild: true } : {})
      if (result.won === false) setError('Another machine took it over at the same time and won. This spec reads only here.')
      else props.onClose(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const options: { key: typeof how; label: string; note: string }[] = [
    { key: 'file', label: 'From an export', note: 'The file the old driver wrote. Avoozl checks it against the claim before anything changes.' },
    ...(spec.mode === 'local'
      ? []
      : [{ key: 'rebuild' as const, label: 'Rebuild from GitHub', note: 'When the old machine is gone. Some local history is lost.' }]),
    { key: 'claim', label: 'Keep this machine’s records', note: 'Your other machine handed it to you, or this workspace already has its state.' },
  ]
  return (
    <Modal
      id="avoozl-driver-takeover"
      title={`Take over ${spec.spec}`}
      onDismiss={() => props.onClose(false)}
      footer={
        <>
          <Btn type="button" onClick={() => props.onClose(false)}>
            Cancel
          </Btn>
          <Btn type="button" primary disabled={busy || (how === 'file' && !file.trim())} onClick={() => void go()}>
            Take over
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">{spec.text}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">How its run state comes over</legend>
          {options.map((option) => (
            <label key={option.key} className="flex items-start gap-2 text-sm">
              <input type="radio" name="avoozl-driver-how" checked={how === option.key} onChange={() => setHow(option.key)} />
              <span>
                {option.label} <span className="block text-xs text-muted">{option.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {how === 'file' && <FileField id="avoozl-driver-file" value={file} onChange={setFile} />}
        {how === 'rebuild' && <Loss preview={preview} />}
        <p className="text-xs text-muted">Avoozl waits 10 seconds and reads the plan issue again; it drives only if its claim is still there.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function ForceTakeOverDialog(props: { workspaceId: string; spec: DriverSpec; onClose: (changed: boolean) => void }) {
  const { spec } = props
  const api = useAppApi()
  const client = useMemo(() => driverClient(api), [api])
  const [typed, setTyped] = useState('')
  const [file, setFile] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [preview, setPreview] = useState<TakeoverPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    client.preview(props.workspaceId, spec.planId, true).then(setPreview, (caught: unknown) => setError(errorMessage(caught)))
  }, [client, props.workspaceId, spec.planId])
  const blocker = forceReady(spec, typed, acknowledged, file)
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.force(props.workspaceId, spec.planId, typed.trim(), file.trim() || undefined)
      props.onClose(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const old = preview?.current.driver ?? spec.driver ?? null
  return (
    <Modal
      id="avoozl-driver-force"
      title={`Force take over ${spec.spec}`}
      onDismiss={() => props.onClose(false)}
      footer={
        <>
          <Btn type="button" onClick={() => props.onClose(false)}>
            Cancel
          </Btn>
          <Tooltip text={blocker ?? undefined}>
            {(describedBy) => (
              <Btn type="button" aria-describedby={describedBy} disabled={busy || Boolean(blocker)} onClick={() => void go()} style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>
                Force take over
              </Btn>
            )}
          </Tooltip>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm" data-driver-force>
        <dl className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <dt className="text-muted">Assigned to</dt>
          <dd>{(preview?.current.assignees ?? spec.assignees ?? []).join(', ') || 'nobody'}</dd>
          <dt className="text-muted">Driving machine</dt>
          <dd>
            {old?.label || 'no label'} <code className="text-xs">{old?.machine ?? 'none'}</code>
          </dd>
          <dt className="text-muted">Last heartbeat</dt>
          <dd>{spec.seenAt ? `${spec.seenAt} (${ago(spec.seenAt)})` : 'never'}</dd>
        </dl>
        <p>
          That machine may still be running chats for this spec. Their local results will not come here; what they push to GitHub does. Avoozl sets the plan
          issue&apos;s assignee to you, the one assignee change it ever makes.
        </p>
        <FileField id="avoozl-driver-force-file" value={file} onChange={setFile} />
        {!file.trim() && (
          <>
            <Loss preview={preview} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I understand what a rebuild from GitHub loses
            </label>
          </>
        )}
        <label className="flex flex-col gap-1" htmlFor="avoozl-driver-force-name">
          Type <code>{spec.spec}</code> to confirm
          <Input id="avoozl-driver-force-name" value={typed} onChange={(event) => setTyped(event.target.value)} style={FIELD} autoComplete="off" />
        </label>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// Hand off driver, stepped: drain (running chats listed), export (folder),
// reassign (the issue link). Avoozl never reassigns the plan issue.
export function HandOffButton(props: { workspaceId: string; spec: DriverSpec | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const { spec } = props
  if (!spec?.you && spec?.handoff?.state !== 'exported') return null
  return (
    <>
      <IconLabel icon={Send} tooltip="Stop new work for this spec, export its run state, then reassign it on GitHub" onClick={() => setOpen(true)}>
        {spec.handoff ? 'Hand off…' : 'Hand off driver'}
      </IconLabel>
      {open && (
        <HandOffDialog
          workspaceId={props.workspaceId}
          spec={spec}
          onClose={() => {
            setOpen(false)
            props.onChanged()
          }}
        />
      )}
    </>
  )
}

export function HandOffDialog(props: { workspaceId: string; spec: DriverSpec; onClose: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => driverClient(api), [api])
  const [spec, setSpec] = useState<DriverSpec>(props.spec)
  const [folder, setFolder] = useState(props.spec.handoff?.folder ?? '')
  const [file, setFile] = useState<string | null>(props.spec.handoff?.file ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const step = !spec.handoff ? 'start' : spec.handoff.state === 'draining' ? 'drain' : 'reassign'
  const run = async (fn: () => Promise<DriverStatus & { file?: string }>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await fn()
      const next = result.specs.find((item) => item.planId === spec.planId)
      if (next) setSpec(next)
      if (result.file) setFile(result.file)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const running = spec.handoff?.running ?? []
  const issueUrl = safeHref(spec.issue?.url ?? null)
  return (
    <Modal
      id="avoozl-driver-handoff"
      title={`Hand off ${spec.spec}`}
      onDismiss={props.onClose}
      footer={
        <>
          {step === 'drain' && (
            <Btn type="button" disabled={busy} onClick={() => void run(() => client.handoff(props.workspaceId, spec.planId, 'cancel'))}>
              Cancel hand-off
            </Btn>
          )}
          <Btn type="button" onClick={props.onClose}>
            Close
          </Btn>
          {step === 'start' && (
            <Btn type="button" primary disabled={busy} onClick={() => void run(() => client.handoff(props.workspaceId, spec.planId, 'start', folder.trim() ? { folder: folder.trim() } : {}))}>
              Stop new work
            </Btn>
          )}
          {step === 'drain' && (
            <Btn
              type="button"
              primary
              disabled={busy || !folder.trim()}
              onClick={() =>
                void run(() => client.handoff(props.workspaceId, spec.planId, 'export', { folder: folder.trim(), ...(running.length ? { unfinished: true } : {}) }))
              }
            >
              {running.length ? `Export with ${running.length} unfinished` : 'Export'}
            </Btn>
          )}
        </>
      }
    >
      <ol className="flex flex-col gap-4 text-sm" data-driver-handoff>
        <li aria-current={step === 'start' || step === 'drain' ? 'step' : undefined}>
          <p className="font-medium">1. Drain</p>
          <p className="text-muted">No new work starts for this spec. Running chats keep running and are never ended; their reports still apply.</p>
          {step !== 'start' && (
            <div className="mt-1">
              {running.length ? `${running.length} chat(s) still running:` : 'No chat is running.'}
              {running.length > 0 && (
                <ul className="list-disc pl-5">
                  {running.map((chat) => (
                    <li key={chat.slot}>
                      {chat.taskId} <span className="text-muted">({chat.role}, {chat.status ?? 'unknown'})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </li>
        <li aria-current={step === 'drain' ? 'step' : undefined}>
          <p className="font-medium">2. Export</p>
          <p className="text-muted">
            One file, {spec.spec}.avoozl-driver.json, in a folder you pick outside the workspace repository. It may hold private notes: Avoozl never uploads,
            commits or pushes it. With a folder set, Avoozl writes it once the last chat ends.
          </p>
          {step !== 'reassign' && (
            <label className="mt-1 flex flex-col gap-1" htmlFor="avoozl-driver-folder">
              Folder <span className="text-xs text-muted">(full path)</span>
              <Input id="avoozl-driver-folder" value={folder} onChange={(event) => setFolder(event.target.value)} style={FIELD} placeholder="/path/to/a/folder" />
            </label>
          )}
          {file && <p className="mt-1">Written: <code>{file}</code></p>}
        </li>
        <li aria-current={step === 'reassign' ? 'step' : undefined}>
          <p className="font-medium">3. Reassign</p>
          <p className="text-muted">
            {spec.mode === 'local'
              ? 'Move the file to the other machine and press Take over there.'
              : 'Assign the plan issue to the person who takes over. Avoozl does not reassign it. Your other machine needs no reassignment: press Take over there.'}
          </p>
          {step === 'reassign' && issueUrl && (
            <a href={safeHref(issueUrl) ?? undefined} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">
              Reassign it on GitHub <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </li>
        {error && (
          <li role="alert" className="text-danger">
            {error}
          </li>
        )}
      </ol>
    </Modal>
  )
}

// Settings › General › This computer. These stay on this machine.
export function ThisComputer(props: { workspaceId: string | null }) {
  const { status, client, reload } = useDriver(props.workspaceId, null)
  const [form, setForm] = useState({ label: '', heartbeat: '' })
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (status?.machine) setForm({ label: status.machine.label ?? '', heartbeat: status.machine.heartbeatMinutes ? String(status.machine.heartbeatMinutes) : '' })
  }, [status?.machine?.label, status?.machine?.heartbeatMinutes])
  if (!props.workspaceId || !status?.enabled || !status.machine) return null
  const save = async () => {
    const checked = toMachineSettings(form)
    if (checked.error || !checked.input) return setError(checked.error ?? null)
    setError(null)
    try {
      await client.saveMachine(props.workspaceId!, checked.input)
      setNotice('Saved on this computer.')
      reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <Card>
      <section data-this-computer aria-labelledby="avoozl-this-computer" className="flex flex-col gap-3">
        <h4 id="avoozl-this-computer" className="text-base font-semibold">
          This computer
        </h4>
        <p className="text-xs text-muted">These stay on this machine. The label shows in plan issues so people can tell your machines apart.</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm" htmlFor="avoozl-machine-label">
            Machine label <span className="text-xs text-muted">(optional)</span>
            <Input id="avoozl-machine-label" maxLength={LABEL_MAX} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} style={FIELD} placeholder="laptop" />
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor="avoozl-machine-heartbeat">
            Heartbeat minutes <span className="text-xs text-muted">(optional)</span>
            <Input id="avoozl-machine-heartbeat" inputMode="numeric" value={form.heartbeat} onChange={(event) => setForm({ ...form, heartbeat: event.target.value })} style={FIELD} placeholder={String(HEARTBEAT_PLACEHOLDER)} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Machine ID <code>{status.machine.id}</code>
        </p>
        <p className="text-xs text-muted">
          In Local only mode the driver lock guards only workspaces that open this database or a copy of it. It cannot see another machine, and there is no
          forced take-over between machines.
        </p>
        <div className="flex items-center gap-2">
          <Btn type="button" primary onClick={() => void save()}>
            Save
          </Btn>
          {notice && <span role="status" className="text-sm text-muted">{notice}</span>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    </Card>
  )
}
