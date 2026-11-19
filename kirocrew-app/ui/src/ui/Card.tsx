// Kiro Crew's Card, with Box's look props for its layout (`flex flexCol
// gap="2"`) instead of a className or style from the view.
import type { ReactNode } from 'react'
import { Card as HostCard } from '@kirocrew/app-sdk/ui'
import { lookProps, type LookProps } from './Box'

export function Card(props: { children?: ReactNode } & LookProps) {
  return <HostCard {...lookProps(props)} />
}
