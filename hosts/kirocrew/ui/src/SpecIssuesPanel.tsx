// Settings > Repository setup > GitHub: the Spec issues panel. Which spec
// issues this machine works (labels.require, labels.exclude) and when a
// claim branch with no new commit shows as stale (claims.staleHours). It
// saves on its own with repository.configure, which only a person may call.
import { FieldGroup } from './ui/FieldGroup.tsx'
import { Btn } from './ui/Btn'
import { Box } from './ui/Box'
import { Input } from './ui/Input'
import { PanelMessage, usePanelForm } from './PanelForm.tsx'
import { specIssuesForm, specIssuesInput, type SpecIssuesForm } from './settings-api.ts'
import type { Repository } from './workspace-api.ts'

// The claims read's default (workers/claims.mjs).
const DEFAULT_STALE_HOURS = 24

function Line(props: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void; mark: string; type?: string }) {
  return (
    <Box as="label" flex flexCol gap="1" size="sm" htmlFor={props.id}>
      {props.label}
      <Input
        id={props.id}
        type={props.type}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        {...{ [`data-spec-issues-${props.mark}`]: '' }}
      />
    </Box>
  )
}

export default function SpecIssuesPanel(props: { workspaceId: string; repository: Repository }) {
  const { form, set, save, saving, message, dirty } = usePanelForm<SpecIssuesForm>({
    workspaceId: props.workspaceId,
    repositoryId: props.repository.id,
    initial: specIssuesForm(props.repository),
    input: specIssuesInput,
  })
  const id = `avoozl-spec-issues-${props.repository.id}`
  return (
    <FieldGroup
      title="Spec issues"
      blurb="Which spec issues this machine works, and when a claim branch with no new commit needs you."
      actions={
        <Btn size="sm" disabled={!dirty || saving} onClick={() => void save()} data-spec-issues-save>
          {saving ? 'Saving…' : 'Save spec issues'}
        </Btn>
      }
    >
      <Box flex flexCol gap="3" data-spec-issues>
        <Line
          id={`${id}-require`}
          label="Only issues with all of these labels"
          placeholder="blank: every spec issue"
          value={form.require}
          onChange={(require) => set({ require })}
          mark="require"
        />
        <Line
          id={`${id}-exclude`}
          label="Skip issues with any of these labels"
          placeholder="blank: skip none"
          value={form.exclude}
          onChange={(exclude) => set({ exclude })}
          mark="exclude"
        />
        <Line
          id={`${id}-stale`}
          label="Hours before a claim is stale"
          type="number"
          placeholder={`blank: ${DEFAULT_STALE_HOURS}`}
          value={form.staleHours}
          onChange={(staleHours) => set({ staleHours })}
          mark="stale-hours"
        />
        <PanelMessage message={message} />
      </Box>
    </FieldGroup>
  )
}
