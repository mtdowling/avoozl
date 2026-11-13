import { useCallback, useEffect, useMemo, useState } from 'react'
import AddPlugin from './AddPlugin.tsx'
import IntakeSources from './IntakeSources.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { Card, EmptyState } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import {
  CONTRACT_LABEL,
  canApprove,
  PLUGIN_PARTS,
  partsOf,
  pluginsClient,
  lessonsPackText,
  stateLabel,
  type LessonsPackPreview,
  type PluginRow,
} from './plugins-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { DangerBtn, IconLabel, SectionHeading, TipBtn } from './controls.tsx'
import { PackImportDialog } from './PackImport.tsx'
import { SkillNoteCard } from './FlowMemory.tsx'
import { flowClient, type SkillNote } from './flow-api.ts'
import { BookOpen, MessagesSquare, Trash2 } from './icons.ts'
import { useMedia } from './use-media.ts'
import { DocumentReader } from './DocumentReader.tsx'
import { DESIGN_PLUGIN_TIP, PLUGIN_GUIDE, PLUGIN_GUIDE_TIP, pluginDesignMessage } from './design-chat.ts'
import pluginGuide from '../../../docs/plugins.md?raw'

// What a person reviews before approving (R34.4). Every value is the
// plugin's own text, rendered as text.
export function Facts({ row }: { row: PluginRow }) {
  const capabilities = Object.entries(row.capabilities ?? {})
    .map(([kind, list]) => `${kind}: ${list.length ? list.join(', ') : 'none'}`)
    .join('; ')
  const facts: [string, string | undefined][] = [
    ['Version', row.version],
    [CONTRACT_LABEL, row.contract === undefined ? undefined : String(row.contract)],
    ['Runs code as', row.kinds?.length ? row.kinds.join(', ') : row.kinds ? 'nothing: settings only' : undefined],
    ['Capabilities', capabilities || undefined],
    ['Declared in', row.source === 'machine' ? 'this machine' : '.avoozl.json'],
    ['Git', row.git ? [row.git.url, row.git.subdir].filter(Boolean).join(' : ') : undefined],
    ['Ref', row.git?.ref],
    ['Commit', row.commit],
    ['Location', row.location],
    ['Content hash', row.hash],
  ]
  return (
    <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs" style={{ gridTemplateColumns: "auto 1fr" }}>
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="break-all">
              <code>{value}</code>
            </dd>
          </div>
        ))}
    </dl>
  )
}

// Each part an installed plugin bundles, and for a pack what was imported.
export function Parts({ row }: { row: PluginRow }) {
  const parts = partsOf(row)
  if (!parts.length) return null
  return (
    <ul className="mt-2 flex flex-col gap-1 text-xs" data-plugin-parts>
      {parts.map((part) => (
        <li key={part}>
          <span className="font-semibold">{PLUGIN_PARTS[part]?.title ?? part}</span>
          <span className="text-muted"> {PLUGIN_PARTS[part]?.line}</span>
          {part === 'pack' && row.pack ? (
            <span className="block text-muted">
              {row.pack.imported
                ? `Imported version ${row.pack.imported.version}: ${row.pack.imported.settings.length} settings.${row.pack.offer ? ` Version ${row.version} is not imported yet.` : ''}`
                : 'Not imported yet.'}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// A plugin's lessons pack: preview first, then a person imports exactly
// what the preview showed (R69.7).
function LessonsPack({ row, busy, act, client, workspaceId }: { row: PluginRow; busy: boolean; act: (fn: () => Promise<unknown>) => void; client: ReturnType<typeof pluginsClient>; workspaceId: string }) {
  const [preview, setPreview] = useState<LessonsPackPreview | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const id = row.id ?? ''
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs" data-lessons-pack={id}>
      {preview ? (
        <>
          <span>{lessonsPackText(preview)}</span>
          <div className="flex flex-wrap gap-2">
            <TipBtn
              tooltip="Import these lessons read-only, named by this plugin and version"
              primary
              disabled={busy || row.state !== 'approved'}
              onClick={() =>
                act(async () => {
                  await client.lessonsImport(workspaceId, id, preview.hash)
                  setDone(`Imported ${preview.rows.filter((r) => r.action !== 'retire').length} lessons.`)
                  setPreview(null)
                })
              }
            >
              Import lessons
            </TipBtn>
            <TipBtn tooltip="Close the preview without importing" disabled={busy} onClick={() => setPreview(null)}>
              Cancel
            </TipBtn>
          </div>
        </>
      ) : (
        <div>
          <TipBtn tooltip="See which lessons importing this pack adds, changes or retires" disabled={busy} onClick={() => act(async () => setPreview(await client.lessonsPreview(workspaceId, id)))}>
            Preview lessons pack
          </TipBtn>
        </div>
      )}
      {done && <span className="text-muted">{done}</span>}
    </div>
  )
}

function PluginCard(props: { row: PluginRow; busy: boolean; act: (fn: () => Promise<unknown>) => void; client: ReturnType<typeof pluginsClient>; workspaceId: string; onImport: (row: PluginRow) => void; notes: SkillNote[] }) {
  const { row, busy, act, client, workspaceId } = props
  const status = stateLabel(row)
  const id = row.id ?? ''
  return (
    <Card>
      <SectionHeading
        title={row.id ?? 'Unnamed entry'}
        meta={
          <>
            <Badge variant={status.attention ? 'warning' : undefined}>{status.label}</Badge>
            {row.health?.state === 'ok' ? <Badge>Healthy</Badge> : null}
          </>
        }
      />
      {row.reason ? <p className="mt-1 text-xs text-muted">{row.reason}</p> : null}
      {row.health?.state === 'unavailable' && row.health.reason !== row.reason ? (
        <p className="mt-1 text-xs text-muted">Last tick: {row.health.reason}</p>
      ) : null}
      <Parts row={row} />
      <Facts row={row} />
      {partsOf(row).includes('lessons') && row.id ? <LessonsPack row={row} busy={busy} act={act} client={client} workspaceId={workspaceId} /> : null}
      {props.notes.length > 0 && (
        <div className="mt-2 flex flex-col gap-2" data-plugin-notes>
          <span className="text-xs font-semibold">Suggested changes from retros. Copy one to the plugin's owner; Avoozl sends nothing.</span>
          {props.notes.map((n, i) => (
            <SkillNoteCard key={i} note={n} />
          ))}
        </div>
      )}
      {row.id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.pack ? (
            <TipBtn tooltip="See what each pack setting would create, change or keep, then import it" primary={row.pack.offer && row.state === 'approved'} disabled={busy} onClick={() => props.onImport(row)}>
              {row.pack.imported && row.pack.offer ? `Preview version ${row.version}` : row.pack.imported ? 'Preview pack' : 'Preview and import pack'}
            </TipBtn>
          ) : null}
          {canApprove(row) ? (
            <TipBtn tooltip="Trust this exact version so it may run" primary disabled={busy} onClick={() => act(() => client.approve(workspaceId, row))}>
              Approve version {row.version}
              {row.commit ? ` at ${row.commit.slice(0, 12)}` : ''}
            </TipBtn>
          ) : null}
          {row.git ? (
            <TipBtn tooltip="Fetch the ref's current commit. A new commit needs approval again." disabled={busy} onClick={() => act(() => client.update(workspaceId, id))}>
              {row.commit ? `Update from ${row.git.ref}` : `Fetch ${row.git.ref}`}
            </TipBtn>
          ) : null}
          {row.state === 'disabled' ? (
            <TipBtn tooltip="Let this plugin run again" disabled={busy} onClick={() => act(() => client.disable(workspaceId, id, false))}>
              Enable
            </TipBtn>
          ) : row.state !== 'invalid' && row.state !== 'missing' ? (
            <TipBtn tooltip="Stop this plugin from running. Enable undoes it." disabled={busy} onClick={() => act(() => client.disable(workspaceId, id, true))}>
              Disable
            </TipBtn>
          ) : null}
          <span className="ml-auto">
            <DangerBtn
              icon={Trash2}
              disabled={busy}
              confirm={{
                title: `Remove the plugin ${row.id}?`,
                body: 'Its declaration and approval are removed. Its tasks stay, waiting as "needs you" until the plugin is declared and approved again.',
                action: 'Remove plugin',
              }}
              onConfirm={() => act(() => client.remove(workspaceId, id))}
            >
              Remove
            </DangerBtn>
          </span>
        </div>
      ) : null}
    </Card>
  )
}

// Settings > Plugins (design §4.8, R34.9): every declared plugin with its
// kinds, version, approval and health; Add plugin, approve, disable, remove.
export default function PluginsSettings({ workspaceId, onOpenGitHub }: { workspaceId: string; onOpenGitHub?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => pluginsClient(api), [api])
  const load = useCallback((id: string) => client.list(id), [client])
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [importing, setImporting] = useState<PluginRow | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const { openChat } = useChatLauncher()
  const design = () =>
    openChat({
      message: pluginDesignMessage({
        supported: value?.supportedContracts ?? [],
        installed: (value?.plugins ?? []).flatMap((row) => (row.id ? [row.id] : [])),
      }),
      autoSend: false,
    })
  const act = (fn: () => Promise<unknown>) => {
    setActing(true)
    setActionError(null)
    fn()
      .then(() => reload())
      .catch((caught) => setActionError(errorMessage(caught)))
      .finally(() => setActing(false))
  }
  // Add plugin on the left, the installed list on the right; stacked when
  // the page is narrow.
  const wide = useMedia('(min-width: 1024px)')
  // Suggested skill changes approved from retros, by plugin (R68.11).
  const api2 = useMemo(() => flowClient(api), [api])
  const [notes, setNotes] = useState<SkillNote[]>([])
  useEffect(() => {
    let live = true
    api2.proposals(workspaceId).then(
      (p) => live && setNotes(p.notes),
      () => live && setNotes([]),
    )
    return () => {
      live = false
    }
  }, [api2, workspaceId])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" data-plugin-help>
        <IconLabel icon={MessagesSquare} tooltip={DESIGN_PLUGIN_TIP} onClick={design}>
          Design a plugin
        </IconLabel>
        <IconLabel icon={BookOpen} tooltip={PLUGIN_GUIDE_TIP} onClick={() => setGuide(true)}>
          Plugin guide
        </IconLabel>
      </div>
      {guide ? (
        <DocumentReader workspaceId={workspaceId} target={{ document: PLUGIN_GUIDE, lineStart: null, lineEnd: null }} text={pluginGuide} onClose={() => setGuide(false)} />
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {actionError ? <p className="text-xs text-danger">{actionError}</p> : null}
      {note ? (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      ) : null}
      {importing ? (
        <PackImportDialog
          row={importing}
          workspaceId={workspaceId}
          client={client}
          onChanged={reload}
          onClose={(text) => {
            setImporting(null)
            setNote(text ?? null)
          }}
        />
      ) : null}
      <div
        data-plugins-layout
        style={
          wide
            ? { display: 'grid', gridTemplateColumns: 'minmax(18rem, 2fr) minmax(0, 3fr)', gap: 14, alignItems: 'start' }
            : { display: 'flex', flexDirection: 'column', gap: 14 }
        }
      >
        <AddPlugin workspaceId={workspaceId} client={client} supported={value?.supportedContracts ?? []} onChanged={reload} />
        <div className="flex min-w-0 flex-col gap-3" aria-label="Installed plugins">
          {value && !value.plugins.length ? (
            <Card>
              <EmptyState title="No plugins" subtitle="Nothing loads until a plugin is declared and approved. Add one on the left." />
            </Card>
          ) : null}
          {value?.plugins.map((row, i) => (
            <PluginCard key={`${row.id}-${row.source}-${i}`} row={row} busy={acting || busy} act={act} client={client} workspaceId={workspaceId} onImport={setImporting} notes={notes.filter((n) => n.plugin === row.id)} />
          ))}
        </div>
      </div>
      <IntakeSources workspaceId={workspaceId} plugins={value?.plugins ?? []} onOpenGitHub={onOpenGitHub} />
    </div>
  )
}
