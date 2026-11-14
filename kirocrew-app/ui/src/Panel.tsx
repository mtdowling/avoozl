// The Avoozl side-panel tab (rc-8.3, design D10). One tab that changes with
// the open chat: spec check and Approve in a Spec Builder chat, the claim a
// crew is on in a crew chat, a recap everywhere else. The host passes no
// props, so the chat comes from the page URL (panel-chat.ts).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn } from '@kirocrew/app-sdk/ui'
import { classifyChat, currentChat, opensItself, type PanelChat } from './panel-chat.ts'
import { plansClient, type SpecSummary } from './plans-api.ts'
import { SPEC_BUILDER_SPECS } from './spec-builder-api.ts'
import { viewsClient, type RadarCrews } from './views-api.ts'
import { errorMessage, readPageState, workspaceClient } from './workspace-api.ts'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export default function AvoozlPanel() {
  const api = useAppApi()
  const [workspaceId, setWorkspaceId] = useState<string | null>(readPageState(storage()).workspaceId)
  const [specNames, setSpecNames] = useState<string[]>([])
  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [crews, setCrews] = useState<RadarCrews | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const chat = useMemo(() => currentChat(window.location), [])
  const plans = useMemo(() => plansClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])

  const load = useCallback(async () => {
    try {
      setError(null)
      let id = workspaceId
      if (!id) {
        id = (await workspaceClient(api).list()).defaultWorkspace
        setWorkspaceId(id)
      }
      if (!id) return
      // Spec Builder's list names the specs; their chats are spec-builder-<name>.
      const listed = await api.get<{ specs?: { name: string }[] }>(SPEC_BUILDER_SPECS).catch(() => ({ specs: [] }))
      setSpecNames((listed.specs ?? []).map((spec) => spec.name))
      setSpecs((await plans.specs(id)).items)
      setCrews(await views.radarCrews(id))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [api, plans, views, workspaceId])
  useEffect(() => {
    void load()
  }, [load])

  const kind: PanelChat = classifyChat(chat, { specs: specNames })
  const spec = kind.kind === 'spec-builder' ? specs.find((item) => item.name === kind.spec) : undefined

  const approve = async () => {
    if (!workspaceId || !spec?.plan || !spec.hash) return
    try {
      await plans.approve(workspaceId, spec.plan.id, spec.hash)
      setNote('Approved this revision for Avoozl.')
      await load()
    } catch (caught) {
      setNote(errorMessage(caught))
    }
  }
  const store = async () => {
    if (!workspaceId || !spec) return
    try {
      await plans.store(workspaceId, spec.name)
      setNote('Stored as a draft. Review it in Specs, then approve.')
      await load()
    } catch (caught) {
      setNote(errorMessage(caught))
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-sm" data-panel-kind={kind.kind}>
      {error && <p role="alert">Avoozl can't read this workspace: {error}</p>}
      {kind.kind === 'spec-builder' && (
        <section data-panel-spec>
          <h3 className="font-semibold">Spec check: {kind.spec}</h3>
          {!spec && <p className="text-muted">Avoozl has not read this spec folder yet.</p>}
          {spec && (
            <>
              <ul>
                <li>Files: {spec.files.join(', ') || 'none'}</li>
                <li>Tasks: {spec.taskCount}</li>
                <li>
                  Problems: {spec.counts.error} errors, {spec.counts.warning} warnings
                </li>
                <li>{spec.plan?.approved ? 'Approved for Avoozl.' : 'Not approved for Avoozl.'}</li>
              </ul>
              {opensItself(kind, { files: spec.files, approved: Boolean(spec.plan?.approved) }) && (
                <p className="text-muted">tasks.md is written and not approved yet.</p>
              )}
              {!spec.plan && <Btn onClick={() => void store()}>Store this spec</Btn>}
              {spec.plan && !spec.plan.approved && (
                <Btn primary disabled={spec.counts.error > 0 || !spec.hash} onClick={() => void approve()}>
                  Approve for Avoozl
                </Btn>
              )}
            </>
          )}
          {note && <p role="status">{note}</p>}
        </section>
      )}
      {kind.kind === 'crew' && (
        <section data-panel-crew>
          <h3 className="font-semibold">Crew {kind.crew}</h3>
          {(() => {
            const row = crews?.rows.find((item) => item.crewId === kind.crew)
            if (!row) return <p className="text-muted">No live claim from this crew in Avoozl's repositories.</p>
            return (
              <p>
                {row.repository}#{row.number} {row.title}: {row.phase ?? 'no phase'}
                {row.pr ? `, PR #${row.pr}` : ''}
                {row.stale ? ' (stale)' : ''}
              </p>
            )
          })()}
        </section>
      )}
      {kind.kind === 'avoozl' && <p className="text-muted">An Avoozl chat. Its result shows in the Avoozl page.</p>}
      {kind.kind === 'other' && (
        <section data-panel-recap>
          <h3 className="font-semibold">Recap</h3>
          <p>
            {crews ? `${crews.rows.length} crew${crews.rows.length === 1 ? '' : 's'} on the line` : 'Loading…'}
            {crews && crews.stale ? `, ${crews.stale} stale` : ''}
          </p>
        </section>
      )}
    </div>
  )
}
