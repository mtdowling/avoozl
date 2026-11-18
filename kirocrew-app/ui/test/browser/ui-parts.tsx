// The Avoozl parts of src/ui/, one of each, for ui-parts.test.mjs.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorText } from '../../src/ui/ErrorText.tsx'
import { Hint } from '../../src/ui/Hint.tsx'
import { Checkbox } from '../../src/ui/Checkbox.tsx'
import { Row } from '../../src/ui/Row.tsx'
import { SelectField } from '../../src/ui/SelectField.tsx'
import { Stack } from '../../src/ui/Stack.tsx'
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
    <SwitchDemo />
    <TextLink data-part="link" href="#x">
      A link
    </TextLink>
  </div>,
)
