// The form that maps an MCP server alias on this machine: the command and the
// environment names it may read (plugin-checks PK10.2, epic-context EC4.3).
// Shared by a checks part and a context part; the caller saves.
import { Input } from './ui/Input'
import { TipBtn } from './ui/controls.tsx'
import { ErrorText } from './ui/ErrorText'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

export function MappingForm(props: {
  alias: string
  busy: boolean
  editing: boolean
  setEditing: (editing: boolean) => void
  command: string
  setCommand: (value: string) => void
  commandPlaceholder?: string
  env: string
  setEnv: (value: string) => void
  envPlaceholder: string
  openTip: string
  problem: string | null
  onSave: () => void
  openAttribute?: string
}) {
  if (!props.editing)
    return (
      <Row gap={2}>
        <TipBtn tooltip={props.openTip} disabled={props.busy} onClick={() => props.setEditing(true)} {...{ [props.openAttribute ?? 'data-set-mapping']: true }}>
          Set mapping
        </TipBtn>
      </Row>
    )
  return (
    <Stack gap={2}>
      <Input
        aria-label={`Command for ${props.alias}`}
        value={props.command}
        placeholder={props.commandPlaceholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setCommand(e.target.value)}
      />
      <Input
        aria-label={`Environment names for ${props.alias}`}
        value={props.env}
        placeholder={props.envPlaceholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setEnv(e.target.value)}
      />
      {props.problem ? <ErrorText size="xs">{props.problem}</ErrorText> : null}
      <Row gap={2}>
        <TipBtn tooltip="Save this machine's mapping. The plugin needs approving again." primary disabled={props.busy} onClick={props.onSave}>
          Save mapping
        </TipBtn>
        <TipBtn tooltip="Keep the mapping as it is" disabled={props.busy} onClick={() => props.setEditing(false)}>
          Cancel
        </TipBtn>
      </Row>
    </Stack>
  )
}
