// The workspace switcher at the top of the left nav (and of the phone's
// menu), as Issue Radar's rail starts with its repo switcher: one elevated
// pill with the workspace's name, opening a list of workspaces downward.
// Every page reads from the one picked here.
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, Settings } from './icons.ts'
import { LAYER } from './layers.ts'
import { NAV_PILL } from './nav-style.ts'
import type { WorkspaceList } from './workspace-api.ts'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

// Radar's switcher, measured: 12px corners, the strong border, a small
// shadow, 14px semibold name. Kept at Kiro Crew's compact 28px button
// height, as every nav button is.
const PILL = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  minWidth: 0,
  flexShrink: 0,
  boxSizing: 'border-box',
  height: NAV_PILL,
  padding: '0 10px',
  borderRadius: 12,
  border: '1px solid var(--border-strong, var(--border))',
  background: 'var(--bg-elevated)',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  color: 'var(--text)',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 14,
} as const

export function WorkspacePill(props: {
  list: WorkspaceList | null
  value: string | null
  onChange: (id: string) => void
  onManage: () => void
}) {
  const { list } = props
  const [open, setOpen] = useState<DOMRect | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const current = list?.items.find((item) => item.id === props.value) ?? null
  const name = !list ? 'Loading…' : current?.name ?? (list.items.length ? 'Pick a workspace' : 'No workspace yet')
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null)
    }
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null)
    const away = () => setOpen(null)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', away)
    }
  }, [open])
  const pick = (id: string) => {
    setOpen(null)
    if (id !== props.value) props.onChange(id)
  }
  return (
    <div ref={root} data-workspace-switcher style={{ minWidth: 0, flexShrink: 0 }}>
      <button
        type="button"
        data-workspace-pill
        data-workspace-id={props.value ?? ''}
        aria-label={`Workspace: ${name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        disabled={!list}
        onClick={(event) => setOpen(open ? null : event.currentTarget.getBoundingClientRect())}
        style={PILL}
      >
        <Folder size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--muted)' }} />
        <Box as="span" css-min-width="0" css-flex="1-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap" css-font-weight="600" css-line-height="20px">{name}</Box>
        <ChevronDown size={15} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--muted)' }} />
      </button>
      {open && (
        // Fixed under the pill, so the nav's own scroll box does not cut it.
        <div
          role="menu"
          aria-label="Workspaces"
          data-workspace-menu
          style={{ position: 'fixed', top: open.bottom + 6, left: open.left, width: Math.max(open.width, 240), maxWidth: 'calc(100vw - 16px)', maxHeight: `calc(100vh - ${Math.round(open.bottom) + 16}px)`, overflowY: 'auto', zIndex: LAYER.popover, boxSizing: 'border-box', padding: 6, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, var(--bg-elevated))', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Box css-padding="4px-8px" css-font-size="12" css-font-weight="600" css-letter-spacing=".04em" css-text-transform="uppercase" css-color="muted">Workspaces</Box>
          {(list?.items ?? []).map((item) => {
            const here = item.id === props.value
            return (
              <PlainButton key={item.id} type="button" role="menuitemradio" aria-checked={here} data-workspace-option={item.id} onClick={() => pick(item.id)} css-display="flex" css-align-items="center" css-gap="8" css-width="100%" css-min-width="0" css-box-sizing="border-box" css-height="28" css-padding="0-8px" css-border="0" css-border-radius="6" css-background="none" css-color="text" css-font-size="13" css-text-align="left" css-cursor="pointer" css-font-weight={here ? '500' : '400'}>
                <Folder size={13} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--muted)' }} />
                <Box as="span" css-min-width="0" css-flex="1-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">{item.name}</Box>
                {here && <Check size={13} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)' }} />}
              </PlainButton>
            )
          })}
          <Box css-border-top="1px-solid-border" css-margin="4px-0" />
          <PlainButton
            type="button"
            role="menuitem"
            data-workspace-manage
            onClick={() => {
              setOpen(null)
              props.onManage()
            }}
            css-display="flex" css-align-items="center" css-gap="8" css-width="100%" css-min-width="0" css-box-sizing="border-box" css-height="28" css-padding="0-8px" css-border="0" css-border-radius="6" css-background="none" css-font-size="13" css-text-align="left" css-cursor="pointer" css-color="muted"
          >
            <Settings size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
            <Box as="span" css-min-width="0" css-flex="1-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">Manage workspaces</Box>
          </PlainButton>
        </div>
      )}
    </div>
  )
}
