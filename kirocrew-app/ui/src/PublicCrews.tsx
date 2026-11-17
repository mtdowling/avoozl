// The Public crews card (R85.1, R85.2, R85.8, R85.10, design §6.14): each
// public repository's checklist (crew home, content hook, rule sets, audit)
// and its sign-off. Send to Issue Radar refuses a public repository until a
// person signs off here; the backend checks every item again, records who
// and when, and lapses the sign-off when any item changes.
import { useMemo, useState } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { ICON, SectionBox, useConfirm } from './controls.tsx'
import { useAppApi } from './host.ts'
import { CircleAlert, CircleCheck } from './icons.ts'
import { publicCrewsClient, signoffBadge, signoffLine, type PublicCrew } from './untriaged-api.ts'
import { errorMessage } from './workspace-api.ts'

export const HOME_NOTE =
  'A separate crew home removes injected context only. The crew can still read every file your operating-system user can read and use its credentials. A crew that must not read them runs as another user, in a container, or on another machine.'

function Row(props: { row: PublicCrew; workspaceId: string; onChange: () => void }) {
  const { row, workspaceId } = props
  const api = useAppApi()
  const ask = useConfirm()
  const client = useMemo(() => publicCrewsClient(api), [api])
  const [home, setHome] = useState(row.home ?? '')
  const [agent, setAgent] = useState(row.agent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const badge = signoffBadge(row)
  const id = `public-crew-${row.repository.replace(/[^A-Za-z0-9]/g, '-')}`
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      props.onChange()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  const signOff = async () => {
    const yes = await ask({
      title: `Sign off ${row.repository}?`,
      body: 'Avoozl checks each item again and records your sign-off. Issue Radar crews may then get this repository’s issues. Any change to an item lapses it.',
      action: 'Sign off',
    })
    if (yes) await run(() => client.signOff(workspaceId, row.repository, home.trim(), agent.trim()))
  }
  return (
    <div className="flex min-w-0 flex-col gap-2" data-public-crew={row.repository} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" style={{ overflowWrap: 'anywhere' }}>
          {row.repository}
        </span>
        <Badge variant={badge.variant}>{badge.text}</Badge>
        {row.visibility === 'unknown' && <span className="text-xs text-muted">Visibility not read, so it counts as public.</span>}
      </div>
      <p className="text-xs text-muted" data-signoff-line>
        {signoffLine(row)}
      </p>
      {row.banner && (
        <p role="alert" className="text-sm text-danger" data-public-banner>
          {row.banner}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Checklist for ${row.repository}`}>
        {row.items.map((item) => (
          <li key={item.key} className="flex min-w-0 items-start gap-2 text-sm" data-check={item.key} data-ok={item.ok ? 'true' : 'false'}>
            <span aria-hidden="true" style={{ display: 'inline-flex', paddingTop: 2, color: item.ok ? 'var(--ok)' : 'var(--danger)' }}>
              {item.ok ? <CircleCheck size={ICON} /> : <CircleAlert size={ICON} />}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{item.label}</span>
              <span className="sr-only">{item.ok ? ': met' : ': not met'}</span>
              <span className="text-muted"> · {item.line}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1" style={{ flex: '2 1 16rem' }}>
          <label htmlFor={`${id}-home`} className="text-xs font-medium">
            Crew home (its own KIRO_HOME)
          </label>
          <Input id={`${id}-home`} value={home} placeholder="/path/to/crew-home" onChange={(event) => setHome(event.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1" style={{ flex: '1 1 9rem' }}>
          <label htmlFor={`${id}-agent`} className="text-xs font-medium">
            Crew agent
          </label>
          <Input id={`${id}-agent`} value={agent} onChange={(event) => setAgent(event.target.value)} />
        </div>
        <div className="flex gap-2">
          <Btn type="button" primary disabled={busy || Boolean(row.banner)} onClick={() => void signOff()} data-sign-off={row.repository}>
            {row.signedOff ? 'Sign off again' : 'Sign off'}
          </Btn>
          {row.signedOff && (
            <Btn type="button" disabled={busy} onClick={() => void run(() => client.withdraw(workspaceId, row.repository))} data-withdraw={row.repository}>
              Withdraw
            </Btn>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function PublicCrews(props: { rows: PublicCrew[]; workspaceId: string; onChange: () => void }) {
  if (!props.rows.length) return null
  const held = props.rows.filter((row) => !row.signedOff).length
  return (
    <div data-public-crews>
      <SectionBox id="public-crews" title={<span>Public crews{held ? ` · ${held} held` : ''}</span>} open={held > 0}>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Issue Radar crews write to these public repositories with your GitHub login. Sign off each checklist before Avoozl sends a crew any issue.</p>
          <p className="text-xs text-muted" data-home-note>
            {HOME_NOTE}
          </p>
          {props.rows.map((row) => (
            <Row key={`${row.repository}:${row.home ?? ''}:${row.agent}`} row={row} workspaceId={props.workspaceId} onChange={props.onChange} />
          ))}
        </div>
      </SectionBox>
    </div>
  )
}
