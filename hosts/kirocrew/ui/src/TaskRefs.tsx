// A task's requirement and design refs as small chips (Requirement 115.5,
// design §4.43). A chip opens its file's tab at the ref's line; a ref that
// names nothing (a draft lint refuses) is a chip that does nothing.
import type { TaskRef } from './views-api.ts'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'
import { Tooltip } from './ui/Tooltip.tsx'

const KIND = { requirement: 'Requirement', design: 'Design' } as const

export function TaskRefs(props: { refs?: TaskRef[] | null; onOpen?: (ref: TaskRef) => void }) {
  const refs = props.refs ?? []
  if (!refs.length) return null
  return (
    <Box as="span" data-task-refs flex items="center" gap="1" css-flex="0-1-auto" css-min-width="0" css-max-width="50%" css-overflow="hidden" size="xs">
      {refs.map((ref) => (
        <Tooltip key={`${ref.kind}:${ref.ref}`} text={`${KIND[ref.kind]} ${ref.ref} in ${ref.file}`}>
          <PlainButton
            type="button"
            data-task-ref={ref.ref}
            data-ref-kind={ref.kind}
            disabled={!props.onOpen || ref.line === null}
            onClick={() => props.onOpen?.(ref)}
            css-flex="0-0-auto"
            css-padding="0-6px"
            css-border="1px-solid-border"
            css-border-radius="999"
            css-color={ref.kind === 'design' ? 'muted' : 'text'}
            css-line-height="16px"
            css-white-space="nowrap"
            hoverUnderline
          >
            {ref.ref}
          </PlainButton>
        </Tooltip>
      ))}
    </Box>
  )
}

// Scroll a rendered spec file to the block at or above `line`: the last
// block the renderer marked (data-source-line) that starts there or before.
// Returns false while the file is not drawn yet.
export function jumpToLine(file: string, line: number): boolean {
  const card = document.getElementById(`avoozl-doc-${file}`)
  if (!card) return false
  let best: Element | null = null
  let at = 0
  for (const el of card.querySelectorAll('[data-source-line]')) {
    const start = Number(el.getAttribute('data-source-line'))
    if (start <= line && start >= at) {
      best = el
      at = start
    }
  }
  if (!best) return false
  for (const old of document.querySelectorAll('[data-ref-target]')) old.removeAttribute('data-ref-target')
  best.setAttribute('data-ref-target', '')
  best.scrollIntoView?.({ block: 'start' })
  return true
}
