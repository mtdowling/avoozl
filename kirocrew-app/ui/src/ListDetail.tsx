// The phone's detail pane, from Kiro Crew's list-detail pattern: a sticky row
// that holds the Back control and, once the big title has scrolled away, the
// title in small type. Back is the only way out of the pane, so it is
// a normal compact button. On a desktop this renders its children and nothing else.
import { createContext, useContext, type ReactNode } from 'react'
import { ArrowLeft } from './icons.ts'
import { LAYER } from './layers.ts'
import { usePhone } from './list-detail.ts'
import { useTitleScrolledOut } from './use-title-scrolled-out.ts'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

export function ListDetailBack(props: { label: string; onBack: () => void }) {
  return (
    <PlainButton
      type="button"
      data-list-detail-back
      onClick={props.onBack}
      css-display="inline-flex"
      css-align-items="center"
      css-gap="4"
      css-flex-shrink="0"
      css-padding="2px-8px"
      css-margin-left={-4}
      css-background="none"
      css-border="0"
      css-border-radius="6"
      css-color="muted"
      css-cursor="pointer"
      css-font-size="14"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {props.label}
    </PlainButton>
  )
}

// The sticky row alone, for a page that draws its own big title: pass that
// title's `titleRef` (useTitleScrolledOut) and `scrolledOut`.
export function DetailBar(props: { backLabel: string; onBack: () => void; title: string; scrolledOut: boolean; actions?: ReactNode }) {
  return (
    <Box data-detail-bar css-position="sticky" css-top="0" css-z-index={LAYER.sticky} css-display="flex" css-align-items="center" css-gap="8" css-background="bg">
      <ListDetailBack label={props.backLabel} onBack={props.onBack} />
      <Box
        aria-hidden="true"
        data-detail-echo
        as="span"
        css-min-width="0"
        css-flex="1"
        css-overflow="hidden"
        css-text-overflow="ellipsis"
        css-white-space="nowrap"
        css-font-size="14"
        css-font-weight="600"
        css-opacity={props.scrolledOut ? '1' : '0'}
        css-transition="opacity-150ms"
      >
        {props.title}
      </Box>
      {props.actions}
    </Box>
  )
}

// A detail that draws its own big title (a spec's header) takes the ref
// from here, so the Back row's compact title still follows it.
const TitleRef = createContext<((node: HTMLElement | null) => void) | null>(null)
export const useDetailTitleRef = () => useContext(TitleRef)

export function DetailPane(props: { backLabel: string; onBack: () => void; title: string; children: ReactNode; actions?: ReactNode; ownTitle?: boolean }) {
  const phone = usePhone()
  const { scrolledOut, titleRef } = useTitleScrolledOut()
  if (!phone) return <>{props.children}</>
  return (
    <div data-detail-pane>
      <DetailBar backLabel={props.backLabel} onBack={props.onBack} title={props.title} scrolledOut={scrolledOut} actions={props.actions} />
      {!props.ownTitle && (
        <Box ref={titleRef} data-detail-title as="h2" css-margin="4px-0-12px" css-font-size="20" css-font-weight="600" css-overflow-wrap="anywhere">
          {props.title}
        </Box>
      )}
      <TitleRef.Provider value={props.ownTitle ? titleRef : null}>{props.children}</TitleRef.Provider>
    </div>
  )
}
