// Kiro Crew's Input, with Box's look props in place of a className or style
// from the view. A native prop that shares a look prop's name (`size`) gives
// way to the look prop.
import { forwardRef, type ComponentProps } from 'react'
import { Input as HostInput } from '@kirocrew/app-sdk/ui'
import { lookProps, type LookProps } from './Box'

export type InputProps = Omit<ComponentProps<typeof HostInput>, 'className' | 'style' | 'ref' | keyof LookProps> & LookProps

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  return <HostInput ref={ref} {...lookProps(props)} />
})
