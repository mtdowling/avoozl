import { useCallback, useMemo, useState } from 'react'
import AddPlugin from './AddPlugin.tsx'
import IntakeSources from './IntakeSources.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { EmptyState } from './ui/EmptyState'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { PairedCard, PairedCards } from './ui/PairedCards.tsx'
import Badge from './ui/Badge.tsx'
import {
  CONTRACT_LABEL,
  canApprove,
  capabilityLine,
  runsAs,
  PLUGIN_PARTS,
  partsOf,
  pluginsClient,
  signInClaims,
  signInClashes,
  stateLabel,
  updateBadge,
  updateLine,
  type PluginRow,
} from './plugins-api.ts'
import { useRead } from './useRead.ts'
import { Switch } from './ui/Switch'
import { PluginChecksFacts } from './PluginChecks.tsx'
import { ContextPartFacts } from './ContextPart.tsx'
import { errorMessage } from './workspace-api.ts'
import { AskForHelp, DangerBtn, IconLabel, TipBtn } from './ui/controls.tsx'
import { BookOpen, MessagesSquare, Trash2 } from './icons.ts'
import { useMedia } from './use-media.ts'
import { DocumentReader } from './DocumentReader.tsx'
import { DESIGN_PLUGIN_TIP, PLUGIN_GUIDE, PLUGIN_GUIDE_TIP, pluginDesignMessage } from './design-chat.ts'
import pluginGuide from '../../../../docs/plugins.md?raw'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

// What a person reviews before approving (R34.4). Every value is the
// plugin's own text, rendered as text.
export function Facts({ row }: { row: PluginRow }) {
  const facts: [string, string | undefined][] = [
    ['Version', row.version],
    [CONTRACT_LABEL, row.contract === undefined ? undefined : String(row.contract)],
    ['Runs code as', runsAs(row.kinds)],
    ['Capabilities', capabilityLine(row.capabilities)],
    ['Declared in', row.source === 'machine' ? 'this machine' : '.avoozl.json'],
    ['Git', row.git ? [row.git.url, row.git.subdir].filter(Boolean).join(' : ') : undefined],
    ['Ref', row.git?.ref],
    ['Commit', row.commit],
    ['Location', row.location],
    ['Content hash', row.hash],
  ]
  return (
    <Box as="dl" css-grid-template-columns="auto-1fr" mt="2" grid gapX="3" gapY="1" size="xs">
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <Box key={label} contents>
            <Hint as="dt">{label}</Hint>
            <Box as="dd" breakAll>
              <code>{value}</code>
            </Box>
          </Box>
        ))}
    </Box>
  )
}

// Each part an installed plugin bundles.
export function Parts({ row }: { row: PluginRow }) {
  const parts = partsOf(row)
  if (!parts.length) return null
  return (
    <Box as="ul" mt="2" flex flexCol gap="1" size="xs" data-plugin-parts>
      {parts.map((part) => (
        <li key={part}>
          <Box as="span" weight="semibold">
            {PLUGIN_PARTS[part]?.title ?? part}
          </Box>
          <Hint> {PLUGIN_PARTS[part]?.line}</Hint>
          {part === 'credentials'
            ? signInClaims(row).map((line) => (
                <Hint block key={line} data-plugin-signin>
                  {line}
                </Hint>
              ))
            : null}
        </li>
      ))}
    </Box>
  )
}

function PluginCard(props: { row: PluginRow; busy: boolean; act: (fn: () => Promise<unknown>) => void; client: ReturnType<typeof pluginsClient>; workspaceId: string }) {
  const { row, busy, act, client, workspaceId } = props
  const status = stateLabel(row)
  const id = row.id ?? ''
  const update = updateBadge(row.update)
  const checked = updateLine(row.update)
  return (
    <FieldGroup
      level={4}
      title={row.id ?? 'Unnamed entry'}
      meta={
        <>
          <Badge variant={status.attention ? 'warning' : undefined}>{status.label}</Badge>
          {row.health?.state === 'ok' ? <Badge>Healthy</Badge> : null}
          {update ? (
            <Badge variant="info" data-plugin-update>
              {update}
            </Badge>
          ) : null}
        </>
      }
    >
      {row.reason || (row.health?.state === 'unavailable' && row.health.reason !== row.reason) ? (
        <div>
          {row.reason ? (
            <Hint as="p" size="xs">
              {row.reason}
            </Hint>
          ) : null}
          {row.health?.state === 'unavailable' && row.health.reason !== row.reason ? (
            <Hint as="p" size="xs">
              Last tick: {row.health.reason}
            </Hint>
          ) : null}
        </div>
      ) : null}
      {checked ? (
        <Hint as="p" size="xs" data-plugin-update-line>
          {checked}
        </Hint>
      ) : null}
      <Parts row={row} />
      {row.checks && row.id ? <PluginChecksFacts plugin={row.id} part={row.checks} busy={busy} act={act} workspaceId={workspaceId} /> : null}
      {row.context && row.id ? <ContextPartFacts plugin={row.id} part={row.context} busy={busy} act={act} workspaceId={workspaceId} /> : null}
      <Facts row={row} />
      {row.id ? (
        <Row gap={2} align="start">
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
          {row.update !== undefined && row.state !== 'disabled' ? (
            <TipBtn tooltip="Ask whether a newer version exists. Fetches and installs nothing." disabled={busy} onClick={() => act(() => client.checkUpdates(workspaceId, id))}>
              Check now
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
          <Box as="span" ml="auto">
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
          </Box>
        </Row>
      ) : null}
    </FieldGroup>
  )
}

// Settings > Plugins (design §4.8, R34.9): every declared plugin with its
// kinds, version, approval and health; Add plugin, approve, disable, remove.
export default function PluginsSettings({ workspaceId, onOpenGitHub, onOpenRepositories }: { workspaceId: string; onOpenGitHub?: () => void; onOpenRepositories?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => pluginsClient(api), [api])
  const load = useCallback((id: string) => client.list(id), [client])
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
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
  return (
    <Stack gap={3}>
      <Row gap={2} align="start" data-plugin-help>
        <IconLabel icon={MessagesSquare} tooltip={DESIGN_PLUGIN_TIP} onClick={design}>
          Design a plugin
        </IconLabel>
        <IconLabel icon={BookOpen} tooltip={PLUGIN_GUIDE_TIP} onClick={() => setGuide(true)}>
          Plugin guide
        </IconLabel>
      </Row>
      {guide ? (
        <DocumentReader workspaceId={workspaceId} target={{ document: PLUGIN_GUIDE, lineStart: null, lineEnd: null }} text={pluginGuide} onClose={() => setGuide(false)} />
      ) : null}
      {error ? <ErrorText size="xs">{error}</ErrorText> : null}
      {actionError ? <ErrorText size="xs">{actionError}</ErrorText> : null}
      {note ? (
        <Hint as="p" size="xs" role="status">
          {note}
        </Hint>
      ) : null}
      {signInClashes(value?.plugins ?? []).map((clash) => (
        <Box key={clash.host} as="div" flex flexCol gap="1" size="sm" data-signin-clash>
          <p>
            {clash.plugins.join(' and ')} both sign Avoozl in to {clash.host} for the same owner.{' '}
            {value?.credentialsPick?.[clash.host] ? `Signing in through ${value.credentialsPick[clash.host]}.` : 'GitHub work for that owner waits until you pick one.'}
          </p>
          <Row gap={2}>
            {clash.plugins
              .filter((id) => id !== value?.credentialsPick?.[clash.host])
              .map((id) => (
                <TipBtn key={id} tooltip={`Sign in through ${id} on ${clash.host}`} disabled={acting || busy} onClick={() => act(() => client.pick(workspaceId, clash.host, id))}>
                  Use this one: {id}
                </TipBtn>
              ))}
          </Row>
        </Box>
      ))}
      <PairedCards paired={wide} attrs={{ 'data-plugins-layout': '' }}>
        <AddPlugin workspaceId={workspaceId} client={client} supported={value?.supportedContracts ?? []} onChanged={reload} />
        <PairedCard title="Installed plugins" label="Installed plugins" meta={value?.plugins.length ? <Badge>{value.plugins.length}</Badge> : null} grow={3}>
          {value && !value.plugins.length ? (
            <EmptyState
              title="No plugins"
              subtitle="Nothing loads until a plugin is declared and approved. Add one on the left."
              action={
                <AskForHelp
                  workspaceId={workspaceId}
                  help={{
                    page: 'Settings › Plugins',
                    section: 'No plugins',
                    says: 'Nothing loads until a plugin is declared and approved. Add one on the left.',
                    settings: [{ key: 'plugins', value: 'none declared' }],
                    docs: 'docs/plugins.md, and the avoozl-plugin skill',
                  }}
                />
              }
            />
          ) : null}
          {value?.updateChecks ? (
            <Box mb="3" data-plugin-update-checks>
              <Switch
                checked={value.updateChecks.enabled}
                onChange={(next) => act(() => client.configureUpdates(workspaceId, next))}
                label="Check for plugin updates daily"
                size="sm"
                disabled={acting || busy}
              >
                Check for plugin updates daily
              </Switch>
              <Hint as="p" size="xs">
                Asks each plugin's source once a day whether something newer exists. It never fetches or installs: you choose Update, review and approve.
              </Hint>
            </Box>
          ) : null}
          <Stack gap={4}>
            {value?.plugins.map((row, i) => (
              <PluginCard key={`${row.id}-${row.source}-${i}`} row={row} busy={acting || busy} act={act} client={client} workspaceId={workspaceId} />
            ))}
          </Stack>
        </PairedCard>
      </PairedCards>
      <IntakeSources workspaceId={workspaceId} plugins={value?.plugins ?? []} onOpenGitHub={onOpenGitHub} onOpenRepositories={onOpenRepositories} />
    </Stack>
  )
}
