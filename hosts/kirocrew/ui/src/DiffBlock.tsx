// A unified diff, each line colored: added, removed, hunk header or context.
import { diffLines } from './flow-api.ts'
import { Box } from './ui/Box'
import { TONE } from './ui/tones.ts'

const LINE = { add: TONE.successOrGreen, del: TONE.danger, hunk: TONE.muted, same: TONE.text } as const

export function DiffBlock({ diff, label }: { diff: string | undefined; label: string }) {
  const lines = diffLines(diff)
  if (!lines.length) return null
  return (
    <Box
      aria-label={label}
      as="pre"
      css-border-color="border"
      css-white-space="pre-wrap"
      css-overflow-wrap="anywhere"
      css-margin="0"
      maxH64
      overflow="auto"
      rounded="base"
      border="all"
      p="2"
      size="xs"
      data-diff
    >
      {lines.map((line, i) => (
        <Box key={i} as="span" css-display="block" css-color={LINE[line.kind]}>
          {line.text || ' '}
        </Box>
      ))}
    </Box>
  )
}
