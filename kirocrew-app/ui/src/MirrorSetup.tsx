// Settings > Repositories > Mirror (RC27): Adopt existing setup and Create
// setup. Each shows a dry run first, one line per step with a tick, and
// applies only the ticked lines after a confirm. All logic is in the
// operations behind mirror-setup-api.ts.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { InfoTip, SectionHeading } from './controls.tsx'
import { useAppApi } from './host.ts'
import { LINE_NAMES, MIRROR_BUTTONS, canTick, mirrorSetupClient, tickedIds, type MirrorKind, type MirrorSetupResult } from './mirror-setup-api.ts'
import { settingsClient, toForm } from './settings-api.ts'
import { errorMessage } from './workspace-api.ts'

const STATE_TEXT: Record<string, string> = { found: 'Found', missing: 'Missing', differs: 'Differs' }

export default function MirrorSetup(props: { workspaceId: string; onApplied: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => mirrorSetupClient(api), [api])
  const [source, setSource] = useState('')
  const [mirror, setMirror] = useState('')
  const [run, setRun] = useState<{ kind: MirrorKind; result: MirrorSetupResult } | null>(null)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start from the first repository that already names a mirror.
  const { workspaceId } = props
  useEffect(() => {
    let live = true
    settingsClient(api)
      .get(workspaceId)
      .then((settings) => {
        const found = toForm(settings.github).repositories.find((repository) => repository.mirror.source && repository.mirror.mirror)
        if (live && found) {
          setSource(found.mirror.source)
          setMirror(found.mirror.mirror)
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, workspaceId])

  const names = { repository: mirror.trim(), source: source.trim() }
  const show = useCallback((kind: MirrorKind, result: MirrorSetupResult) => {
    setRun({ kind, result })
    setUnticked(new Set())
  }, [])
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const dryRun = (kind: MirrorKind) => attempt(async () => show(kind, await client.preview(workspaceId, kind, names)))
  const apply = () =>
    attempt(async () => {
      if (!run) return
      const result = await client.apply(workspaceId, run.kind, names, run.result.previewHash, tickedIds(run.result.lines, unticked))
      show(run.kind, result)
      props.onApplied()
    })
  const toggle = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const result = run?.result
  const chosen = result ? tickedIds(result.lines, unticked) : []

  return (
    <div data-mirror-setup className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <SectionHeading level={4} title="Mirror" className="mb-0" />
      <p className="text-sm text-muted">Set up the private copy crews work in. Each button shows a dry run first and writes nothing until you confirm.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          Public repository
          <Input value={source} placeholder="owner/name" onChange={(event) => setSource(event.target.value)} aria-label="Public repository" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Private mirror
          <Input value={mirror} placeholder="owner/name-private" onChange={(event) => setMirror(event.target.value)} aria-label="Private mirror" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {MIRROR_BUTTONS.map((button) => (
          <span key={button.kind} className="inline-flex items-center gap-1.5">
            <Btn type="button" disabled={busy || !names.repository || !names.source} onClick={() => void dryRun(button.kind)} data-setup-action={button.label}>
              {button.label}
            </Btn>
            <InfoTip text={button.about} label={`About ${button.label}`} />
          </span>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--danger, #c0392b)' }}>
          {error}
        </p>
      )}
      {result && (
        <div data-mirror-run={run?.kind} className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {result.applied ? 'Result' : 'Dry run'}: {result.repository} from {result.source}. {result.writes} {result.writes === 1 ? 'write' : 'writes'} left.
          </p>
          {result.refused && <p className="text-sm">{result.detail}</p>}
          <ul className="flex flex-col gap-1" data-mirror-lines>
            {result.lines.map((line) => (
              <li key={line.id} data-mirror-line={line.id} data-status={line.status} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Write ${LINE_NAMES[line.id] ?? line.id}`}
                  disabled={!canTick(line) || busy || Boolean(result.applied)}
                  checked={canTick(line) && !unticked.has(line.id) && line.ticked !== false}
                  onChange={() => toggle(line.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{LINE_NAMES[line.id] ?? line.id}</span> <span className="text-xs text-muted">{STATE_TEXT[line.state] ?? line.state}</span>
                  <span className="block text-xs text-muted">
                    {line.detail}
                    {line.status === 'blocked' && line.permission ? ` Needs: ${line.permission}.` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {result.applied && (
            <ul data-mirror-applied className="flex flex-col gap-1 text-sm">
              {result.applied.map((row) => (
                <li key={row.id}>
                  {LINE_NAMES[row.id] ?? row.id}: {row.status}. {row.detail}
                </li>
              ))}
            </ul>
          )}
          {result.next === 'radar-values' && <p className="text-sm">Next: enter the Radar values on the Radar values screen.</p>}
          {!result.applied && (
            <div className="flex flex-wrap gap-2">
              <Btn type="button" disabled={busy || !chosen.length} onClick={() => void apply()} data-mirror-confirm>
                Apply {chosen.length} ticked {chosen.length === 1 ? 'line' : 'lines'}
              </Btn>
              <Btn type="button" disabled={busy} onClick={() => setRun(null)}>
                Close
              </Btn>
            </div>
          )}
          {result.applied && (
            <div>
              <Btn type="button" onClick={() => setRun(null)}>
                Close
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
