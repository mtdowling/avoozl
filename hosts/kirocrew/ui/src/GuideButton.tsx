// A Settings button that opens a guide bundled into the UI (a `?raw` doc
// import) in the full-file reader: Plugin guide, Content rules guide.
import { useState } from 'react'
import { DocumentReader } from './DocumentReader.tsx'
import { BookOpen } from './icons.ts'
import { IconLabel } from './ui/controls.tsx'

export function GuideButton(props: { workspaceId: string; document: string; text: string; tooltip: string; label: string }) {
  const { workspaceId, document, text, tooltip, label } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconLabel icon={BookOpen} tooltip={tooltip} onClick={() => setOpen(true)}>
        {label}
      </IconLabel>
      {open ? <DocumentReader workspaceId={workspaceId} target={{ document, lineStart: null, lineEnd: null }} text={text} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
