// A native button, link, text field or text area drawn with the same look
// props as Box (box.json), for the controls that are not Kiro Crew's Btn or
// Input: text-styled buttons, row buttons, inline links, raw fields. Each
// takes its element's own props and a ref, and no `className` or `style`.
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ImgHTMLAttributes,
  type InputHTMLAttributes,
  type SVGProps,
  type VideoHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
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

// SVG shapes with the same look props, for the graphs and charts.
type Svg<T extends SVGElement> = Omit<SVGProps<T>, 'className' | 'style' | 'ref' | keyof LookProps> & LookProps

export const SvgRoot = forwardRef<SVGSVGElement, Svg<SVGSVGElement>>(function SvgRoot(props, ref) {
  return <svg ref={ref} {...lookProps(props)} />
})
export const SvgG = forwardRef<SVGGElement, Svg<SVGGElement>>(function SvgG(props, ref) {
  return <g ref={ref} {...lookProps(props)} />
})
export const SvgPath = forwardRef<SVGPathElement, Svg<SVGPathElement>>(function SvgPath(props, ref) {
  return <path ref={ref} {...lookProps(props)} />
})
export const SvgRect = forwardRef<SVGRectElement, Svg<SVGRectElement>>(function SvgRect(props, ref) {
  return <rect ref={ref} {...lookProps(props)} />
})
export const SvgText = forwardRef<SVGTextElement, Svg<SVGTextElement>>(function SvgText(props, ref) {
  return <text ref={ref} {...lookProps(props)} />
})

// An image or a video with the look props.
export const PlainImg = forwardRef<HTMLImageElement, Plain<ImgHTMLAttributes<HTMLImageElement>>>(function PlainImg(props, ref) {
  return <img ref={ref} {...lookProps(props)} />
})
export const PlainVideo = forwardRef<HTMLVideoElement, Plain<VideoHTMLAttributes<HTMLVideoElement>>>(function PlainVideo(props, ref) {
  return <video ref={ref} {...lookProps(props)} />
})
