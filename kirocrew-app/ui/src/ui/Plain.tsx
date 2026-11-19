// A native button, link, text field or text area drawn with the same look
// props as Box (box.json), for the controls that are not Kiro Crew's Btn or
// Input: text-styled buttons, row buttons, inline links, raw fields. Each
// takes its element's own props and a ref, and no `className` or `style`.
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { lookProps, type LookProps } from './Box'

// A native prop that shares a look prop's name (an input's `size`) gives way to the look prop.
type Plain<T> = Omit<T, 'className' | 'style' | keyof LookProps> & LookProps

export const PlainButton = forwardRef<HTMLButtonElement, Plain<ButtonHTMLAttributes<HTMLButtonElement>>>(function PlainButton(props, ref) {
  return <button ref={ref} {...lookProps(props)} />
})

export const PlainLink = forwardRef<HTMLAnchorElement, Plain<AnchorHTMLAttributes<HTMLAnchorElement>>>(function PlainLink(props, ref) {
  return <a ref={ref} {...lookProps(props)} />
})

export const PlainInput = forwardRef<HTMLInputElement, Plain<InputHTMLAttributes<HTMLInputElement>>>(function PlainInput(props, ref) {
  return <input ref={ref} {...lookProps(props)} />
})

export const PlainTextarea = forwardRef<HTMLTextAreaElement, Plain<TextareaHTMLAttributes<HTMLTextAreaElement>>>(function PlainTextarea(props, ref) {
  return <textarea ref={ref} {...lookProps(props)} />
})
