// Armed pull requests under the stop banner (RC5.4): while a line stop is open
// the tick arms nothing, and a person can turn auto-merge off on ones already
// armed. Nothing shows without a stop or without an armed pull request.
import { useCallback, useMemo, useState } from 'react'
import { Btn } from './ui/Btn'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { releaseClient } from './release-api.ts'
import { Box } from './ui/Box'

export default function ArmedPulls(props: { workspaceId: string | null; stopped: boolean }) {
  const api = useAppApi()
  const client = useMemo(() => releaseClient(api), [api])
  const load = useCallback((id: string) => client.armed(id), [client])
  const { value, reload } = useRead(props.stopped ? props.workspaceId : null, load)
  const [failure, setFailure] = useState<string | null>(null)
  const pulls = value?.pullRequests ?? []
  if (!props.stopped || !props.workspaceId || !pulls.length) return null
  const disarm = async (repository: string, number: number) => {
    setFailure(null)
    try {
      await client.disarm(props.workspaceId as string, repository, number)
      await reload()
    } catch (caught) {
      setFailure(errorMessage(caught))
    }
  }
  return (
    <Box data-armed-pulls css-display="flex" css-flex-direction="column" css-gap="4" flex flexCol gap="1" size="sm">
      <Box as="span" weight="medium">
        Armed to merge by themselves while the line is stopped:
      </Box>
      {pulls.map((pull) => (
        <Box key={`${pull.repository}#${pull.number}`} as="span" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8" flex flexWrap items="center" gap="2">
          <Box as="span" css-overflow-wrap="anywhere">
            {pull.repository} #{pull.number}
          </Box>
          <Btn type="button" onClick={() => void disarm(pull.repository, pull.number)}>
            Disarm
          </Btn>
        </Box>
      ))}
      {failure && (
        <Box role="alert" as="p" css-color="danger">
          {failure}
        </Box>
      )}
    </Box>
  )
}
