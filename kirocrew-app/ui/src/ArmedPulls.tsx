// Armed pull requests under the stop banner (RC5.4): while a line stop is open
// the tick arms nothing, and a person can turn auto-merge off on ones already
// armed. Nothing shows without a stop or without an armed pull request.
import { useCallback, useMemo, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { releaseClient } from './release-api.ts'

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
    <div data-armed-pulls className="flex flex-col gap-1 text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="font-medium">Armed to merge by themselves while the line is stopped:</span>
      {pulls.map((pull) => (
        <span key={`${pull.repository}#${pull.number}`} className="flex flex-wrap items-center gap-2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ overflowWrap: 'anywhere' }}>
            {pull.repository} #{pull.number}
          </span>
          <Btn type="button" onClick={() => void disarm(pull.repository, pull.number)}>
            Disarm
          </Btn>
        </span>
      ))}
      {failure && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {failure}
        </p>
      )}
    </div>
  )
}
