// The Avoozl parts of src/ui/, one of each, for ui-parts.test.mjs.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorText } from '../../src/ui/ErrorText.tsx'
import { Hint } from '../../src/ui/Hint.tsx'
import { Box } from '../../src/ui/Box.tsx'
import { PlainButton, PlainInput, PlainLink, PlainTextarea, SvgG, SvgPath, SvgRect, SvgRoot, SvgText } from '../../src/ui/Plain.tsx'
import { Glyph } from '../../src/ui/Glyph.tsx'
import { Check } from '../../src/icons.ts'
import { Checkbox } from '../../src/ui/Checkbox.tsx'
import { Row } from '../../src/ui/Row.tsx'
import { SelectField } from '../../src/ui/SelectField.tsx'
import { Stack } from '../../src/ui/Stack.tsx'
import { StatTile, StatTileStyle } from '../../src/ui/StatTile.tsx'
import { Switch } from '../../src/ui/Switch.tsx'
import { TextLink } from '../../src/ui/TextLink.tsx'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'

function SwitchDemo() {
  const [on, setOn] = useState(false)
  return (
    <Switch data-part="switch" label="Send feedback" describedBy="part-help" checked={on} onChange={setOn}>
      Send feedback
    </Switch>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 16, width: 400 }}>
    <Hint data-part="hint">A note</Hint>
    <Hint data-part="hint-p" as="p" size="xs" flush>
      A small note
    </Hint>
    <ErrorText data-part="error">It failed</ErrorText>
    <ErrorText data-part="error-xs" as="span" size="xs">
      Small failure
    </ErrorText>
    <Stack data-part="stack" gap={3}>
      <span>one</span>
      <span>two</span>
    </Stack>
    <Row data-part="row" gap={2} align="end">
      <span>one</span>
      <span>two</span>
    </Row>
    <label htmlFor="part-select">
      Mode
      <SelectField id="part-select" data-part="select" aria-describedby="part-help" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </SelectField>
    </label>
    <span id="part-help">Pick one</span>
    <label>
      <Checkbox data-part="checkbox" aria-describedby="part-help" defaultChecked={false} /> Confirm
    </label>
    <Box as="section" data-part="box" flex flexCol gap="2" size="xs">
      <span>one</span>
    </Box>
    <PlainButton data-part="plain-button" type="button" underline css-background="none" css-border="0">
      Plain
    </PlainButton>
    <PlainLink data-part="plain-link" href="#y" underline>
      Link
    </PlainLink>
    <PlainInput data-part="plain-input" rounded="base" border="all" size="sm" defaultValue="x" />
    <PlainTextarea data-part="plain-textarea" rounded="base" border="all" size="xs" defaultValue="y" />
    <span data-part="glyph">
      <Glyph icon={Check} size={14} aria-hidden="true" css-color="danger" />
    </span>
    <SvgRoot data-part="svg" width={40} height={20} css-display="block"><SvgG data-part="svg-g" css-opacity={0.5}><SvgRect data-part="svg-rect" width={10} height={10} css-fill="var(--danger)" /><SvgPath data-part="svg-path" d="M0 0L5 5" css-stroke="var(--accent)" /><SvgText data-part="svg-text" x={0} y={18} css-font-size="11">a</SvgText></SvgG></SvgRoot>
    <StatTileStyle />
    <StatTile data-part="tile" name="Needs you: 3" value={3} label="Needs you" sub="2 decisions" warm />
    <StatTile data-part="tile-cool" name="Flow: 1" value={1} label="Flow" sub="" />
    <SwitchDemo />
    <TextLink data-part="link" href="#x">
      A link
    </TextLink>
  </div>,
)
