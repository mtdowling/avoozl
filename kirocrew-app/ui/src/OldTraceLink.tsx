// An old `?trace=owner/repo#52` link (Requirement 106.8): the page that held
// it is gone, so open the details of the task that owns that issue, which
// open on the Timeline tab. A link no task owns stays on Delivery, where App
// sent it. Reads the stored graph only. Renders nothing.
import { useEffect, useMemo } from 'react'
import { useAppApi } from './host.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { taskForIssue } from './nav-api.ts'
import { viewsClient } from './views-api.ts'

export default function OldTraceLink(props: { workspaceId: string | null; link: { repository: string; number: number } | null }) {
  const { workspaceId, link } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const drawer = useTaskDrawer()
  useEffect(() => {
    if (!link || !workspaceId) return
    let live = true
    void views.graph(workspaceId).then(
      (graph) => {
        const task = taskForIssue(graph, link)
        if (live && task) drawer.openTask(task.id, 'timeline')
      },
      () => undefined,
    )
    return () => {
      live = false
    }
    // Once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.repository, link?.number, workspaceId])
  return null
}
