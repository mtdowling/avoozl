// "Set up Issue Radar": the values only the owner can enter in Radar, each
// with Copy and what it controls (radar-coder RC7.2, RC7.3). With the grant,
// a re-read ticks what Radar shows. Without it, each item is a checkbox the
// person ticks, marked "Cannot verify". Avoozl writes nothing here.
import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { FieldBox } from './FieldBox.tsx'
import { Check, Copy } from './icons.ts'
import { useAppApi } from './host.ts'
import { progressLine, radarValuesClient, rowState, type RadarItem, type RadarValues } from './radar-values-api.ts'
import { linkHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Btn
      type="button"
      aria-label={`Copy ${label}`}
      data-copy={label}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Copied' : 'Copy'}
    </Btn>
  )
}

function Row({ item, ticked, onTick }: { item: RadarItem; ticked: boolean; onTick: (on: boolean) => void }) {
  const state = rowState(item, ticked)
  const id = `radar-value-${item.id}`
  return (
    <li className="flex min-w-0 flex-col gap-1 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-radar-value={item.id} data-status={item.status}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input id={id} type="checkbox" checked={state.checked} disabled={state.locked} onChange={(event) => onTick(event.target.checked)} />
        <label htmlFor={id} className="min-w-0 text-sm font-medium">
          {item.label}
        </label>
        <span className="text-xs text-muted" data-badge>
          {state.badge}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <code className="min-w-0 flex-1 break-words text-xs" style={{ overflowWrap: 'anywhere' }} data-value>
          {item.value}
        </code>
        <CopyBtn text={item.value} label={item.label} />
      </div>
      <p className="text-xs text-muted">{item.controls}</p>
      <p className="text-xs text-muted">{item.note}</p>
    </li>
  )
}

export default function RadarValuesScreen(props: { workspaceId: string; repositories: string[] }) {
  const api = useAppApi()
  const [repository, setRepository] = useState(props.repositories[0] ?? '')
  const [view, setView] = useState<RadarValues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const read = useCallback(async () => {
    if (!repository) return
    setBusy(true)
    setError(null)
    try {
      setView(await radarValuesClient(api).read(props.workspaceId, repository))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [api, props.workspaceId, repository])
  useEffect(() => {
    setTicked(new Set())
    void read()
  }, [read])
  if (!props.repositories.length) return null
  return (
    <FieldBox title="Set up Issue Radar" blurb="Only you can enter these in Issue Radar. Copy each one there. Avoozl writes none of them.">
      {props.repositories.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Repository
          <select value={repository} onChange={(event) => setRepository(event.target.value)} className="min-w-0 rounded border px-2 py-1" style={{ borderColor: 'var(--border)', background: 'transparent' }}>
            {props.repositories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {view && (
        <>
          <p className="text-sm" role="status" data-radar-mode>
            {view.grant ? 'Read from Issue Radar. Confirmed items are ticked for you.' : 'Avoozl cannot read Issue Radar here. Tick each item yourself when you have done it.'}
          </p>
          <p className="text-xs text-muted" data-progress>
            {progressLine(view.items, ticked)}
          </p>
          <ul className="flex min-w-0 flex-col" data-radar-values>
            {view.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                ticked={ticked.has(item.id)}
                onTick={(on) =>
                  setTicked((before) => {
                    const next = new Set(before)
                    if (on) next.add(item.id)
                    else next.delete(item.id)
                    return next
                  })
                }
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Btn type="button" onClick={() => void read()} disabled={busy}>
              {busy ? 'Reading…' : 'Read again'}
            </Btn>
            <a href={linkHref(view.link)} target="_top" className="text-sm underline" data-radar-link>
              Open Issue Radar
            </a>
          </div>
        </>
      )}
    </FieldBox>
  )
}
