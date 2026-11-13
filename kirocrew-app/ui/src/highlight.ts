// Syntax highlighting for code fences in plan documents, with Prism's
// tokenizer (MIT, bundled; see THIRD_PARTY_NOTICES.md). Prism only splits
// the text into tokens here; Markdown.tsx turns them into React spans, so no
// HTML is ever set. Colors are theme variables, so light and dark both work.
//
// Extra languages come from the workspace: `.avoozl.json`
// `highlight.languages` maps a fence name to a JSON grammar file in the
// workspace (read by the `highlight.languages` operation). A grammar is data,
// never code: an ordered list of `{ "type", "pattern", "flags"? }`, where
// `type` is one of TOKEN_TYPES and `pattern` a regular expression source.
// A fence with no known grammar renders plain.
// Kept free of JSX so node can test it directly.
import { prism, type Grammar, type PrismToken } from './prism/languages.ts'

export const TOKEN_TYPES = [
  'comment',
  'string',
  'keyword',
  'number',
  'boolean',
  'constant',
  'function',
  'class-name',
  'builtin',
  'type',
  'operator',
  'punctuation',
  'property',
  'variable',
  'regex',
  'attribute',
  'tag',
] as const

// Longer blocks render plain: a grammar runs in the page's own thread.
export const MAX_HIGHLIGHT = 20000

export interface CustomGrammar {
  tokens: { type: string; pattern: string; flags?: string }[]
}

// Fence names map to Prism's names; anything else is looked up as given.
const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  rs: 'rust',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
  'c++': 'cpp',
  golang: 'go',
}

const custom = new Map<string, Grammar>()

// A JSON grammar as a Prism grammar. Unknown types fall back to plain text
// (the token is kept, so later patterns cannot split it); a pattern that is
// not a valid regular expression drops the whole grammar.
export function toGrammar(def: CustomGrammar): Grammar | null {
  if (!def || !Array.isArray(def.tokens)) return null
  const grammar: Grammar = {}
  try {
    def.tokens.forEach((token, i) => {
      const type = (TOKEN_TYPES as readonly string[]).includes(token.type) ? token.type : 'plain'
      const flags = [...new Set(String(token.flags ?? '').replace(/[^imsu]/g, ''))].join('')
      grammar[`t${i}`] = { pattern: new RegExp(String(token.pattern), flags), greedy: true, alias: type }
    })
  } catch {
    return null
  }
  return grammar
}

// Register the workspace's grammars; returns the names that loaded.
export function registerLanguages(languages: Record<string, CustomGrammar>): string[] {
  custom.clear()
  for (const [name, def] of Object.entries(languages ?? {})) {
    const grammar = toGrammar(def)
    if (grammar) custom.set(name.toLowerCase(), grammar)
  }
  return [...custom.keys()]
}

export function grammarFor(lang: string | null): Grammar | null {
  if (!lang) return null
  const name = lang.toLowerCase()
  return custom.get(name) ?? prism.languages[ALIASES[name] ?? name] ?? null
}

export type Token = string | { types: string[]; content: Token[] }

const flatten = (part: string | PrismToken | (string | PrismToken)[]): Token[] =>
  Array.isArray(part)
    ? part.flatMap(flatten)
    : typeof part === 'string'
      ? [part]
      : [{ types: [part.type, ...[part.alias ?? []].flat()], content: flatten(part.content) }]

// The tokens of one code block, or null to render it plain.
export function highlight(text: string, lang: string | null): Token[] | null {
  const grammar = grammarFor(lang)
  if (!grammar || text.length > MAX_HIGHLIGHT) return null
  try {
    return flatten(prism.tokenize(text, grammar))
  } catch {
    return null
  }
}

// A token's color: theme variables only, never the warning yellow.
const COLORS: Record<string, string> = {
  comment: 'var(--muted)',
  string: 'var(--tile-green, var(--ok))',
  char: 'var(--tile-green, var(--ok))',
  'attr-value': 'var(--tile-green, var(--ok))',
  keyword: 'var(--tile-purple, var(--aim))',
  atrule: 'var(--tile-purple, var(--aim))',
  important: 'var(--tile-purple, var(--aim))',
  number: 'var(--tile-orange, var(--accent))',
  boolean: 'var(--tile-orange, var(--accent))',
  constant: 'var(--tile-orange, var(--accent))',
  function: 'var(--tile-blue, var(--accent))',
  'class-name': 'var(--tile-teal, var(--accent))',
  builtin: 'var(--tile-teal, var(--accent))',
  type: 'var(--tile-teal, var(--accent))',
  property: 'var(--tile-indigo, var(--accent))',
  'attr-name': 'var(--tile-indigo, var(--accent))',
  attribute: 'var(--tile-indigo, var(--accent))',
  tag: 'var(--tile-red, var(--danger))',
  variable: 'var(--tile-pink, var(--accent))',
  regex: 'var(--tile-pink, var(--accent))',
  inserted: 'var(--tile-green, var(--ok))',
  deleted: 'var(--tile-red, var(--danger))',
}

export function tokenStyle(types: string[]): { color?: string; fontStyle?: string } {
  const type = [...types].reverse().find((t) => COLORS[t]) ?? types.find((t) => COLORS[t])
  return {
    ...(type ? { color: COLORS[type] } : {}),
    ...(types.includes('comment') ? { fontStyle: 'italic' } : {}),
  }
}
