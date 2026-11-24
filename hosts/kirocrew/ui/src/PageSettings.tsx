// Settings > Workspaces > Browser page: whether this computer's tick keeps
// the standalone page up, where it is and how to sign in to it (spec
// standalone-web, SW9). Read once when the box opens; the standalone page
// itself does not show it.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { useHostKind } from './host-kind.ts'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PAGE_OFF_HELP, pageClient, pageWords, type PageStatus } from './page-api.ts'

export function PageSettings(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const host = useHostKind()
  const client = useMemo(() => pageClient(api), [api])
  const [view, setView] = useState<PageStatus | null>(null)
  const { workspaceId } = props
  useEffect(() => {
    if (workspaceId) client.status(workspaceId).then(setView, () => setView(null))
  }, [client, workspaceId])
  if (host === 'standalone' || !view) return null
  return (
    <FieldGroup title="Browser page" boxed blurb="Avoozl in a plain browser tab, on this computer only (127.0.0.1). Each tick keeps it running.">
      <Stack gap={2} data-page-status={view.running ? 'running' : view.enabled ? 'starting' : 'off'}>
        <Box as="p" size="sm" css-overflow-wrap="anywhere">
          {pageWords(view)}
        </Box>
        {view.enabled && (
          <Hint as="p" size="xs">
            {PAGE_OFF_HELP}
          </Hint>
        )}
      </Stack>
    </FieldGroup>
  )
}
