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
import { Glyph } from './ui/Glyph'

export function WorkspacePill(props: { list: WorkspaceList | null; value: string | null; onChange: (id: string) => void; onManage: () => void }) {
  const { list } = props
  const [open, setOpen] = useState<DOMRect | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const current = list?.items.find((item) => item.id === props.value) ?? null
  const name = !list ? 'Loading…' : (current?.name ?? (list.items.length ? 'Pick a workspace' : 'No workspace yet'))
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
    <Box ref={root} data-workspace-switcher css-min-width="0" css-flex-shrink="0">
      <PlainButton
        type="button"
        data-workspace-pill
        data-workspace-id={props.value ?? ''}
        aria-label={`Workspace: ${name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        disabled={!list}
        onClick={(event) => setOpen(open ? null : event.currentTarget.getBoundingClientRect())}
        css-display="flex"
        css-align-items="center"
        css-gap="8"
        css-width="100%"
        css-min-width="0"
        css-flex-shrink="0"
        css-box-sizing="border-box"
        css-height={NAV_PILL}
        css-padding="0-10px"
        css-border-radius="12"
        css-border="1px-solid-border-strong-border"
        css-background="bg-elevated"
        css-box-shadow="0-1px-2px-rgba-0-0-0-0.05"
        css-color="text"
        css-cursor="pointer"
        css-text-align="left"
        css-font-size="14"
      >
        <Glyph icon={Folder} size={16} aria-hidden="true" css-flex-shrink="0" css-color="muted" />
        <Box
          as="span"
          css-min-width="0"
          css-flex="1-1-auto"
          css-overflow="hidden"
          css-text-overflow="ellipsis"
          css-white-space="nowrap"
          css-font-weight="600"
          css-line-height="20px"
        >
          {name}
        </Box>
        <Glyph icon={ChevronDown} size={15} aria-hidden="true" css-flex-shrink="0" css-color="muted" />
      </PlainButton>
      {open && (
        // Fixed under the pill, so the nav's own scroll box does not cut it.
        <Box
          role="menu"
          aria-label="Workspaces"
          data-workspace-menu
          css-position="fixed"
          css-top={open.bottom + 6}
          css-left={open.left}
          css-width={Math.max(open.width, 240)}
          css-max-width="calc-100vw-16px"
          css-max-height={`calc(100vh - ${Math.round(open.bottom) + 16}px)`}
          css-overflow-y="auto"
          css-z-index={LAYER.popover}
          css-box-sizing="border-box"
          css-padding="6"
          css-border-radius="10"
          css-border="1px-solid-border"
          css-background="card-bg-elevated"
          css-box-shadow="0-8px-24px-rgba-0-0-0-0.18"
          css-display="flex"
          css-flex-direction="column"
          css-gap="2"
        >
          <Box css-padding="4px-8px" css-font-size="12" css-font-weight="600" css-letter-spacing=".04em" css-text-transform="uppercase" css-color="muted">
            Workspaces
          </Box>
          {(list?.items ?? []).map((item) => {
            const here = item.id === props.value
            return (
              <PlainButton
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={here}
                data-workspace-option={item.id}
                onClick={() => pick(item.id)}
                css-display="flex"
                css-align-items="center"
                css-gap="8"
                css-width="100%"
                css-min-width="0"
                css-box-sizing="border-box"
                css-height="28"
                css-padding="0-8px"
                css-border="0"
                css-border-radius="6"
                css-background="none"
                css-color="text"
                css-font-size="13"
                css-text-align="left"
                css-cursor="pointer"
                css-font-weight={here ? '500' : '400'}
              >
                <Glyph icon={Folder} size={13} aria-hidden="true" css-flex-shrink="0" css-color="muted" />
                <Box as="span" css-min-width="0" css-flex="1-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">
                  {item.name}
                </Box>
                {here && <Glyph icon={Check} size={13} aria-hidden="true" css-flex-shrink="0" css-color="accent" />}
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
            css-display="flex"
            css-align-items="center"
            css-gap="8"
            css-width="100%"
            css-min-width="0"
            css-box-sizing="border-box"
            css-height="28"
            css-padding="0-8px"
            css-border="0"
            css-border-radius="6"
            css-background="none"
            css-font-size="13"
            css-text-align="left"
            css-cursor="pointer"
            css-color="muted"
          >
            <Glyph icon={Settings} size={13} aria-hidden="true" css-flex-shrink="0" />
            <Box as="span" css-min-width="0" css-flex="1-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">
              Manage workspaces
            </Box>
          </PlainButton>
        </Box>
      )}
    </Box>
  )
}
