// Settings > Workspaces > Telemetry: the switch for sending task timing over
// OpenTelemetry, and what the exporter is doing (spec otel-export, OT11). The
// page reads the status when it opens and after a switch; it has no timer.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Box } from './ui/Box'
import { ErrorText } from './ui/ErrorText'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Switch } from './ui/Switch'
import { ENVIRONMENT_NOTE, lastSuccess, statusWords, telemetryClient, type TelemetryStatus } from './telemetry-api.ts'
import { errorMessage } from './workspace-api.ts'

function Line(props: { label: string; value: string; name: string }) {
  return (
    <Row gap={2} align="start">
      <Hint as="span" size="xs">
        {props.label}
      </Hint>
      <Box as="span" size="sm" data-telemetry-value={props.name}>
        {props.value}
      </Box>
    </Row>
  )
}

export function TelemetrySettings(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => telemetryClient(api), [api])
  const [view, setView] = useState<TelemetryStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { workspaceId } = props
  const read = useCallback(() => {
    if (workspaceId) client.status(workspaceId).then(setView, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId])
  useEffect(read, [read])
  if (!workspaceId || !view) return null
  const on = view.status !== 'off'
  const flip = async (enabled: boolean) => {
    setError(null)
    try {
      setView(await client.configure(workspaceId, enabled))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <FieldGroup title="Telemetry" boxed>
      <Stack gap={2} data-telemetry>
        <Switch checked={on} onChange={(next) => void flip(next)} label="Send task timing over OpenTelemetry" size="sm" data-telemetry-switch>
          Send task timing over OpenTelemetry
        </Switch>
        <Line name="status" label="Status" value={statusWords(view)} />
        <Line name="endpoint" label="Endpoint" value={view.endpoint ?? 'Not set'} />
        <Line name="protocol" label="Protocol" value={view.protocol} />
        <Line name="headers" label="Header names" value={view.headerNames.length ? view.headerNames.join(', ') : 'None'} />
        <Row gap={4}>
          <Line name="sent" label="Sent" value={String(view.sent)} />
          <Line name="queued" label="Queued" value={String(view.queued)} />
          <Line name="dropped" label="Dropped" value={String(view.dropped)} />
          <Line name="rejected" label="Rejected" value={String(view.rejected)} />
        </Row>
        <Line name="last-success" label="Last success" value={lastSuccess(view.lastSuccessAt)} />
        <Line name="local" label="Kept here" value={`${view.local.spans} spans, ${view.local.points} points`} />
        <Hint as="p" size="xs">
          {ENVIRONMENT_NOTE}
        </Hint>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </Stack>
    </FieldGroup>
  )
}
