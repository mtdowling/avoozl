import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppApi, useChatLauncher } from './host.ts'
import { Input } from './ui/Input'
import { SegmentedControl } from './ui/SegmentedControl'
import Badge from './ui/Badge.tsx'
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
import { SaveFooter } from './SaveFooter.tsx'
import { CheckRow, FieldRow, Marker, RawKey } from './FieldRow.tsx'
import { ChoiceCards, DangerBtn, ICON, IconBtn, IconLabel, SectionHeading } from './ui/controls.tsx'
import { BookOpen, Ban, Eye, Lock, MessagesSquare, Plus, ShieldCheck, Trash2, X } from './icons.ts'
import { DESIGN_RULES_TIP, rulesDesignMessage } from './design-chat.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { useMedia } from './use-media.ts'
import { PairedCard, PairedCards } from './ui/PairedCards.tsx'
import { useSteppedState } from './NavHistory.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { SelectField } from './ui/SelectField'
import { Box } from './ui/Box'

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
  padding: 12,
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
        <Box as="span" flex wFull items="center" gap="1.5" size="sm" weight="medium">
          {props.locked && <Lock size={12} aria-label="Built in" style={{ color: 'var(--muted)', flexShrink: 0 }} />}
          <Box as="span" truncate>{props.title}</Box>
          {props.note && <Box as="span" ml="auto" shrink0>{props.note}</Box>}
        </Box>
        {props.raw && <Box as="code" size="11" tone="muted">{props.raw}</Box>}
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
    <PairedCard label="Rule sets" width="18rem" style={panelStyle}>
      <Stack gap={3} data-rule-panel>
      <Box flex flexCol items="start" gap="2">
        <Box as="h3" size="sm" weight="semibold">Your rule sets</Box>
        {!(value && !value.sets.length) && add}
      </Box>
      {value && !value.sets.length ? (
        <Box flex flexCol items="start" gap="1.5" size="xs" data-rule-empty>
          <p>No rule sets yet. Only the built-in sets run.</p>
          <Hint as="p">Choose Add rule set to block your own words, like a project code name.</Hint>
          {add}
          <span>
            <HelpLink />
          </span>
        </Box>
      ) : (
        <Box as="ul" flex flexCol gap="0.5">
          {value?.sets.map((set) => (
            <SetRow
              key={set.id}
              title={set.id}
              selected={is('set', set.id)}
              onClick={() => props.onSelect({ kind: 'set', id: set.id })}
              note={
                set.available ? (
                  <Box as="span" size="11" tone="muted">{set.action === 'report' ? 'Reports' : 'Blocks'}</Box>
                ) : (
                  <Badge variant="warning">Unavailable</Badge>
                )
              }
            />
          ))}
        </Box>
      )}
      <Box css-border-color="border" border="t" pt="2">
        <Box as="h3" size="sm" weight="semibold">Built in</Box>
        <Hint as="p" size="xs">Always on. Settings can’t change them.</Hint>
        <Box as="ul" mt="1" flex flexCol gap="0.5">
          {value?.builtins.map((set) => (
            <SetRow
              key={set.id}
              locked
              title={builtinName(set.id)}
              raw={set.id}
              selected={is('builtin', set.id)}
              onClick={() => props.onSelect({ kind: 'builtin', id: set.id })}
              note={builtinUsed(set.id, value?.mode) ? null : <Box as="span" size="11" tone="muted">not used</Box>}
            />
          ))}
        </Box>
      </Box>
      </Stack>
    </PairedCard>
  )
}

// ---------------------------------------------------------------------------
// Details on the right.

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Box as="dl" css-grid-template-columns="minmax-7rem-auto-1fr" grid gapX="3" gapY="1.5" size="sm">
      {rows.map(([label, value]) => (
        <Box key={label} contents>
          <Hint as="dt">{label}</Hint>
          <dd>{value}</dd>
        </Box>
      ))}
    </Box>
  )
}

function BuiltinDetails({ id, appliesAt, mode }: { id: string; appliesAt: string; mode: string | null | undefined }) {
  const info = BUILTIN_INFO[id]
  const used = builtinUsed(id, mode)
  return (
    <Stack gap={3} data-rule-details={id}>
      <SectionHeading icon={Lock} title={builtinName(id)} meta={used ? <Badge>Always on</Badge> : <Badge>Not used</Badge>} blurb={<Box as="code" size="11">{id}</Box>} />
      {!used && <Hint as="p" size="sm">Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode.</Hint>}
      <Facts
        rows={[
          ['What it protects', info?.protects ?? 'A check Avoozl runs on its own writes.'],
          ['Where it checks', info?.where ?? appliesAt],
          [
            'It blocks',
            info ? (
              <Stack as="span" gap={1}>
                <Box as="code" css-border-color="border" wFit rounded="base" border="all" px="1.5" py="0.5" size="xs">
                  {info.example}
                </Box>
                <Hint size="xs">A made-up example.</Hint>
              </Stack>
            ) : (
              '—'
            ),
          ],
        ]}
      />
    </Stack>
  )
}

function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return <CheckRow label={props.label} help={props.hint} checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
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
  const nameHelp = props.isNew ? 'Lowercase letters, digits, dots and dashes. It also names the terms file.' : 'The name is the terms file’s name, so it stays.'
  return (
    <Stack gap={3} data-set-form>
      <FieldRow id="avoozl-set-id" label="Name" raw="id" rule={{ required: true }} width="22rem" help={nameHelp}>
        <Input id="avoozl-set-id" aria-describedby="avoozl-set-id-help" value={form.id} disabled={!props.isNew} placeholder="company-terms" onChange={(e: { target: { value: string } }) => set({ id: e.target.value })} />
      </FieldRow>
      <Box as="fieldset" flex flexCol gap="1.5">
        <Box as="legend" mb="1" flex flexWrap items="baseline" gapX="2" size="sm">
          <Box as="span" weight="medium">When a rule matches</Box> <RawKey name="action" />
        </Box>
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
      </Box>
      <Box as="fieldset" flex flexCol gap="1">
        <Box as="legend" mb="1" flex flexWrap items="baseline" gapX="2" size="sm">
          <Box as="span" weight="medium">Where it checks</Box> <RawKey name="boundaries" />
        </Box>
        <Box css-grid-template-columns="repeat-auto-fit-minmax-min-100%-14rem-1fr" grid gap="1.5">
          {BOUNDARIES.map((b) => (
            <Check key={b} label={BOUNDARY_LABELS[b]} hint={BOUNDARY_HINTS[b]} checked={form.boundaries.includes(b)} onChange={(on) => set({ boundaries: toggle(form.boundaries, b, on) })} />
          ))}
        </Box>
      </Box>
      <Box as="fieldset" flex flexCol gap="1">
        <Box as="legend" mb="1" flex flexWrap items="baseline" gapX="2" size="sm">
          <Box as="span" weight="medium">Repositories</Box> <Marker rule={{ required: false }} /> <RawKey name="repositories" />
        </Box>
        {choices.repositories.length ? (
          <Box flex flexWrap gapX="4" gapY="1">
            {choices.repositories.map((r) => (
              <Check key={r} label={r} checked={form.repositories.includes(r)} onChange={(on) => set({ repositories: toggle(form.repositories, r, on) })} />
            ))}
          </Box>
        ) : (
          <Hint as="p" size="xs">No repositories are registered yet. Add them under Repositories.</Hint>
        )}
        <Hint size="xs">None checked: every repository.</Hint>
      </Box>
      <FieldRow id="avoozl-set-plugin" label="Rules plugin" raw="plugin" rule={{ required: false }} width="22rem" help="A plugin of kind rules, approved under Plugins, can supply this set instead.">
        <SelectField
          id="avoozl-set-plugin"
          aria-describedby="avoozl-set-plugin-help"
          value={form.plugin}
          onChange={(e) => set({ plugin: e.target.value })} look="field"
        >
          <option value="">None: use a terms file on this machine</option>
          {choices.plugins.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
      </FieldRow>
    </Stack>
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
      <Box as="li" flex flexCol gap="1" data-term-row={index + 1}>
        <Box css-display="grid" css-grid-template-columns="auto-minmax-0-1fr-auto" css-gap="8" css-align-items="center">
          <Box as="span" css-width="4.5rem" size="xs" tone="muted">
            {row.kind === 'note' ? 'Note' : `Line ${index + 1}`}
          </Box>
          <input
            value={row.text}
            aria-label={row.kind === 'note' ? `Note on line ${index + 1}` : `Line ${index + 1}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => props.onChange({ kind: row.kind, text: e.target.value } as TermRow)}
            style={{ ...fieldStyle, ...(row.kind === 'raw' ? mono : { color: 'var(--muted)' }) }}
          />
          <IconBtn icon={X} label={`Drop line ${index + 1}`} onClick={props.onRemove} />
        </Box>
        {error && (
          <ErrorText id={errorId} as="span" size="xs">
            Line {index + 1}: {error}
          </ErrorText>
        )}
      </Box>
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
    <SelectField value={row.rule} aria-label={`Rule allowed on line ${index + 1}`} onChange={(e) => props.onChange({ ...row, rule: e.target.value })} look="row">
      <option value="">Every rule</option>
      {[...new Set([...names, ...(row.rule ? [row.rule] : [])])].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </SelectField>
  ) : (
    <input value={row.name} aria-label={`Rule name on line ${index + 1}`} placeholder="rule-name" onChange={(e) => props.onChange({ ...row, name: e.target.value })} style={fieldStyle} />
  )
  const kind = (
    <SelectField value={current} aria-label={`Kind on line ${index + 1}`} onChange={(e) => switchKind(e.target.value as RowKind)} look="row">
      <option value="word">Word or phrase</option>
      <option value="pattern">Pattern</option>
      <option value="allow-word">Allow word</option>
      <option value="allow-pattern">Allow pattern</option>
    </SelectField>
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
    <Box as="li" flex flexCol gap="1" data-term-row={index + 1}>
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
        <ErrorText id={errorId} as="span" size="xs" role="alert">
          Line {index + 1}: {error}
        </ErrorText>
      )}
    </Box>
  )
}

function FileView(props: { text: string; onChange: (text: string) => void }) {
  const gutter = useRef<HTMLDivElement>(null)
  const errors = useMemo(() => fileErrors(props.text), [props.text])
  const bad = new Set(errors.map((e) => e.line))
  const count = Math.max(1, props.text.replace(/\n$/, '').split('\n').length)
  const lineStyle = { fontFamily: 'var(--mono, monospace)', fontSize: 12, lineHeight: '18px' }
  return (
    <Stack gap={1}>
      <Box css-border-color="border" css-height="220" flex overflow="hidden" rounded="base" border="all">
        <div ref={gutter} aria-hidden="true" className="select-none overflow-hidden px-2 py-1.5 text-right" style={{ ...lineStyle, background: 'color-mix(in srgb, var(--text) 5%, var(--card, var(--bg)))', minWidth: '2.5rem' }}>
          {Array.from({ length: count + 20 }, (_, i) => (
            <Box key={i} css-color={bad.has(i + 1) ? 'danger' : 'muted'} css-font-weight={bad.has(i + 1) ? '700' : '400'} css-visibility={i < count ? 'visible' : 'hidden'}>
              {i + 1}
            </Box>
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
      </Box>
      {errors.length > 0 && (
        <Box as="ul" size="xs" tone="danger" role="alert">
          {errors.map((e) => (
            <li key={e.line}>
              Line {e.line}: {e.message}
            </li>
          ))}
        </Box>
      )}
    </Stack>
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
    <Box css-border-color="border" flex flexCol gap="1.5" rounded="base" border="all" p="2" data-try-it>
      <Box as="label" flex flexCol gap="1" size="sm">
        Try it
        <Hint size="xs">Paste some text. Matches light up. Nothing here is saved or sent.</Hint>
        <textarea
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          rows={3}
          placeholder="Notes from the zebra falcon sync"
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--card, var(--bg))', color: 'var(--text)' }}
        />
      </Box>
      {sample && (
        <>
          <Box css-background="mix-text-4%-card-bg" css-white-space="pre-wrap" rounded="base" px="2" py="1" size="sm" aria-live="polite">
            {lines.map((text, line) => (
              <div key={line}>
                {highlightPieces(
                  text,
                  hits.filter((h) => h.line === line),
                ).map((piece, i) =>
                  !piece.rules.length && piece.allowed ? (
                    <span key={i} data-allowed={piece.allowed.join(' ')}>
                      <del style={{ color: 'var(--muted)' }}>{piece.text}</del>
                      <Box as="span" css-margin-left="2" size="xs" tone="muted">
                        {' '}
                        (allowed)
                      </Box>
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
          </Box>
          <Hint as="p" size="xs" role="status">
            {blocking.length ? `${blocking.length} match${blocking.length === 1 ? '' : 'es'}: ${named.join(', ')}.` : 'No matches.'}
            {allowed ? ` ${allowed} allowed.` : ''} Avoozl also reads through percent and HTML escapes; this preview does not.
          </Hint>
        </>
      )}
    </Box>
  )
}

// What the page's one footer needs from the terms editor: whether it has
// unsaved words, why it cannot save, and how to save or put them back.
export interface TermsControl {
  save: () => Promise<boolean>
  discard: () => void
}

function TermsEditor(props: {
  workspaceId: string
  client: Client
  set: ContentRuleSet
  onSaved: () => Promise<unknown>
  control: { current: TermsControl | null }
  onState: (state: { dirty: boolean; problem: string | null }) => void
}) {
  const { workspaceId, client, set } = props
  const [file, setFile] = useState<TermsFile | null>(null)
  const [rows, setRows] = useState<TermRow[]>([])
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [view, setView] = useSteppedState<'builder' | 'file'>(
    'content-terms-view',
    'inner',
    (previous) => (previous === 'file' ? 'Back to File view' : 'Back to Rule builder'),
    'builder',
  )
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
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  props.control.current = { save, discard: () => fromText(saved) }
  const problem = errors.length ? `Fix line ${errors[0].line} of the words and patterns.` : null
  const { onState } = props
  useEffect(() => {
    onState({ dirty, problem })
    return () => onState({ dirty: false, problem: null })
  }, [dirty, problem, onState])
  if (error && !file) return <ErrorText size="sm">{error}</ErrorText>
  if (!file) return <Hint as="p" size="sm">Reading the terms file…</Hint>
  if (!file.editable)
    return (
      <Hint as="p" size="sm">
        {file.reason} <Box as="code" size="xs">{file.file}</Box>
      </Hint>
    )
  return (
    <Box flex flexCol gap="2.5" data-terms-editor>
      <Row gap={2}>
        <SegmentedControl
          collapse={false}
          wrap="hug"
          layoutId="avoozl-terms-view"
          ariaLabel="Terms view"
          segments={[
            { key: 'builder', label: 'Rule builder' },
            { key: 'file', label: 'File view' },
          ]}
          value={view}
          onChange={(key: string) => setView(key as 'builder' | 'file')}
        />
        <Hint size="xs">
          {ruleCount(rows)} rule{ruleCount(rows) === 1 ? '' : 's'}
          {allowCount(rows) ? `, ${allowCount(rows)} allow` : ''}
          {!file.exists && !dirty ? ', no file yet' : ''}
        </Hint>
        <Box as="span" ml="auto">
          <HelpLink>How a line works</HelpLink>
        </Box>
      </Row>
      {view === 'builder' ? (
        <Stack gap={2}>
          {ruleCount(rows) === 0 && <Hint as="p" size="xs">No rules yet. Add one: a name that shows in logs, and the word or pattern to find.</Hint>}
          <Stack as="ul" gap={2} aria-label="Rules">
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
          </Stack>
          <Row as="span" gap={3} align="start">
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
          </Row>
        </Stack>
      ) : (
        <FileView text={text} onChange={fromText} />
      )}
      <TryIt rows={rows} />
      <Box as="p" flex items="start" gap="1.5" size="xs" tone="muted">
        <ShieldCheck size={ICON} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Saved only to <code>{file.file}</code>, which Git must ignore and only your account can read. A rule’s name can show in logs and
          notices; its words never do, so keep the words out of the name.
        </span>
      </Box>
      {error && (
        <ErrorText size="sm" role="alert">
          {error}
        </ErrorText>
      )}
      {note && (
        <Hint as="p" size="sm" role="status">
          {note}
        </Hint>
      )}
    </Box>
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
  const termsControl = useRef<TermsControl | null>(null)
  const [terms, setTerms] = useState<{ dirty: boolean; problem: string | null }>({ dirty: false, problem: null })
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
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  const setsDirty = set ? changed : JSON.stringify(form) !== JSON.stringify(emptySetForm())
  const problem = setsDirty && !checked.entry ? (checked.error ?? 'Check the form.') : terms.dirty ? terms.problem : null
  // One Save: the set's settings first, then its words.
  const save = async () => {
    if (setsDirty && checked.entry) {
      const list = value.sets.map((s) => (s.id === set?.id ? checked.entry! : entryOf(s)))
      if (!(await write(set ? list : [...list, checked.entry], String(checked.entry.id)))) return
    }
    if (terms.dirty) await termsControl.current?.save()
  }
  const discard = () => {
    setForm(set ? setFormOf(set) : emptySetForm())
    setError(null)
    termsControl.current?.discard()
  }
  return (
    <Stack gap={4} data-rule-details={set?.id ?? 'new'}>
      <SectionHeading
        title={set ? set.id : 'New rule set'}
        meta={
          set && (
            <>
              <Badge variant={set.available ? 'success' : 'warning'}>{set.available ? 'Available' : 'Unavailable'}</Badge>
              <Badge>{set.action === 'report' ? 'Reports' : 'Blocks'}</Badge>
            </>
          )
        }
        blurb={set ? 'Your words to keep out of what Avoozl writes.' : 'Name it and pick where it checks. Add its words after you save.'}
        actions={set && (
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
      />
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
        <Box as="p" css-color="danger" size="sm" role="alert">
          Nothing it checks is written until this is fixed: {set.reason}.
        </Box>
      )}
      <Stack as="section" gap={2}>
        <Box as="h4" size="sm" weight="semibold">Settings</Box>
        <SetFormView form={form} set={(patch) => setForm({ ...form, ...patch })} isNew={!set} choices={choices} />
      </Stack>
      {set && set.source === 'file' && (
        <Box as="section" css-border-color="border" flex flexCol gap="2" border="t" pt="3">
          <Box as="h4" size="sm" weight="semibold">Words and patterns</Box>
          <Hint as="p" size="xs">One rule per line. Case doesn’t matter. Only you can see these.</Hint>
          <TermsEditor workspaceId={props.workspaceId} client={props.client} set={set} onSaved={props.reload} control={termsControl} onState={setTerms} />
        </Box>
      )}
      {set && set.source === 'plugin' && <Hint as="p" size="sm">The plugin {set.plugin} supplies this set’s rules, so there is no terms file to edit.</Hint>}
      <SaveFooter dirty={setsDirty || terms.dirty} saving={busy} problem={problem} error={error} note="Settings go to .avoozl.json, words to a file on this machine." onSave={() => void save()} onDiscard={discard} />
    </Stack>
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
    <Box id={HELP_ID} as="details" css-border-color="border" rounded="lg" border="all" p="3" data-rules-help>
      <Box as="summary" css-list-style="none" flex cursorPointer items="center" gap="2" size="sm" weight="semibold">
        <BookOpen size={ICON} aria-hidden="true" />
        How rules work
      </Box>
      <Box css-grid-template-columns="repeat-auto-fit-minmax-min-100%-20rem-1fr" mt="3" grid gap="4" size="sm">
        <section>
          <Box as="h4" weight="semibold">Rule sets</Box>
          <Hint as="p">
            A rule set is a named list of words Avoozl must not write. .avoozl.json only names the set and where it checks. The words live in a
            file on this machine, or come from a rules plugin.
          </Hint>
        </section>
        <section>
          <Box as="h4" weight="semibold">One rule per line</Box>
          <Hint as="p">A name, a colon, then what to find. Lines starting with # are notes. Case never matters.</Hint>
          <Box as="pre" css-border-color="border" mt="1" overflow="auto" rounded="base" border="all" p="2" size="xs">
            {EXAMPLE_LINES}
          </Box>
        </section>
        <section>
          <Box as="h4" weight="semibold">Word or pattern</Box>
          <Hint as="p">
            A word or phrase matches only itself. A pattern is a regular expression, for things like any ticket number. The builder saves a word
            with its dots and brackets escaped, so they mean themselves.
          </Hint>
        </section>
        <section>
          <Box as="h4" weight="semibold">Allow a false match</Box>
          <Hint as="p">
            A line starting <code>allow</code> lets text through that a rule would block. <code>allow:</code> works for every rule in the
            file; <code>allow ticket:</code> works for the ticket rule only. It counts only when it matches the same line the rule matched.
            Allow lines are as private as rules, and the built-in sets don’t use them.
          </Hint>
          <Box as="pre" css-border-color="border" mt="1" overflow="auto" rounded="base" border="all" p="2" size="xs">
            {ALLOW_LINES}
          </Box>
        </section>
        <section>
          <Box as="h4" weight="semibold">Where it checks</Box>
          <Box as="ul" tone="muted">
            {BOUNDARIES.map((b) => (
              <li key={b}>
                <Box as="span" css-color="text">{BOUNDARY_LABELS[b]}:</Box> {BOUNDARY_HINTS[b]}
              </li>
            ))}
          </Box>
          <Box as="p" mt="1" tone="muted">It also reads through percent and HTML escapes and hidden zero-width characters.</Box>
        </section>
        <section>
          <Box as="h4" weight="semibold">Block or report</Box>
          <Hint as="p">
            Block stops the write and opens a decision in Conflicts. There a person can change the text, or Allow once with a reason: that lets
            that exact text through one time. Report lets the write through and lists the match in Delivery, with one notice.
          </Hint>
        </section>
        <section>
          <Box as="h4" weight="semibold">Built-in sets</Box>
          <Hint as="p">
            Plans repo name, Safe replies and Secrets always run where they apply. Settings can’t turn them off, and a set of yours can’t use a
            name starting builtin:.
          </Hint>
        </section>
        <section>
          <Box as="h4" weight="semibold">Privacy</Box>
          <Hint as="p">
            Terms files sit in .avoozl/local/content-rules, which Git must ignore, and only your account can read them. A file Git tracks, or
            could commit, is refused. A finding names the set, the rule and the line, never the words. A set whose file is missing blocks
            everything it checks until the file is back.
          </Hint>
        </section>
        <section>
          <Box as="h4" weight="semibold">Rules plugins</Box>
          <Hint as="p">
            A plugin of kind rules can supply sets, for words a team shares without a file on each machine. Add and approve it under Plugins, then
            pick it as the set’s rules plugin. Its rules stay in memory only.
          </Hint>
        </section>
      </Box>
    </Box>
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
  const { openChat } = useChatLauncher()
  const design = () => openChat({ message: rulesDesignMessage({ sets: (value?.sets ?? []).map((s) => s.id) }), autoSend: false })
  return (
    <Stack gap={4}>
      <Row gap={2} align="start" data-rules-design>
        <IconLabel icon={MessagesSquare} tooltip={DESIGN_RULES_TIP} onClick={design}>
          Design a rule set
        </IconLabel>
      </Row>
      {error && <ErrorText size="xs">{error}</ErrorText>}
      {value?.error && <ErrorText size="xs">.avoozl.json contentRules is invalid, so every check blocks: {value.error}</ErrorText>}
      <PairedCards paired={wide} attrs={{ 'data-content-layout': '' }}>
        <SetList value={value} selection={chosen} onSelect={setSelection} />
        <PairedCard label="Rule set details" grow={1}>
          {!value ? (
            <Hint as="p" size="sm">Reading rule sets…</Hint>
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
        </PairedCard>
      </PairedCards>
      <HowRulesWork />
    </Stack>
  )
}
