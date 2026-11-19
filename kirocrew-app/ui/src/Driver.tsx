// The spec driver on the page (design §6.10, R66.17): the spec's chip, the
// read-only banner with Take over or Force take over, the stepped Hand off
// dialog, the loss list and confirm dialogs, and Settings › General › This
// computer. Nothing moves until a person presses the dialog's own button;
// Cancel, Esc and a click outside change nothing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { Modal } from './ui/Modal.tsx'
import { IconLabel } from './ui/controls.tsx'
import { Button } from './ui/Button.tsx'
import { ExternalLink, KeyRound, Laptop, Lock, Send } from './icons.ts'
import { Tooltip } from './ui/Tooltip.tsx'
import { InstanceNickname, useInstance } from './InstanceName.tsx'
import { handoffLine } from './instance-api.ts'
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
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

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
    <Box data-driver-chip as="span" inlineFlex items="center" gap="1.5" size="sm">
      <Laptop size={14} aria-hidden="true" style={{ color: 'var(--muted)' }} />
      <Badge variant={spec.you ? 'success' : spec.stale ? 'warning' : undefined}>{chipText(spec)}</Badge>
    </Box>
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
    <Box
      role="status"
      data-driver-banner
      css-border-color="warning-border" css-background="mix-warning-muted-10%-card-transparent" mb="3" flex flexWrap items="center" gap="3" rounded="lg" border="all" p="3" size="sm"
    >
      <Lock size={18} aria-hidden="true" style={{ color: 'var(--muted)' }} />
      <Box as="span" minW0 flex1>
        <Box as="span" weight="medium">Read only here. {bannerTitle(spec)}.</Box> <Hint>{spec.text}</Hint>
        {issueUrl && (
          <>
            {' '}
            <a href={safeHref(issueUrl) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              Plan issue #{spec.issue?.number} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </>
        )}
      </Box>
      {action === 'takeover' && (
        <IconLabel icon={KeyRound} primary tooltip="Drive this spec on this machine. You choose how its run state comes over." onClick={() => setDialog('takeover')}>
          Take over
        </IconLabel>
      )}
      {action === 'force' && (
        <IconLabel icon={KeyRound} tooltip="Assign the plan issue to you and drive the spec here. You confirm first." onClick={() => setDialog('force')} variant="danger">
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
    </Box>
  )
}

// What to set up again after a take-over; nothing moves with the driver.
export function SetupList(props: { spec: DriverSpec | null }) {
  const items = props.spec?.you ? props.spec.setup : []
  if (!items.length) return null
  return (
    <Box data-driver-setup css-border-color="border" mb="3" rounded="lg" border="all" p="3" size="sm">
      <Box as="p" weight="medium">Set these up on this machine</Box>
      <Hint as="p" size="xs">They stay on each machine. Until they are back, their tasks wait and their checks block writes.</Hint>
      <Box as="ul" mt="1" listDisc pl="5">
        {items.map((item) => (
          <li key={item.kind + (item.id ?? '')}>{setupText(item)}</li>
        ))}
      </Box>
    </Box>
  )
}

function Loss(props: { preview: TakeoverPreview | null }) {
  if (!props.preview?.lost.length) return null
  return (
    <Box data-driver-loss flex flexCol gap="1" size="sm">
      <Box as="p" weight="medium">A take-over without an export loses</Box>
      <Box as="ul" listDisc pl="5">
        {props.preview.lost.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </Box>
    </Box>
  )
}

function FileField(props: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Box as="label" flex flexCol gap="1" size="sm" htmlFor={props.id}>
      Export file <Hint size="xs">(full path to {'<spec>'}.avoozl-driver.json)</Hint>
      <Input id={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)} style={FIELD} placeholder="/path/to/s1.avoozl-driver.json" />
    </Box>
  )
}

export function TakeOverDialog(props: { workspaceId: string; spec: DriverSpec; onClose: (changed: boolean) => void }) {
  const { spec } = props
  const api = useAppApi()
  const client = useMemo(() => driverClient(api), [api])
  const [how, setHow] = useState<'file' | 'claim'>('file')
  const [file, setFile] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await client.takeover(props.workspaceId, spec.planId, how === 'file' ? { file: file.trim() } : {})
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
    { key: 'claim', label: 'Keep this machine’s records', note: 'Your other machine handed it to you, or this workspace already has its state.' },
  ]
  return (
    <Modal
      id="avoozl-driver-takeover"
      dismissLabel="Cancel"
      title={`Take over ${spec.spec}`}
      onDismiss={() => props.onClose(false)}
      footer={
        <>
          <Button type="button" variant="primary" disabled={busy || (how === 'file' && !file.trim())} onClick={() => void go()}>
            Take over
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        <Box as="p" size="sm">{spec.text}</Box>
        <Box as="fieldset" flex flexCol gap="2">
          <Box as="legend" size="sm" weight="medium">How its run state comes over</Box>
          {options.map((option) => (
            <Box key={option.key} as="label" flex items="start" gap="2" size="sm">
              <input type="radio" name="avoozl-driver-how" checked={how === option.key} onChange={() => setHow(option.key)} />
              <span>
                {option.label} <Hint size="xs" block>{option.note}</Hint>
              </span>
            </Box>
          ))}
        </Box>
        {how === 'file' && <FileField id="avoozl-driver-file" value={file} onChange={setFile} />}
        <Hint as="p" size="xs">Avoozl waits 10 seconds and reads the plan issue again; it drives only if its claim is still there.</Hint>
        {error && (
          <ErrorText role="alert" size="sm">
            {error}
          </ErrorText>
        )}
      </Stack>
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
      dismissLabel="Cancel"
      title={`Force take over ${spec.spec}`}
      onDismiss={() => props.onClose(false)}
      footer={
        <>
          <Tooltip text={blocker ?? undefined}>
            {(describedBy) => (
              <Button type="button" variant="danger" aria-describedby={describedBy} disabled={busy || Boolean(blocker)} onClick={() => void go()}>
                Force take over
              </Button>
            )}
          </Tooltip>
        </>
      }
    >
      <Box flex flexCol gap="3" size="sm" data-driver-force>
        <Box as="dl" css-grid-template-columns="auto-1fr" grid gapX="3" gapY="1">
          <Hint as="dt">Assigned to</Hint>
          <dd>{(preview?.current.assignees ?? spec.assignees ?? []).join(', ') || 'nobody'}</dd>
          <Hint as="dt">Driving machine</Hint>
          <dd>
            {old?.label || 'no label'} <Box as="code" size="xs">{old?.machine ?? 'none'}</Box>
          </dd>
          <Hint as="dt">Last heartbeat</Hint>
          <dd>{spec.seenAt ? `${spec.seenAt} (${ago(spec.seenAt)})` : 'never'}</dd>
        </Box>
        <p>
          That machine may still be running chats for this spec. Their local results will not come here; what they push to GitHub does. Avoozl sets the plan
          issue&apos;s assignee to you, the one assignee change it ever makes.
        </p>
        <FileField id="avoozl-driver-force-file" value={file} onChange={setFile} />
        {!file.trim() && (
          <>
            <Loss preview={preview} />
            <Switch label="I understand what a take-over without an export loses" checked={acknowledged} onChange={setAcknowledged}>
              I understand what a take-over without an export loses
            </Switch>
          </>
        )}
        <Box as="label" flex flexCol gap="1" htmlFor="avoozl-driver-force-name">
          Type <code>{spec.spec}</code> to confirm
          <Input id="avoozl-driver-force-name" value={typed} onChange={(event) => setTyped(event.target.value)} style={FIELD} autoComplete="off" />
        </Box>
        {error && (
          <ErrorText role="alert">
            {error}
          </ErrorText>
        )}
      </Box>
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
  const instance = useInstance(props.workspaceId)
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
      <Box as="ol" flex flexCol gap="4" size="sm" data-driver-handoff>
        <li aria-current={step === 'start' || step === 'drain' ? 'step' : undefined}>
          <Box as="p" weight="medium">1. Drain</Box>
          <Hint as="p">No new work starts for this spec. Running chats keep running and are never ended; their reports still apply.</Hint>
          {step !== 'start' && (
            <Box mt="1">
              {running.length ? `${running.length} chat(s) still running:` : 'No chat is running.'}
              {running.length > 0 && (
                <Box as="ul" listDisc pl="5">
                  {running.map((chat) => (
                    <li key={chat.slot}>
                      {chat.taskId} <Hint>({chat.role}, {chat.status ?? 'unknown'})</Hint>
                    </li>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </li>
        <li aria-current={step === 'drain' ? 'step' : undefined}>
          <Box as="p" weight="medium">2. Export</Box>
          <Hint as="p">
            One file, {spec.spec}.avoozl-driver.json, in a folder you pick outside the workspace repository. It may hold private notes: Avoozl never uploads,
            commits or pushes it. With a folder set, Avoozl writes it once the last chat ends.
          </Hint>
          {step !== 'reassign' && (
            <Box as="label" mt="1" flex flexCol gap="1" htmlFor="avoozl-driver-folder">
              Folder <Hint size="xs">(full path)</Hint>
              <Input id="avoozl-driver-folder" value={folder} onChange={(event) => setFolder(event.target.value)} style={FIELD} placeholder="/path/to/a/folder" />
            </Box>
          )}
          {file && <Box as="p" mt="1">Written: <code>{file}</code></Box>}
        </li>
        <li aria-current={step === 'reassign' ? 'step' : undefined}>
          <Box as="p" weight="medium">3. Reassign</Box>
          {handoffLine(instance) && <p data-instance-handoff>{handoffLine(instance)}</p>}
          <Hint as="p">
            {spec.mode === 'local'
              ? 'Move the file to the other machine and press Take over there.'
              : 'Assign the plan issue to the person who takes over. Avoozl does not reassign it. Your other machine needs no reassignment: press Take over there.'}
          </Hint>
          {step === 'reassign' && issueUrl && (
            <a href={safeHref(issueUrl) ?? undefined} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">
              Reassign it on GitHub <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </li>
        {error && (
          <Box role="alert" as="li" tone="danger">
            {error}
          </Box>
        )}
      </Box>
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
  if (!props.workspaceId) return null
  const machine = status?.enabled ? status.machine : null
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
      <Stack data-this-computer aria-labelledby="avoozl-this-computer" as="section" gap={3}>
        <Box id="avoozl-this-computer" as="h4" size="base" weight="semibold">
          This computer
        </Box>
        <InstanceNickname workspaceId={props.workspaceId} />
        {machine && (
          <>
        <Hint as="p" size="xs">These stay on this machine. The label shows in plan issues so people can tell your machines apart.</Hint>
        <Row gap={4} align="start">
          <Box as="label" flex flexCol gap="1" size="sm" htmlFor="avoozl-machine-label">
            Machine label <Hint size="xs">(optional)</Hint>
            <Input id="avoozl-machine-label" maxLength={LABEL_MAX} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} style={FIELD} placeholder="laptop" />
          </Box>
          <Box as="label" flex flexCol gap="1" size="sm" htmlFor="avoozl-machine-heartbeat">
            Heartbeat minutes <Hint size="xs">(optional)</Hint>
            <Input id="avoozl-machine-heartbeat" inputMode="numeric" value={form.heartbeat} onChange={(event) => setForm({ ...form, heartbeat: event.target.value })} style={FIELD} placeholder={String(HEARTBEAT_PLACEHOLDER)} />
          </Box>
        </Row>
        <Hint as="p" size="xs">
          Machine ID <code>{machine.id}</code>
        </Hint>
        <Hint as="p" size="xs">
          In Local only mode the driver lock guards only workspaces that open this database or a copy of it. It cannot see another machine, and there is no
          forced take-over between machines.
        </Hint>
        <Row gap={2} wrap={false}>
          <Btn type="button" primary onClick={() => void save()}>
            Save
          </Btn>
          {notice && <Hint role="status" size="sm">{notice}</Hint>}
        </Row>
        {error && (
          <ErrorText role="alert" size="sm">
            {error}
          </ErrorText>
        )}
          </>
        )}
      </Stack>
    </Card>
  )
}
