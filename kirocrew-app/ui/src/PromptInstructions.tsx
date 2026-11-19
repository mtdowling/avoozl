// A built-in agent prompt shown read-only, folded, with Copy, and below it
// the owner's own instructions, which Avoozl adds after the built-in prompt.
// One part for every agent whose prompt the owner may extend.
import { useState } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { Fold, IconLabel } from './ui/controls.tsx'
import { Marker } from './SettingsView.tsx'
import { Check, Copy } from './icons.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainTextarea } from './ui/Plain'

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
    <Box css-max-width="44rem" flex minW0 flexCol gap="2" size="sm" data-prompt-instructions={props.id}>
      <Fold id={`${props.id}-builtin`} title={`Built-in ${props.agent} prompt (read-only)`}>
        {props.builtIn ? (
          <Box flex flexCol gap="2" pb="2">
            <Box
              as="pre"
              css-border-color="border"
              css-color="text"
              css-background="card-transparent"
              css-white-space="pre-wrap"
              css-overflow-wrap="anywhere"
              css-max-height="16rem"
              css-overflow-y="auto"
              rounded="base"
              border="all"
              p="2"
              size="xs"
            >
              {props.builtIn}
            </Box>
            <div>
              <IconLabel icon={copied ? Check : Copy} tooltip="Copy the built-in prompt" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </IconLabel>
            </div>
          </Box>
        ) : (
          <Box as="p" pb="2" size="xs" tone="muted">
            The built-in prompt could not be read.
          </Box>
        )}
      </Fold>
      <Box htmlFor={props.id} as="label" css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-column-gap="8" flex flexWrap items="baseline" gapX="2">
        <Box as="span" weight="medium">
          Your instructions
        </Box>
        <Marker rule={{ required: false }} />
      </Box>
      <Hint size="xs">Added after the built-in prompt.</Hint>
      <PlainTextarea
        id={props.id}
        rows={3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        css-border-color="border"
        css-color="text"
        css-background="card-transparent"
        rounded="base"
        border="all"
        px="2"
        py="1"
        size="sm"
      />
      {props.note && <Hint size="xs">{props.note}</Hint>}
      <Tooltip text=".avoozl.json key">
        <Box as="code" css-overflow-wrap="anywhere" css-opacity="0.8" size="11" tone="muted">
          {props.raw}
        </Box>
      </Tooltip>
    </Box>
  )
}
