import type { ReactNode } from 'react'
import { blocks, headingId, inline, type Inline } from './markdown.ts'
import { highlight, tokenStyle, type Token } from './highlight.ts'

// Renders plan Markdown as React elements (see markdown.ts): no HTML is set.
function Spans({ parts }: { parts: Inline[] }): ReactNode {
  return parts.map((part, i) => {
    if (part.kind === 'text') return part.text
    if (part.kind === 'code')
      return (
        <code key={i} className="rounded px-1 text-[12px]" style={{ background: 'var(--bg-elevated)' }}>
          {part.text}
        </code>
      )
    if (part.kind === 'strong')
      return (
        <strong key={i}>
          <Spans parts={part.children} />
        </strong>
      )
    if (part.kind === 'em')
      return (
        <em key={i}>
          <Spans parts={part.children} />
        </em>
      )
    return part.href ? (
      <a key={i} href={part.href} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
        <Spans parts={part.children} />
      </a>
    ) : (
      <Spans key={i} parts={part.children} />
    )
  })
}

const Text = ({ text }: { text: string }) => <Spans parts={inline(text)} />

function Tokens({ tokens }: { tokens: Token[] }): ReactNode {
  return tokens.map((token, i) =>
    typeof token === 'string' ? (
      token
    ) : (
      <span key={i} style={tokenStyle(token.types)}>
        <Tokens tokens={token.content} />
      </span>
    ),
  )
}

// A fenced block, highlighted when its language is known, else plain.
function Code({ text, lang, line }: { text: string; lang: string | null; line?: number }) {
  const tokens = highlight(text, lang)
  return (
    <pre
      className="overflow-x-auto rounded border p-2 text-[12px]"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
      data-lang={lang ?? undefined}
      data-line={line}
      data-highlighted={tokens ? 'true' : undefined}
    >
      <code>{tokens ? <Tokens tokens={tokens} /> : text}</code>
    </pre>
  )
}

// `idPrefix` gives each heading an anchor (headingId), for an outline.
// Every block and list item carries `data-line`, its first source line, so
// a reader can scroll to a cited line (DocumentReader.tsx).
// `measure` caps prose at a readable line length; tables and code may use
// the full width.
export function Markdown({ text, idPrefix, measure }: { text: string; idPrefix?: string; measure?: string }) {
  const prose = measure ? { maxWidth: measure } : undefined
  return (
    <div className="flex min-w-0 flex-col gap-2 break-words text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
      {blocks(text).map((block, i) => {
        if (block.kind === 'heading') {
          const size = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-sm'][block.level - 1]
          return (
            <div
              key={i}
              role="heading"
              aria-level={block.level}
              data-line={block.line}
              id={idPrefix ? headingId(idPrefix, block.text, i) : undefined}
              className={`${size} mt-2 font-semibold`}
              style={{ ...prose, scrollMarginTop: 12 }}
            >
              <Text text={block.text} />
            </div>
          )
        }
        if (block.kind === 'paragraph')
          return (
            <p key={i} data-line={block.line} style={prose}>
              <Text text={block.text} />
            </p>
          )
        if (block.kind === 'rule') return <hr key={i} data-line={block.line} style={{ borderColor: 'var(--border)' }} />
        if (block.kind === 'quote')
          return (
            <blockquote key={i} data-line={block.line} className="border-l-2 pl-3 text-muted" style={{ borderColor: 'var(--border)', ...prose }}>
              <Text text={block.text} />
            </blockquote>
          )
        if (block.kind === 'code') return <Code key={i} text={block.text} lang={block.lang} line={block.line} />
        if (block.kind === 'table')
          return (
            <div key={i} data-line={block.line} className="max-w-full overflow-x-auto">
              <table className="border-collapse text-[12px]">
                <thead>
                  <tr>
                    {block.head.map((cell, j) => (
                      <th key={j} className="border px-2 py-1 text-left font-semibold" style={{ borderColor: 'var(--border)' }}>
                        <Text text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {block.head.map((_, j) => (
                        <td key={j} className="border px-2 py-1 align-top" style={{ borderColor: 'var(--border)' }}>
                          <Text text={row[j] ?? ''} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List
            key={i}
            start={block.ordered ? block.start : undefined}
            className={`flex flex-col gap-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            style={prose}
          >
            {block.items.map((item, j) => (
              <li
                key={j}
                data-line={item.line}
                style={{ marginLeft: item.depth * 16, listStyleType: item.checked === null ? undefined : 'none' }}
              >
                {item.checked !== null && (
                  <span aria-label={item.checked ? 'done' : 'not done'} className="mr-1.5">
                    {item.checked ? '☑' : '☐'}
                  </span>
                )}
                <Text text={item.text} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
