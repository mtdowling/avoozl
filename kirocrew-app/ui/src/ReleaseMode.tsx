// Release mode (RC4.5): Automatic, Step and Hold as one radio fold-out. Used
// in Settings > Repositories > Edit > Mode for an Issue Radar repository.
import { RadioFold } from './RadioFold.tsx'
import { MODE_TEXT, RELEASE_MODES, type ReleaseMode } from './release-api.ts'

export function ReleaseModePicker(props: { id: string; mode: string; onMode: (mode: ReleaseMode) => void }) {
  const value = (RELEASE_MODES as readonly string[]).includes(props.mode) ? (props.mode as ReleaseMode) : 'automatic'
  return (
    <div data-release-mode>
      <RadioFold<ReleaseMode>
        name={`${props.id}-release`}
        label="Release mode"
        value={value}
        onChange={props.onMode}
        sections={RELEASE_MODES.map((key) => ({
          key,
          title: MODE_TEXT[key].title,
          line: MODE_TEXT[key].line,
          description: <p className="text-sm text-muted">{MODE_TEXT[key].use}</p>,
        }))}
      />
    </div>
  )
}
