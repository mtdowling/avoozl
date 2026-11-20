// The spec driver on the page (design §6.10, R66.9): the spec's chip, the
// read-only banner, and Settings › General › This computer. The driver is
// the spec issue's assignee: hand a spec to someone by reassigning its
// issue on GitHub.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { ExternalLink, Laptop, Lock } from './icons.ts'
import { InstanceNickname } from './InstanceName.tsx'
import { errorMessage } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import { LABEL_MAX, bannerTitle, chipText, driverClient, toMachineSettings, type DriverSpec, type DriverStatus } from './driver-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainLink } from './ui/Plain'
import { Glyph } from './ui/Glyph'

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

// "Driver: you", or who the spec issue is assigned to.
export function DriverChip(props: { spec: DriverSpec | null }) {
  const { spec } = props
  if (!spec) return null
  return (
    <Box data-driver-chip as="span" inlineFlex items="center" gap="1.5" size="sm">
      <Glyph icon={Laptop} size={14} aria-hidden="true" css-color="muted" />
      <Badge variant={spec.you ? 'success' : undefined}>{chipText(spec)}</Badge>
    </Box>
  )
}

// A read-only spec's banner: why, with a link to its spec issue, where
// reassigning it moves the spec.
export function DriverBanner(props: { spec: DriverSpec | null }) {
  const { spec } = props
  if (!spec || spec.you || spec.state === 'unknown') return null
  const issueUrl = safeHref(spec.issue?.url ?? null)
  return (
    <Box
      role="status"
      data-driver-banner
      css-border-color="warning-border"
      css-background="mix-warning-muted-10%-card-transparent"
      mb="3"
      flex
      flexWrap
      items="center"
      gap="3"
      rounded="lg"
      border="all"
      p="3"
      size="sm"
    >
      <Glyph icon={Lock} size={18} aria-hidden="true" css-color="muted" />
      <Box as="span" minW0 flex1>
        <Box as="span" weight="medium">
          Read only here. {bannerTitle(spec)}.
        </Box>{' '}
        <Hint>{spec.text}</Hint>
        {issueUrl && (
          <>
            {' '}
            <PlainLink href={safeHref(spec.issue?.url ?? null) ?? undefined} target="_blank" rel="noreferrer" inlineFlex items="center" gap="1" underline>
              Spec issue #{spec.issue?.number} <ExternalLink size={12} aria-hidden="true" />
            </PlainLink>
          </>
        )}
      </Box>
    </Box>
  )
}

// Settings › General › This computer. These stay on this machine.
export function ThisComputer(props: { workspaceId: string | null }) {
  const { status, client, reload } = useDriver(props.workspaceId, null)
  const [form, setForm] = useState({ label: '' })
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (status?.machine) setForm({ label: status.machine.label ?? '' })
  }, [status?.machine?.label])
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
            <Hint as="p" size="xs">
              These stay on this machine. The label names this computer on the page.
            </Hint>
            <Row gap={4} align="start">
              <Box as="label" flex flexCol gap="1" size="sm" htmlFor="avoozl-machine-label">
                Machine label <Hint size="xs">(optional)</Hint>
                <Input
                  id="avoozl-machine-label"
                  maxLength={LABEL_MAX}
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                  css-border-color="border"
                  css-color="text"
                  css-background="card-transparent"
                  css-max-width="100%"
                  placeholder="laptop"
                />
              </Box>
            </Row>
            <Hint as="p" size="xs">
              Machine ID <code>{machine.id}</code>
            </Hint>
            <Hint as="p" size="xs">
              In Local only mode the driver lock guards only workspaces that open this database or a copy of it. It cannot see another machine.
            </Hint>
            <Row gap={2} wrap={false}>
              <Btn type="button" primary onClick={() => void save()}>
                Save
              </Btn>
              {notice && (
                <Hint role="status" size="sm">
                  {notice}
                </Hint>
              )}
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
