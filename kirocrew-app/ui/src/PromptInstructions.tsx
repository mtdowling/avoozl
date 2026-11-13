// A built-in agent prompt shown read-only, folded, with Copy, and below it
// the owner's own instructions, which Avoozl adds after the built-in prompt.
// One part for every agent whose prompt the owner may extend: the retro now,
// the model router's instructions next.
import { useState } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { Fold, IconLabel } from './controls.tsx'
import { Marker } from './SettingsView.tsx'
import { Check, Copy } from './icons.ts'

const boxStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

export default function PromptInstructions(props: {
  id: string
  agent: string
  builtIn: string | null
  value: string
  onChange: (value: string) => void
  raw: string
  placeholder?: string
  note?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!props.builtIn) return
    try {
      await navigator.clipboard.writeText(props.builtIn)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm" style={{ maxWidth: '44rem' }} data-prompt-instructions={props.id}>
      <Fold id={`${props.id}-builtin`} title={`Built-in ${props.agent} prompt (read-only)`}>
        {props.builtIn ? (
          <div className="flex flex-col gap-2 pb-2">
            <pre className="rounded border p-2 text-xs" style={{ ...boxStyle, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '16rem', overflowY: 'auto' }}>
              {props.builtIn}
            </pre>
            <div>
              <IconLabel icon={copied ? Check : Copy} tooltip="Copy the built-in prompt" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </IconLabel>
            </div>
          </div>
        ) : (
          <p className="pb-2 text-xs text-muted">The built-in prompt could not be read.</p>
        )}
      </Fold>
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">Your instructions</span>
        <Marker rule={{ required: false }} />
      </label>
      <span className="text-xs text-muted">Added after the built-in prompt.</span>
      <textarea
        id={props.id}
        rows={3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded border px-2 py-1 text-sm"
        style={boxStyle}
      />
      {props.note && <span className="text-xs text-muted">{props.note}</span>}
      <Tooltip text=".avoozl.json key">
        <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
          {props.raw}
        </code>
      </Tooltip>
    </div>
  )
}
