// Settings > Workspaces > API key: the one key for scripts and other programs
// that are not a browser. It goes in the X-Api-Key header, never in an address.
// Only the standalone page shows it: it is the page the key works on (SW4.12).
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { DangerBtn } from './ui/controls.tsx'
import { FormSection } from './FormSection.tsx'
import { useInstance } from './InstanceName.tsx'
import { apiKeyClient, KEY_HEADER, REGENERATE_CONFIRM } from './api-key-api.ts'
import { errorMessage } from './workspace-api.ts'

export function ApiKeySettings(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => apiKeyClient(api), [api])
  const host = useInstance(props.workspaceId)?.host
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  if (host !== 'standalone') return null
  const run = (call: () => Promise<{ key: string }>) =>
    call().then(
      (view) => {
        setKey(view.key)
        setError(null)
        setCopied(false)
      },
      (caught: unknown) => setError(errorMessage(caught)),
    )
  return (
    <FormSection title="API key" blurb={`For scripts and other programs that are not a browser. Send it in the ${KEY_HEADER} header on a request to this page's command address, never in the address itself.`}>
      <Stack gap={2} data-api-key>
        <Row gap={2}>
          <Btn onClick={() => void run(client.view)}>Show key</Btn>
          <DangerBtn confirm={REGENERATE_CONFIRM} onConfirm={() => void run(client.regenerate)}>
            Regenerate
          </DangerBtn>
        </Row>
        {key && (
          <Row gap={2}>
            <Input readOnly value={key} aria-label="API key" onFocus={(event) => event.currentTarget.select()} />
            <Btn
              onClick={() =>
                void navigator.clipboard.writeText(key).then(() => setCopied(true))
              }
            >
              {copied ? 'Copied' : 'Copy'}
            </Btn>
          </Row>
        )}
        <Hint size="xs">Regenerating stops the old key at once.</Hint>
        {error && <ErrorText size="sm">{error}</ErrorText>}
      </Stack>
    </FormSection>
  )
}
