// Kiro Crew's Btn, with Box's look props in place of a className or style
// from the view.
import { forwardRef, type ComponentProps } from 'react'
import { Btn as HostBtn } from '@kirocrew/app-sdk/ui'
import { lookProps, type LookProps } from './Box'

export type BtnProps = Omit<ComponentProps<typeof HostBtn>, 'className' | 'style' | 'ref' | keyof LookProps> & LookProps

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(props, ref) {
  return <HostBtn ref={ref} {...lookProps(props)} />
})
