// A unified diff, each line colored: added, removed, hunk header or context.
import { Box } from './ui/Box'
import { TONE } from './ui/tones.ts'

// A unified diff as lines to color: added, removed, hunk header or context.
export function diffLines(diff: string | undefined): { kind: 'add' | 'del' | 'hunk' | 'same'; text: string }[] {
  if (!diff) return []
  return diff.split('\n').map((text) => ({
    kind: text.startsWith('@@') ? 'hunk' : text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : 'same',
    text,
  }))
}

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
