// The page's one shelf: a configuration panel that pulls out from the right,
// full width on a phone. It is the shared Modal on its right edge, so it has
// the same focus trap, Esc and Back step, focus return, scroll lock and
// confirm-before-losing-edits. Use it for settings and forms; a confirmation
// stays a Modal.
import type { ComponentProps } from 'react'
import { Modal } from './Modal.tsx'

export function Shelf(props: Omit<ComponentProps<typeof Modal>, 'side'>) {
  return <Modal {...props} side="right" />
}
