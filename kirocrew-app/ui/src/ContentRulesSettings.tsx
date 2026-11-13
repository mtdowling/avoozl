import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Input, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import {
  BOUNDARIES,
  BOUNDARY_HINTS,
  BOUNDARY_LABELS,
  BUILTIN_INFO,
  builtinName,
  builtinUsed,
  contentClient,
  emptySetForm,
  entryOf,
  escapeTerm,
  fileErrors,
  highlightPieces,
  kindOf,
  nextRuleName,
  parseTermLines,
  allowCount,
  rowError,
  ruleCount,
  ruleNames,
  scopeLabel,
  serializeTerms,
  setEntry,
  setFormOf,
  sourceLabel,
  tryMatches,
  type ContentRules,
  type ContentRuleSet,
  type SetForm,
  type TermRow,
  type TermsFile,
} from './content-api.ts'
import { ChoiceCards, DangerBtn, IconBtn, IconLabel, ICON } from './controls.tsx'
import { BookOpen, Ban, Eye, Lock, Plus, ShieldCheck, Trash2, X } from './icons.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { useMedia } from './TaskDrawer.tsx'

type Client = ReturnType<typeof contentClient>
type Selection = { kind: 'set' | 'builtin'; id: string } | { kind: 'new' }

const HELP_ID = 'avoozl-content-help'

// Open the How rules work section and bring it into view.
function openHelp() {
  const help = document.getElementById(HELP_ID) as HTMLDetailsElement | null
  if (!help) return
  help.open = true
  help.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function HelpLink({ children = 'How rules work' }: { children?: ReactNode }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={openHelp} data-help-link>
      <BookOpen size={12} aria-hidden="true" />
      {children}
    </button>
  )
}

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))',
}

// ---------------------------------------------------------------------------
// The left panel: your sets, then the built-in ones.

function SetRow(props: { selected: boolean; onClick: () => void; title: string; raw?: string; locked?: boolean; note?: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={props.onClick}
        aria-current={props.selected ? 'true' : undefined}
        className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left"
        style={{
          background: props.selected ? 'var(--card, var(--bg))' : 'transparent',
          border: `1px solid ${props.selected ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <span className="flex w-full items-center gap-1.5 text-sm font-medium">
          {props.locked && <Lock size={12} aria-label="Built in" style={{ color: 'var(--muted)', flexShrink: 0 }} />}
          <span className="truncate">{props.title}</span>
          {props.note && <span className="ml-auto shrink-0">{props.note}</span>}
        </span>
        {props.raw && <code className="text-[11px] text-muted">{props.raw}</code>}
      </button>
    </li>
  )
}

function SetList(props: { value: ContentRules | null; selection: Selection | null; onSelect: (s: Selection) => void }) {
  const { value, selection } = props
  const is = (kind: string, id: string) => selection?.kind === kind && 'id' in selection && selection.id === id
  // The panel's main action, styled like Add plugin and Add repository.
  const add = (
    <IconLabel icon={Plus} primary onClick={() => props.onSelect({ kind: 'new' })} tooltip="Make a set of your own words to block or report">
      Add rule set
    </IconLabel>
  )
  return (
    <nav aria-label="Rule sets" className="flex flex-col gap-3 p-3" style={panelStyle} data-rule-panel>
      <div className="flex flex-col items-start gap-2">
        <h3 className="text-sm font-semibold">Your rule sets</h3>
        {!(value && !value.sets.length) && add}
      </div>
      {value && !value.sets.length ? (
        <div className="flex flex-col items-start gap-1.5 text-xs" data-rule-empty>
          <p>No rule sets yet. Only the built-in sets run.</p>
          <p className="text-muted">Choose Add rule set to block your own words, like a project code name.</p>
          {add}
          <span>
            <HelpLink />
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {value?.sets.map((set) => (
            <SetRow
              key={set.id}
              title={set.id}
              selected={is('set', set.id)}
              onClick={() => props.onSelect({ kind: 'set', id: set.id })}
              note={
                set.available ? (
                  <span className="text-[11px] text-muted">{set.action === 'report' ? 'Reports' : 'Blocks'}</span>
                ) : (
                  <Badge variant="warning">Unavailable</Badge>
                )
              }
            />
          ))}
        </ul>
      )}
      <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold">Built in</h3>
        <p className="text-xs text-muted">Always on. Settings can’t change them.</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {value?.builtins.map((set) => (
            <SetRow
              key={set.id}
              locked
              title={builtinName(set.id)}
              raw={set.id}
              selected={is('builtin', set.id)}
              onClick={() => props.onSelect({ kind: 'builtin', id: set.id })}
              note={builtinUsed(set.id, value?.mode) ? null : <span className="text-[11px] text-muted">not used</span>}
            />
          ))}
        </ul>
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Details on the right.

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'minmax(7rem, auto) 1fr' }}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function BuiltinDetails({ id, appliesAt, mode }: { id: string; appliesAt: string; mode: string | null | undefined }) {
  const info = BUILTIN_INFO[id]
  const used = builtinUsed(id, mode)
  return (
    <div className="flex flex-col gap-3" data-rule-details={id}>
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Lock size={ICON} aria-hidden="true" style={{ color: 'var(--muted)' }} />
          {builtinName(id)}
          {used ? <Badge>Always on</Badge> : <Badge>Not used</Badge>}
        </h3>
        <code className="text-[11px] text-muted">{id}</code>
      </div>
      {!used && <p className="text-sm text-muted">Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode.</p>}
      <Facts
        rows={[
          ['What it protects', info?.protects ?? 'A check Avoozl runs on its own writes.'],
          ['Where it checks', info?.where ?? appliesAt],
          [
            'It blocks',
            info ? (
              <span className="flex flex-col gap-1">
                <code className="w-fit rounded border px-1.5 py-0.5 text-xs" style={{ borderColor: 'var(--border)' }}>
                  {info.example}
                </code>
                <span className="text-xs text-muted">A made-up example.</span>
              </span>
            ) : (
              '—'
            ),
          ],
        ]}
      />
    </div>
  )
}

function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm" style={{ opacity: props.disabled ? 0.6 : 1 }}>
      <input type="checkbox" className="mt-1" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        {props.label}
        {props.hint && <span className="block text-xs text-muted">{props.hint}</span>}
      </span>
    </label>
  )
}

const toggle = (list: string[], item: string, on: boolean) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item))

// One set's settings, saved into .avoozl.json.
function SetFormView(props: {
  form: SetForm
  set: (patch: Partial<SetForm>) => void
  isNew: boolean
  choices: { repositories: string[]; plugins: string[] }
}) {
  const { form, set, choices } = props
  return (
    <div className="flex flex-col gap-3" data-set-form>
      <label className="flex flex-col gap-1 text-sm" style={{ maxWidth: '22rem' }}>
        <span>
          Name <span className="text-xs text-muted">(required)</span>
        </span>
        <Input value={form.id} disabled={!props.isNew} placeholder="company-terms" onChange={(e: { target: { value: string } }) => set({ id: e.target.value })} />
        <span className="text-xs text-muted">
          {props.isNew ? 'Lowercase letters, digits, dots and dashes. It also names the terms file.' : 'The name is the terms file’s name, so it stays.'}
        </span>
        <code className="text-[11px] text-muted">id</code>
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm">
          When a rule matches <code className="ml-1 text-[11px] text-muted">action</code>
        </legend>
        <ChoiceCards
          id="avoozl-set-action"
          label="When a rule matches"
          value={form.action}
          onChange={(action) => set({ action })}
          cards={[
            { key: 'block', icon: Ban, title: 'Block', line: 'Nothing is written. You decide in Conflicts, and can allow it once.', when: 'the words must never leave this machine.' },
            { key: 'report', icon: Eye, title: 'Report', line: 'The write goes through. The match is listed in Delivery with one notice.', when: 'you are trying a new set out.' },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm">
          Where it checks <code className="ml-1 text-[11px] text-muted">boundaries</code>
        </legend>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}>
          {BOUNDARIES.map((b) => (
            <Check key={b} label={BOUNDARY_LABELS[b]} hint={BOUNDARY_HINTS[b]} checked={form.boundaries.includes(b)} onChange={(on) => set({ boundaries: toggle(form.boundaries, b, on) })} />
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm">
          Repositories <span className="text-xs text-muted">(optional)</span> <code className="ml-1 text-[11px] text-muted">repositories</code>
        </legend>
        {choices.repositories.length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {choices.repositories.map((r) => (
              <Check key={r} label={r} checked={form.repositories.includes(r)} onChange={(on) => set({ repositories: toggle(form.repositories, r, on) })} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No repositories are registered yet. Add them under Repositories.</p>
        )}
        <span className="text-xs text-muted">None checked: every repository.</span>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm" style={{ maxWidth: '22rem' }}>
        <span>
          Rules plugin <span className="text-xs text-muted">(optional)</span>
        </span>
        <select
          value={form.plugin}
          onChange={(e) => set({ plugin: e.target.value })}
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }}
        >
          <option value="">None: use a terms file on this machine</option>
          {choices.plugins.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">A plugin of kind rules, approved under Plugins, can supply this set instead.</span>
        <code className="text-[11px] text-muted">plugin</code>
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The terms editor: Rule builder and File view over one text.

// Native fields: the host Input fills its row, and a rule row needs three
// fields side by side.
const fieldStyle = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--card, var(--bg))',
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: 13,
  minWidth: 0,
  width: '100%',
}
const mono = { fontFamily: 'var(--mono, monospace)' }
const rowGrid = { display: 'grid', gridTemplateColumns: 'minmax(6rem, 9rem) minmax(8rem, 10rem) minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }
const rowGridNarrow = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 6, alignItems: 'center' }

// The kind picker: a rule (word or pattern) or an Allow row (word or pattern).
type RowKind = 'word' | 'pattern' | 'allow-word' | 'allow-pattern'

function RuleRow(props: { row: TermRow; rows: TermRow[]; index: number; narrow: boolean; onChange: (row: TermRow) => void; onRemove: () => void }) {
  const { row, index } = props
  const error = rowError(row, props.rows)
  const errorId = `avoozl-term-error-${index}`
  const grid = props.narrow ? rowGridNarrow : rowGrid
  if (row.kind === 'blank') return null
  if (row.kind === 'note' || row.kind === 'raw')
    return (
      <li className="flex flex-col gap-1" data-term-row={index + 1}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
          <span className="text-xs text-muted" style={{ width: '4.5rem' }}>
            {row.kind === 'note' ? 'Note' : `Line ${index + 1}`}
          </span>
          <input
            value={row.text}
            aria-label={row.kind === 'note' ? `Note on line ${index + 1}` : `Line ${index + 1}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => props.onChange({ kind: row.kind, text: e.target.value } as TermRow)}
            style={{ ...fieldStyle, ...(row.kind === 'raw' ? mono : { color: 'var(--muted)' }) }}
          />
          <IconBtn icon={X} label={`Drop line ${index + 1}`} onClick={props.onRemove} />
        </div>
        {error && (
          <span id={errorId} className="text-xs text-danger">
            Line {index + 1}: {error}
          </span>
        )}
      </li>
    )
  const allow = row.kind === 'allow'
  const match = allow ? row.match : row.kind
  const current: RowKind = allow ? `allow-${row.match}` : row.kind
  // Moves the value between word and pattern so it keeps meaning the same text.
  const convert = (from: 'word' | 'pattern', to: 'word' | 'pattern', value: string) =>
    from === to ? value : to === 'pattern' ? escapeTerm(value) : kindOf(value).kind === 'word' ? kindOf(value).value : value
  const switchKind = (next: RowKind) => {
    if (next === current) return
    const nextMatch = next.endsWith('pattern') ? 'pattern' : 'word'
    const value = convert(match, nextMatch, row.value)
    if (next.startsWith('allow')) props.onChange({ kind: 'allow', rule: allow ? row.rule : '', match: nextMatch, value })
    else props.onChange({ kind: nextMatch, name: allow ? nextRuleName(props.rows) : row.name, value })
  }
  const names = ruleNames(props.rows)
  const name = allow ? (
    <select value={row.rule} aria-label={`Rule allowed on line ${index + 1}`} onChange={(e) => props.onChange({ ...row, rule: e.target.value })} style={fieldStyle}>
      <option value="">Every rule</option>
      {[...new Set([...names, ...(row.rule ? [row.rule] : [])])].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  ) : (
    <input value={row.name} aria-label={`Rule name on line ${index + 1}`} placeholder="rule-name" onChange={(e) => props.onChange({ ...row, name: e.target.value })} style={fieldStyle} />
  )
  const kind = (
    <select value={current} aria-label={`Kind on line ${index + 1}`} onChange={(e) => switchKind(e.target.value as RowKind)} style={fieldStyle}>
      <option value="word">Word or phrase</option>
      <option value="pattern">Pattern</option>
      <option value="allow-word">Allow word</option>
      <option value="allow-pattern">Allow pattern</option>
    </select>
  )
  const value = (
    <input
      value={row.value}
      aria-label={`${allow ? 'Allowed ' : ''}${match === 'word' ? 'word or phrase' : 'pattern'} on line ${index + 1}`}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errorId : undefined}
      placeholder={allow ? (match === 'word' ? 'zebra falcon app' : String.raw`\bacme-0000\b`) : match === 'word' ? 'zebra falcon' : String.raw`\bacme-\d{4}\b`}
      onChange={(e) => props.onChange({ ...row, value: e.target.value })}
      style={{ ...fieldStyle, ...(match === 'pattern' ? mono : {}), ...(error ? { borderColor: 'var(--danger)' } : {}), ...(props.narrow ? { gridColumn: '1 / 3' } : {}) }}
    />
  )
  const drop = <IconBtn icon={X} label={allow ? `Drop allow line ${index + 1}` : `Drop rule ${row.name || index + 1}`} onClick={props.onRemove} />
  return (
    <li className="flex flex-col gap-1" data-term-row={index + 1}>
      {props.narrow ? (
        <div style={grid}>
          {name}
          {kind}
          <span />
          {value}
          {drop}
        </div>
      ) : (
        <div style={grid}>
          {name}
          {kind}
          {value}
          {drop}
        </div>
      )}
      {error && (
        <span id={errorId} className="text-xs text-danger" role="alert">
          Line {index + 1}: {error}
        </span>
      )}
    </li>
  )
}

function FileView(props: { text: string; onChange: (text: string) => void }) {
  const gutter = useRef<HTMLDivElement>(null)
  const errors = useMemo(() => fileErrors(props.text), [props.text])
  const bad = new Set(errors.map((e) => e.line))
  const count = Math.max(1, props.text.replace(/\n$/, '').split('\n').length)
  const lineStyle = { fontFamily: 'var(--mono, monospace)', fontSize: 12, lineHeight: '18px' }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex overflow-hidden rounded border" style={{ borderColor: 'var(--border)', height: 220 }}>
        <div ref={gutter} aria-hidden="true" className="select-none overflow-hidden px-2 py-1.5 text-right" style={{ ...lineStyle, background: 'color-mix(in srgb, var(--text) 5%, var(--card, var(--bg)))', minWidth: '2.5rem' }}>
          {Array.from({ length: count + 20 }, (_, i) => (
            <div key={i} style={{ color: bad.has(i + 1) ? 'var(--danger)' : 'var(--muted)', fontWeight: bad.has(i + 1) ? 700 : 400, visibility: i < count ? 'visible' : 'hidden' }}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          aria-label="Terms file"
          spellCheck={false}
          value={props.text}
          onChange={(e) => props.onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
          }}
          className="flex-1 resize-none px-2 py-1.5"
          style={{ ...lineStyle, background: 'var(--card, var(--bg))', color: 'var(--text)', border: 0, outline: 'none', whiteSpace: 'pre', overflow: 'auto' }}
        />
      </div>
      {errors.length > 0 && (
        <ul className="text-xs text-danger" role="alert">
          {errors.map((e) => (
            <li key={e.line}>
              Line {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TryIt({ rows }: { rows: TermRow[] }) {
  const [sample, setSample] = useState('')
  const hits = useMemo(() => tryMatches(sample, rows), [sample, rows])
  const lines = sample.split('\n')
  const blocking = hits.filter((h) => !h.allowed)
  const allowed = hits.length - blocking.length
  const named = [...new Set(blocking.map((h) => h.rule))]
  return (
    <div className="flex flex-col gap-1.5 rounded border p-2" style={{ borderColor: 'var(--border)' }} data-try-it>
      <label className="flex flex-col gap-1 text-sm">
        Try it
        <span className="text-xs text-muted">Paste some text. Matches light up. Nothing here is saved or sent.</span>
        <textarea
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          rows={3}
          placeholder="Notes from the zebra falcon sync"
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--card, var(--bg))', color: 'var(--text)' }}
        />
      </label>
      {sample && (
        <>
          <div className="rounded px-2 py-1 text-sm" style={{ background: 'color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))', whiteSpace: 'pre-wrap' }} aria-live="polite">
            {lines.map((text, line) => (
              <div key={line}>
                {highlightPieces(
                  text,
                  hits.filter((h) => h.line === line),
                ).map((piece, i) =>
                  !piece.rules.length && piece.allowed ? (
                    <span key={i} data-allowed={piece.allowed.join(' ')}>
                      <del style={{ color: 'var(--muted)' }}>{piece.text}</del>
                      <span className="text-xs text-muted" style={{ marginLeft: 2 }}>
                        {' '}
                        (allowed)
                      </span>
                    </span>
                  ) : piece.rules.length ? (
                    <mark key={i} title={undefined} data-match={piece.rules.join(' ')} style={{ background: 'color-mix(in srgb, var(--danger) 25%, transparent)', color: 'inherit', borderRadius: 3 }}>
                      {piece.text}
                    </mark>
                  ) : (
                    <span key={i}>{piece.text}</span>
                  ),
                )}
                {!text && '\u00a0'}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted" role="status">
            {blocking.length ? `${blocking.length} match${blocking.length === 1 ? '' : 'es'}: ${named.join(', ')}.` : 'No matches.'}
            {allowed ? ` ${allowed} allowed.` : ''} Avoozl also reads through percent and HTML escapes; this preview does not.
          </p>
        </>
      )}
    </div>
  )
}

function TermsEditor(props: { workspaceId: string; client: Client; set: ContentRuleSet; onSaved: () => Promise<unknown> }) {
  const { workspaceId, client, set } = props
  const [file, setFile] = useState<TermsFile | null>(null)
  const [rows, setRows] = useState<TermRow[]>([])
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [view, setView] = useState<'builder' | 'file'>('builder')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const narrow = useMedia('(max-width: 640px)')
  useEffect(() => {
    let live = true
    setFile(null)
    setError(null)
    setNote(null)
    client
      .terms(workspaceId, set.id)
      .then((loaded) => {
        if (!live) return
        setFile(loaded)
        const body = loaded.text ?? ''
        setText(body)
        setSaved(body)
        setRows(parseTermLines(body))
      })
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, set.id])
  const fromRows = (next: TermRow[]) => {
    setRows(next)
    setText(serializeTerms(next))
    setNote(null)
  }
  const fromText = (next: string) => {
    setText(next)
    setRows(parseTermLines(next))
    setNote(null)
  }
  const errors = fileErrors(text)
  const dirty = text !== saved
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await client.saveTerms(workspaceId, set.id, text)
      setSaved(text)
      setNote(`Saved ${result.rules} rule${result.rules === 1 ? '' : 's'}.`)
      await props.onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  if (error && !file) return <p className="text-sm text-danger">{error}</p>
  if (!file) return <p className="text-sm text-muted">Reading the terms file…</p>
  if (!file.editable)
    return (
      <p className="text-sm text-muted">
        {file.reason} <code className="text-xs">{file.file}</code>
      </p>
    )
  return (
    <div className="flex flex-col gap-2.5" data-terms-editor>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          layoutId="avoozl-terms-view"
          ariaLabel="Terms view"
          segments={[
            { key: 'builder', label: 'Rule builder' },
            { key: 'file', label: 'File view' },
          ]}
          value={view}
          onChange={(key: string) => setView(key as 'builder' | 'file')}
        />
        <span className="text-xs text-muted">
          {ruleCount(rows)} rule{ruleCount(rows) === 1 ? '' : 's'}
          {allowCount(rows) ? `, ${allowCount(rows)} allow` : ''}
          {!file.exists && !dirty ? ', no file yet' : ''}
        </span>
        <span className="ml-auto">
          <HelpLink>How a line works</HelpLink>
        </span>
      </div>
      {view === 'builder' ? (
        <div className="flex flex-col gap-2">
          {ruleCount(rows) === 0 && <p className="text-xs text-muted">No rules yet. Add one: a name that shows in logs, and the word or pattern to find.</p>}
          <ul className="flex flex-col gap-2" aria-label="Rules">
            {rows.map((row, i) => (
              <RuleRow
                key={i}
                row={row}
                rows={rows}
                index={i}
                narrow={narrow}
                onChange={(next) => fromRows(rows.map((r, j) => (j === i ? next : r)))}
                onRemove={() => fromRows(rows.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
          <span className="flex flex-wrap gap-3">
            <IconLabel icon={Plus} onClick={() => fromRows([...rows, { kind: 'word', name: nextRuleName(rows), value: '' }])}>
              Add rule
            </IconLabel>
            <IconLabel
              icon={Plus}
              onClick={() => fromRows([...rows, { kind: 'allow', rule: '', match: 'word', value: '' }])}
              tooltip="Let a line through that a rule would block, like a public name that shares a word"
            >
              Add allow
            </IconLabel>
          </span>
        </div>
      ) : (
        <FileView text={text} onChange={fromText} />
      )}
      <TryIt rows={rows} />
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <ShieldCheck size={ICON} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Saved only to <code>{file.file}</code>, which Git must ignore and only your account can read. A rule’s name can show in logs and
          notices; its words never do, so keep the words out of the name.
        </span>
      </p>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="text-sm text-muted" role="status">
          {note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Btn primary disabled={busy || !dirty || errors.length > 0} onClick={() => void save()}>
          Save terms
        </Btn>
        {dirty && (
          <Btn disabled={busy} onClick={() => fromText(saved)}>
            Undo changes
          </Btn>
        )}
        {errors.length > 0 && <span className="text-xs text-danger">Fix line {errors[0].line} to save.</span>}
      </div>
    </div>
  )
}

function SetDetails(props: {
  workspaceId: string
  client: Client
  value: ContentRules
  set: ContentRuleSet | null
  onSaved: (value: ContentRules, select?: string | null) => void
  reload: () => Promise<unknown>
}) {
  const { set, value } = props
  const [form, setForm] = useState<SetForm>(() => (set ? setFormOf(set) : emptySetForm()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stored = set ? JSON.stringify(entryOf(set)) : null
  useEffect(() => {
    setForm(set ? setFormOf(set) : emptySetForm())
    setError(null)
  }, [stored])
  const others = value.sets.filter((s) => s.id !== set?.id)
  const choices = value.choices ?? { repositories: [], plugins: [] }
  const checked = setEntry(form, others.map((s) => s.id))
  const changed = !set || JSON.stringify(checked.entry) !== JSON.stringify(entryOf(set))
  const write = async (sets: Record<string, unknown>[], select: string | null) => {
    setBusy(true)
    setError(null)
    try {
      props.onSaved(await props.client.saveSets(props.workspaceId, sets, value.configHash), select)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const save = () => {
    if (!checked.entry) return setError(checked.error ?? 'Check the form.')
    const list = value.sets.map((s) => (s.id === set?.id ? checked.entry! : entryOf(s)))
    void write(set ? list : [...list, checked.entry], String(checked.entry.id))
  }
  return (
    <div className="flex flex-col gap-4" data-rule-details={set?.id ?? 'new'}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {set ? set.id : 'New rule set'}
            {set && <Badge variant={set.available ? 'success' : 'warning'}>{set.available ? 'Available' : 'Unavailable'}</Badge>}
            {set && <Badge>{set.action === 'report' ? 'Reports' : 'Blocks'}</Badge>}
          </h3>
          <p className="text-xs text-muted">{set ? 'Your words to keep out of what Avoozl writes.' : 'Name it and pick where it checks. Add its words after you save.'}</p>
        </div>
        {set && (
          <DangerBtn
            icon={Trash2}
            disabled={busy}
            confirm={{
              title: `Delete the rule set ${set.id}?`,
              body: 'It is removed from .avoozl.json and stops checking. Its terms file stays on this machine, so a new set with the same name uses it again.',
              action: 'Delete set',
            }}
            onConfirm={() => void write(others.map(entryOf), null)}
          >
            Delete set
          </DangerBtn>
        )}
      </div>
      {set && (
        <Facts
          rows={[
            ['Rules from', sourceLabel(set)],
            ['Checks', scopeLabel(set)],
            ...(set.available && set.ruleCount !== undefined ? ([['Rules', String(set.ruleCount)]] as [string, ReactNode][]) : []),
          ]}
        />
      )}
      {set && !set.available && set.reason && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
          Nothing it checks is written until this is fixed: {set.reason}.
        </p>
      )}
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">Settings</h4>
        <SetFormView form={form} set={(patch) => setForm({ ...form, ...patch })} isNew={!set} choices={choices} />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {!checked.entry && checked.error && form.id && <p className="text-xs text-danger">{checked.error}</p>}
        <div className="flex gap-2">
          <Btn primary disabled={busy || !changed || !checked.entry} onClick={save}>
            {set ? 'Save set' : 'Create set'}
          </Btn>
          <span className="self-center text-xs text-muted">Saves to .avoozl.json. No words go there.</span>
        </div>
      </section>
      {set && set.source === 'file' && (
        <section className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <h4 className="text-sm font-semibold">Words and patterns</h4>
          <p className="text-xs text-muted">One rule per line. Case doesn’t matter. Only you can see these.</p>
          <TermsEditor workspaceId={props.workspaceId} client={props.client} set={set} onSaved={props.reload} />
        </section>
      )}
      {set && set.source === 'plugin' && <p className="text-sm text-muted">The plugin {set.plugin} supplies this set’s rules, so there is no terms file to edit.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// How rules work. Every example is made up.

const EXAMPLE_LINES = String.raw`# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b`

const ALLOW_LINES = String.raw`# zebra falcon app is the public name
allow: zebra falcon app
# ACME-0000 is the sample ticket in the docs
allow ticket: \bacme-0000\b`

function HowRulesWork() {
  return (
    <details id={HELP_ID} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }} data-rules-help>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold" style={{ listStyle: 'none' }}>
        <BookOpen size={ICON} aria-hidden="true" />
        How rules work
      </summary>
      <div className="mt-3 grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))' }}>
        <section>
          <h4 className="font-semibold">Rule sets</h4>
          <p className="text-muted">
            A rule set is a named list of words Avoozl must not write. .avoozl.json only names the set and where it checks. The words live in a
            file on this machine, or come from a rules plugin.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">One rule per line</h4>
          <p className="text-muted">A name, a colon, then what to find. Lines starting with # are notes. Case never matters.</p>
          <pre className="mt-1 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            {EXAMPLE_LINES}
          </pre>
        </section>
        <section>
          <h4 className="font-semibold">Word or pattern</h4>
          <p className="text-muted">
            A word or phrase matches only itself. A pattern is a regular expression, for things like any ticket number. The builder saves a word
            with its dots and brackets escaped, so they mean themselves.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Allow a false match</h4>
          <p className="text-muted">
            A line starting <code>allow</code> lets text through that a rule would block. <code>allow:</code> works for every rule in the
            file; <code>allow ticket:</code> works for the ticket rule only. It counts only when it matches the same line the rule matched.
            Allow lines are as private as rules, and the built-in sets don’t use them.
          </p>
          <pre className="mt-1 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            {ALLOW_LINES}
          </pre>
        </section>
        <section>
          <h4 className="font-semibold">Where it checks</h4>
          <ul className="text-muted">
            {BOUNDARIES.map((b) => (
              <li key={b}>
                <span style={{ color: 'var(--text)' }}>{BOUNDARY_LABELS[b]}:</span> {BOUNDARY_HINTS[b]}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">It also reads through percent and HTML escapes and hidden zero-width characters.</p>
        </section>
        <section>
          <h4 className="font-semibold">Block or report</h4>
          <p className="text-muted">
            Block stops the write and opens a decision in Conflicts. There a person can change the text, or Allow once with a reason: that lets
            that exact text through one time. Report lets the write through and lists the match in Delivery, with one notice.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Built-in sets</h4>
          <p className="text-muted">
            Plans repo name, Safe replies and Secrets always run where they apply. Settings can’t turn them off, and a set of yours can’t use a
            name starting builtin:.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Privacy</h4>
          <p className="text-muted">
            Terms files sit in .avoozl/local/content-rules, which Git must ignore, and only your account can read them. A file Git tracks, or
            could commit, is refused. A finding names the set, the rule and the line, never the words. A set whose file is missing blocks
            everything it checks until the file is back.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Rules plugins</h4>
          <p className="text-muted">
            A plugin of kind rules can supply sets, for words a team shares without a file on each machine. Add and approve it under Plugins, then
            pick it as the set’s rules plugin. Its rules stay in memory only.
          </p>
        </section>
      </div>
    </details>
  )
}

// Settings > Content rules (design §4.9, R40): rule sets in a panel on the
// left, the chosen one's details and editors on the right, and How rules
// work below.
export default function ContentRulesSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => contentClient(api), [api])
  const load = useCallback((id: string) => client.list(id), [client])
  const { value: read, error, reload } = useRead(workspaceId, load)
  const [fresh, setFresh] = useState<ContentRules | null>(null)
  const value = fresh ?? read
  useEffect(() => setFresh(null), [read])
  const [selection, setSelection] = useState<Selection | null>(null)
  const chosen: Selection | null =
    selection && (selection.kind === 'new' || (selection.kind === 'set' ? value?.sets.some((s) => s.id === selection.id) : true))
      ? selection
      : value?.sets[0]
        ? { kind: 'set', id: value.sets[0].id }
        : value?.builtins[0]
          ? { kind: 'builtin', id: value.builtins[0].id }
          : null
  const wide = useMedia('(min-width: 860px)')
  const set = chosen?.kind === 'set' ? (value?.sets.find((s) => s.id === chosen.id) ?? null) : null
  const builtin = chosen?.kind === 'builtin' ? value?.builtins.find((b) => b.id === chosen.id) : undefined
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-danger">{error}</p>}
      {value?.error && <p className="text-xs text-danger">.avoozl.json contentRules is invalid, so every check blocks: {value.error}</p>}
      <div
        data-content-layout
        style={wide ? { display: 'grid', gridTemplateColumns: 'minmax(14rem, 18rem) minmax(0, 1fr)', gap: 16, alignItems: 'start' } : { display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <SetList value={value} selection={chosen} onSelect={setSelection} />
        <div className="min-w-0 rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card, var(--bg))' }}>
          {!value ? (
            <p className="text-sm text-muted">Reading rule sets…</p>
          ) : builtin ? (
            <BuiltinDetails id={builtin.id} appliesAt={builtin.appliesAt} mode={value.mode} />
          ) : chosen?.kind === 'new' || set ? (
            <SetDetails
              key={set?.id ?? 'new'}
              workspaceId={workspaceId}
              client={client}
              value={value}
              set={set}
              reload={reload}
              onSaved={(next, select) => {
                setFresh(next)
                setSelection(select ? { kind: 'set', id: select } : null)
              }}
            />
          ) : null}
        </div>
      </div>
      <HowRulesWork />
    </div>
  )
}
