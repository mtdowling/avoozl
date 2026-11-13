// "Ask for help": a chat-icon link that opens a Kiro Crew chat seeded with
// the page, its current settings and the guide (help-chat.ts). The draft is
// not sent, so the person reads it first. Shared by every settings and
// setup page that has one; `context` is built on click, so it carries the
// values on screen then.
import { useChatLauncher } from '@kirocrew/app-sdk'
import { MessagesSquare } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
import { HELP_LABEL, HELP_TIP, helpMessage, type HelpContext } from './help-chat.ts'

export function AskForHelp(props: { context: () => HelpContext }) {
  const { openChat } = useChatLauncher()
  return (
    <Tooltip text={HELP_TIP}>
      {(describedBy) => (
        <button
          type="button"
          data-ask-for-help
          aria-describedby={describedBy}
          onClick={() => openChat({ message: helpMessage(props.context()), autoSend: false })}
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ background: 'none', border: 'none', padding: '2px 0', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          <MessagesSquare size={14} aria-hidden="true" />
          {HELP_LABEL}
        </button>
      )}
    </Tooltip>
  )
}
