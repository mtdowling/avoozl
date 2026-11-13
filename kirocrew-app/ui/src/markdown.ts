// A small Markdown reader for plan documents: headings, paragraphs, bullet,
// numbered and checkbox lists (nested by indent), tables, fenced code, quotes,
// rules, and inline code, bold, italics and links. It returns plain data the
// page turns into React elements, and never HTML, so document text cannot
// inject markup and nothing needs sanitizing. Links keep only http(s) URLs.
// Kept free of JSX so node can test it directly.
import { safeHref } from './views-api.ts'

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string | null; children: Inline[] }

export interface ListItem {
  text: string
  // null for a plain item; true or false for a `- [x]` / `- [ ]` checkbox.
  checked: boolean | null
  depth: number
  // The item's 1-based line in the source.
  line: number
}

// `line` is the block's first 1-based source line, so a reader can scroll
// to a cited line.
export type Block = (
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; head: string[]; rows: string[][] }
) & { line: number }

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g

export function inline(text: string): Inline[] {
  const out: Inline[] = []
  const re = new RegExp(INLINE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    if (m[1]) out.push({ kind: 'code', text: m[1].slice(1, -1) })
    else if (m[2]) out.push({ kind: 'strong', children: inline(m[2].slice(2, -2)) })
    else if (m[3]) out.push({ kind: 'em', children: inline(m[3].slice(1, -1)) })
    else out.push({ kind: 'link', href: safeHref(m[6]), children: inline(m[5]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/

export function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let paragraph: string[] = []
  let paragraphLine = 1
  const flush = () => {
    if (paragraph.length) out.push({ kind: 'paragraph', text: paragraph.join(' '), line: paragraphLine })
    paragraph = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(line)
    if (fence) {
      flush()
      const at = i + 1
      const code: string[] = []
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i])
      out.push({ kind: 'code', text: code.join('\n'), lang: fence[2] || null, line: at })
      continue
    }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      flush()
      const start = i + 1
      const head = cells(line)
      const rows: string[][] = []
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) rows.push(cells(lines[i]))
      i--
      out.push({ kind: 'table', head, rows, line: start })
      continue
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      out.push({ kind: 'heading', level: heading[1].length, text: heading[2], line: i + 1 })
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push({ kind: 'rule', line: i + 1 })
      continue
    }
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      flush()
      const previous = out[out.length - 1]
      if (previous?.kind === 'quote') previous.text += ' ' + quote[1]
      else out.push({ kind: 'quote', text: quote[1], line: i + 1 })
      continue
    }
    const item = ITEM.exec(line)
    if (item) {
      flush()
      const ordered = /\d/.test(item[2])
      const entry: ListItem = {
        text: item[4],
        checked: item[3] === undefined ? null : item[3] !== ' ',
        depth: Math.floor(item[1].replace(/\t/g, '  ').length / 2),
        line: i + 1,
      }
      const previous = out[out.length - 1]
      if (previous?.kind === 'list' && (previous.ordered === ordered || entry.depth > 0)) previous.items.push(entry)
      else out.push({ kind: 'list', ordered, start: ordered ? Number.parseInt(item[2], 10) : 1, items: [entry], line: i + 1 })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const previous = out[out.length - 1]
    if (!paragraph.length && previous?.kind === 'list' && /^\s+/.test(line)) {
      previous.items[previous.items.length - 1].text += ' ' + line.trim()
      continue
    }
    if (!paragraph.length) paragraphLine = i + 1
    paragraph.push(line.trim())
  }
  flush()
  return out
}

// A heading's anchor id inside one document: the prefix, then a slug of its
// text, then its index so repeated headings stay apart.
export const headingId = (prefix: string, text: string, index: number) =>
  `${prefix}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section'}-${index}`

// The headings of a document, for the plan view's outline. `index` is the
// block index Markdown.tsx gives the same heading.
export function outline(source: string, prefix: string, maxLevel = 3): { level: number; text: string; id: string }[] {
  return blocks(source).flatMap((block, i) =>
    block.kind === 'heading' && block.level <= maxLevel
      ? [{ level: block.level, text: block.text.replace(/[*_`]/g, ''), id: headingId(prefix, block.text, i) }]
      : [],
  )
}
