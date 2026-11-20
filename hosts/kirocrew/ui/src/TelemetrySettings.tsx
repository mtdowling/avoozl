// Settings > Workspaces > Telemetry (spec otel-export, OT11): the local store
// row first, then the export's status and counts, and a three-step Set up
// export dialog that saves machine config through telemetry.configure. The
// page reads the status when it opens and after a save; it has no timer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from './host.ts'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { ErrorText } from './ui/ErrorText'
import { Field } from './ui/Field.tsx'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Hint } from './ui/Hint'
import { Input } from './ui/Input'
import { Modal } from './ui/Modal.tsx'
import { Row } from './ui/Row'
import { SelectField } from './ui/SelectField'
import { Stack } from './ui/Stack'
import { Switch } from './ui/Switch'
import {
  ENVIRONMENT_NOTE,
  HEADERS_VARIABLE,
  RECORDED,
  TELEMETRY_STEPS,
  endpointProblem,
  formOf,
  headerNames,
  lastSuccess,
  localWords,
  statusWords,
  telemetryClient,
  type TelemetryInput,
  type TelemetryStatus,
} from './telemetry-api.ts'
import { errorMessage } from './workspace-api.ts'

function Line(props: { label: string; value: string; name: string }) {
  return (
    <Row gap={2} align="start">
      <Hint as="span" size="xs" css-flex-shrink="0">
        {props.label}
      </Hint>
      <Box as="span" size="sm" css-min-width="0" css-overflow-wrap="anywhere" data-telemetry-value={props.name}>
        {props.value}
      </Box>
    </Row>
  )
}

// Where each header's value comes from, and whether this process found it.
const headerWords = (view: TelemetryStatus) => {
  const names = [...new Set([...view.saved.headers, ...view.headerNames])]
  if (!names.length) return 'None'
  return names.map((name) => `${name} (${view.missingHeaders.includes(name) ? 'value missing from' : 'value from'} ${HEADERS_VARIABLE})`).join(', ')
}

const endpointWords = (view: TelemetryStatus) => {
  if (!view.endpoint) return 'Not set'
  return `${view.endpoint} (${view.endpointFrom === 'environment' ? 'from the environment' : 'saved here'})`
}

function ExportDialog(props: { view: TelemetryStatus; save: (input: TelemetryInput) => Promise<void>; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => formOf(props.view))
  const [headersText, setHeadersText] = useState(() => props.view.saved.headers.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input:not([disabled]), button')?.focus()
  }, [step])
  const headers = headerNames(headersText)
  const problem = endpointProblem(form.endpoint) ?? headers.error ?? null
  const set = (patch: Partial<TelemetryInput>) => {
    setForm((current) => ({ ...current, ...patch }))
    setError(null)
  }
  const final: TelemetryInput = { ...form, endpoint: form.endpoint.trim(), headers: headers.names }
  const changed = JSON.stringify(final) !== JSON.stringify(formOf(props.view))
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await props.save(final)
      props.onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      id="avoozl-telemetry"
      width="36rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-telemetry-line"
      boxRef={box}
      attrs={{ 'data-telemetry-dialog': step }}
      unsaved={changed && { title: 'Stop setting up export?', body: 'Nothing is saved.', action: 'Stop' }}
      title={TELEMETRY_STEPS[step][0]}
      onDismiss={props.onClose}
      footer={
        <>
          {step > 0 && (
            <Btn type="button" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </Btn>
          )}
          {step < 2 ? (
            <Btn type="button" primary disabled={step === 1 && Boolean(problem)} onClick={() => setStep(step + 1)}>
              Next
            </Btn>
          ) : (
            <Btn type="button" primary disabled={busy} onClick={() => void save()}>
              Save
            </Btn>
          )}
        </>
      }
    >
      <Box as="ol" flex flexWrap gap="2" size="xs" aria-label="Steps">
        {TELEMETRY_STEPS.map(([title], i) => (
          <Box key={title} aria-current={i === step ? 'step' : undefined} as="li" weight={i === step ? 'semibold' : undefined} tone={i === step ? undefined : 'muted'}>
            {i + 1}. {title}
          </Box>
        ))}
      </Box>
      <Hint id="avoozl-telemetry-line" as="p" size="sm">
        {TELEMETRY_STEPS[step][1]}
      </Hint>
      {step === 0 && (
        <Stack gap={2} data-telemetry-step="recorded">
          <Box as="ul" size="sm" css-margin="0" css-padding-left="1.25rem">
            {RECORDED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
          <Line name="dialog-local" label="Local store" value={localWords(props.view.local)} />
        </Stack>
      )}
      {step === 1 && (
        <Stack gap={3} data-telemetry-step="export">
          <Switch checked={form.enabled} onChange={(enabled) => set({ enabled })} label="Export to a collector" size="sm" data-telemetry-export-switch>
            Export to a collector
          </Switch>
          <Field
            id="avoozl-telemetry-endpoint"
            label="Endpoint"
            help="The collector’s base URL. Avoozl adds /v1/traces and /v1/metrics."
            note="Blank uses OTEL_EXPORTER_OTLP_ENDPOINT. https, or http to this computer only."
          >
            <Input
              id="avoozl-telemetry-endpoint"
              value={form.endpoint}
              placeholder="https://collector.example:4318"
              onChange={(e: { target: { value: string } }) => set({ endpoint: e.target.value })}
            />
          </Field>
          <Field id="avoozl-telemetry-protocol" label="Protocol" help="OpenTelemetry’s JSON over HTTP. gRPC and protobuf are not sent." width="sm">
            <SelectField id="avoozl-telemetry-protocol" value={form.protocol} onChange={(e) => set({ protocol: e.target.value })} look="field">
              <option value="http/json">http/json</option>
            </SelectField>
          </Field>
          <Field
            id="avoozl-telemetry-headers"
            label="Header names"
            help={`Names only, such as authorization. Each value comes from ${HEADERS_VARIABLE} in the environment and is never saved.`}
            note="Blank sends the headers the environment names."
          >
            <Input
              id="avoozl-telemetry-headers"
              value={headersText}
              placeholder="authorization"
              onChange={(e: { target: { value: string } }) => {
                setHeadersText(e.target.value)
                setError(null)
              }}
            />
          </Field>
          {problem && <ErrorText role="alert">{problem}</ErrorText>}
        </Stack>
      )}
      {step === 2 && (
        <Stack gap={2} data-telemetry-step="review">
          <Line name="review-local" label="Local store" value="On, always" />
          <Line name="review-export" label="Export" value={final.enabled ? 'On' : 'Off'} />
          <Line name="review-endpoint" label="Endpoint" value={final.endpoint || 'From OTEL_EXPORTER_OTLP_ENDPOINT'} />
          <Line name="review-protocol" label="Protocol" value={final.protocol} />
          <Line
            name="review-headers"
            label="Header names"
            value={final.headers.length ? final.headers.map((name) => `${name} (value from ${HEADERS_VARIABLE})`).join(', ') : 'None'}
          />
          <Hint as="p" size="xs">
            {ENVIRONMENT_NOTE}
          </Hint>
          {error && <ErrorText role="alert">{error}</ErrorText>}
        </Stack>
      )}
    </Modal>
  )
}

export function TelemetrySettings(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => telemetryClient(api), [api])
  const [view, setView] = useState<TelemetryStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const { workspaceId } = props
  const read = useCallback(() => {
    if (workspaceId) client.status(workspaceId).then(setView, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId])
  useEffect(read, [read])
  if (!workspaceId || !view) return null
  const on = view.status !== 'off'
  const save = async (input: TelemetryInput) => setView(await client.configure(workspaceId, input))
  return (
    <FieldGroup title="Telemetry" boxed blurb="Task timing for Flow. Avoozl keeps it on this computer; sending it to a collector is optional.">
      <Stack gap={2} data-telemetry>
        <Line name="local" label="Local store" value={localWords(view.local)} />
        <Line name="status" label="Status" value={statusWords(view)} />
        {on && (
          <>
            <Line name="endpoint" label="Endpoint" value={endpointWords(view)} />
            <Line name="protocol" label="Protocol" value={view.protocol} />
            <Line name="headers" label="Header names" value={headerWords(view)} />
            <Row gap={4}>
              <Line name="sent" label="Sent" value={String(view.sent)} />
              <Line name="queued" label="Queued" value={String(view.queued)} />
              <Line name="dropped" label="Dropped" value={String(view.dropped)} />
              <Line name="rejected" label="Rejected" value={String(view.rejected)} />
            </Row>
            <Line name="last-success" label="Last success" value={lastSuccess(view.lastSuccessAt)} />
          </>
        )}
        <Hint as="p" size="xs">
          {ENVIRONMENT_NOTE}
        </Hint>
        <Row gap={2}>
          <Btn type="button" size="sm" onClick={() => setOpen(true)} data-telemetry-setup>
            {on ? 'Change export' : 'Set up export'}
          </Btn>
        </Row>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </Stack>
      {open && <ExportDialog view={view} save={save} onClose={() => setOpen(false)} />}
    </FieldGroup>
  )
}
