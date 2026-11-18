// The Public crews card (R85.1, R85.2, R85.8, R85.10, design §6.14): each
// public repository's checklist (crew home, content hook, rule sets, audit)
// and its sign-off. Send to Issue Radar refuses a public repository until a
// person signs off here; the backend checks every item again, records who
// and when, and lapses the sign-off when any item changes.
import { useMemo, useState } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { ICON, SectionBox, useConfirm } from './ui/controls.tsx'
import { useAppApi } from './host.ts'
import { CircleAlert, CircleCheck } from './icons.ts'
import { publicCrewsClient, signoffBadge, signoffLine, type PublicCrew } from './untriaged-api.ts'
import { errorMessage } from './workspace-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

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
    <Box css-border-top="1px-solid-border" css-padding-top="8" flex minW0 flexCol gap="2" data-public-crew={row.repository}>
      <Box flex flexWrap items="center" gap="2">
        <Box as="span" css-overflow-wrap="anywhere" size="sm" weight="medium">
          {row.repository}
        </Box>
        <Badge variant={badge.variant}>{badge.text}</Badge>
        {row.visibility === 'unknown' && <Hint size="xs">Visibility not read, so it counts as public.</Hint>}
      </Box>
      <Hint as="p" size="xs" data-signoff-line>
        {signoffLine(row)}
      </Hint>
      {row.banner && (
        <ErrorText role="alert" size="sm" data-public-banner>
          {row.banner}
        </ErrorText>
      )}
      <Box as="ul" m0 flex listNone flexCol gap="1" p="0" aria-label={`Checklist for ${row.repository}`}>
        {row.items.map((item) => (
          <Box key={item.key} as="li" flex minW0 items="start" gap="2" size="sm" data-check={item.key} data-ok={item.ok ? 'true' : 'false'}>
            <span aria-hidden="true" style={{ display: 'inline-flex', paddingTop: 2, color: item.ok ? 'var(--ok)' : 'var(--danger)' }}>
              {item.ok ? <CircleCheck size={ICON} /> : <CircleAlert size={ICON} />}
            </span>
            <Box as="span" minW0>
              <Box as="span" weight="medium">{item.label}</Box>
              <Box as="span" srOnly>{item.ok ? ': met' : ': not met'}</Box>
              <Hint> · {item.line}</Hint>
            </Box>
          </Box>
        ))}
      </Box>
      <Box flex flexWrap items="end" gap="2">
        <Box css-flex="2-1-16rem" flex minW0 flexCol gap="1">
          <Box htmlFor={`${id}-home`} as="label" size="xs" weight="medium">
            Crew home (its own KIRO_HOME)
          </Box>
          <Input id={`${id}-home`} value={home} placeholder="/path/to/crew-home" onChange={(event) => setHome(event.target.value)} />
        </Box>
        <Box css-flex="1-1-9rem" flex minW0 flexCol gap="1">
          <Box htmlFor={`${id}-agent`} as="label" size="xs" weight="medium">
            Crew agent
          </Box>
          <Input id={`${id}-agent`} value={agent} onChange={(event) => setAgent(event.target.value)} />
        </Box>
        <Box flex gap="2">
          <Btn type="button" primary disabled={busy || Boolean(row.banner)} onClick={() => void signOff()} data-sign-off={row.repository}>
            {row.signedOff ? 'Sign off again' : 'Sign off'}
          </Btn>
          {row.signedOff && (
            <Btn type="button" disabled={busy} onClick={() => void run(() => client.withdraw(workspaceId, row.repository))} data-withdraw={row.repository}>
              Withdraw
            </Btn>
          )}
        </Box>
      </Box>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Box>
  )
}

export function PublicCrews(props: { rows: PublicCrew[]; workspaceId: string; onChange: () => void }) {
  if (!props.rows.length) return null
  const held = props.rows.filter((row) => !row.signedOff).length
  return (
    <div data-public-crews>
      <SectionBox id="public-crews" title={<span>Public crews{held ? ` · ${held} held` : ''}</span>} open={held > 0}>
        <Stack gap={2}>
          <Hint as="p" size="xs">Issue Radar crews write to these public repositories with your GitHub login. Sign off each checklist before Avoozl sends a crew any issue.</Hint>
          <Hint as="p" size="xs" data-home-note>
            {HOME_NOTE}
          </Hint>
          {props.rows.map((row) => (
            <Row key={`${row.repository}:${row.home ?? ''}:${row.agent}`} row={row} workspaceId={props.workspaceId} onChange={props.onChange} />
          ))}
        </Stack>
      </SectionBox>
    </div>
  )
}
