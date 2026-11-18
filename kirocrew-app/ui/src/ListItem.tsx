// One item of a list: a title line with its icon actions on the right, then
// compact muted facts under it as `label: value` pairs that wrap in a grid
// (one column on a phone, two or three on a wide page). Items are separated
// by a top border only, no boxes. A fact with no value is not rendered.
// Used by Repository setup and Settings > Workspaces.
import type { ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { Box } from './ui/Box'

export interface ListFact {
  label: string
  // Text, or chips for a set of labels.
  value?: string | null
  chips?: string[]
  // Paths and branches: monospace.
  mono?: boolean
  // A long value is cut with an ellipsis and shown whole in a tooltip.
  truncate?: boolean
}

const hasValue = (fact: ListFact) => Boolean(fact.value?.trim()) || Boolean(fact.chips?.length)

function Value({ fact }: { fact: ListFact }) {
  if (fact.chips?.length)
    return (
      <Box as="span" flex minW0 flexWrap gap="1" data-chips>
        {fact.chips.map((chip) => (
          <Box key={chip} as="span" css-border-color="border" css-color="text" rounded="base" border="all" px="1.5" size="xs" data-chip>
            {chip}
          </Box>
        ))}
      </Box>
    )
  const text = fact.value ?? ''
  const cell = (
    <span className={`block min-w-0 ${fact.mono ? 'font-mono' : ''} ${fact.truncate ? 'truncate' : ''}`} style={{ color: 'var(--text)', ...(fact.truncate ? {} : { overflowWrap: 'anywhere' }) }}>
      {text}
    </span>
  )
  return fact.truncate ? (
    <Tooltip text={text} display="block">
      {cell}
    </Tooltip>
  ) : (
    cell
  )
}

export default function ListItem(props: { title: ReactNode; actions?: ReactNode; facts: ListFact[]; className?: string; attrs?: Record<string, string | boolean> }) {
  const facts = props.facts.filter(hasValue)
  return (
    <li className={`flex min-w-0 flex-col gap-1 border-t py-2.5 first:border-t-0 ${props.className ?? ''}`} style={{ borderColor: 'var(--border)' }} data-list-item {...props.attrs}>
      <Box flex flexWrap items="center" gapX="3" gapY="1">
        <Box as="span" css-flex="1-1-12rem" flex minW0 flexWrap items="center" gapX="2" gapY="1" data-list-title>
          {props.title}
        </Box>
        {props.actions && <Box as="span" flex items="center" gap="1.5">{props.actions}</Box>}
      </Box>
      {facts.length > 0 && (
        <Box as="dl" css-grid-template-columns="repeat-auto-fill-minmax-min-100%-15rem-1fr" m0 grid gapX="4" gapY="0.5" size="xs" tone="muted" data-list-facts>
          {facts.map((fact) => (
            <Box key={fact.label} flex minW0 items="baseline" gap="1.5" data-fact={fact.label}>
              <Box as="dt" shrink0>{fact.label}:</Box>
              <Box as="dd" m0 minW0 flex1>
                <Value fact={fact} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </li>
  )
}
