import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
// A task's Waits on or Blocks list: a bulleted list, one task per item, each
// task a link that opens it. The one list part for task details, the Graph's
// side panel and the Graph's item modal. An empty list draws nothing.
export interface EdgeItem {
  id: string
  // The link text: the task's title, or its id.
  text: string
  // Muted text after the link, such as "met" or "waiting".
  note?: string
  // The edge is met: the link is struck through.
  met?: boolean
}

export function EdgeList(props: { label: string; items: EdgeItem[]; onOpen: (id: string) => void }) {
  if (props.items.length === 0) return null
  return (
    <Box as="ul" css-list-style="disc" m0 flex flexCol gap="1" pl="5" size="sm" aria-label={props.label} data-edge-list={props.label}>
      {props.items.map((item) => (
        <li key={item.id} data-edge-item={item.id}>
          <button
            type="button"
            className="cursor-pointer text-left underline"
            style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', font: 'inherit', ...(item.met ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}) }}
            onClick={() => props.onOpen(item.id)}
          >
            {item.text}
          </button>
          {item.note && <Hint size="xs"> {item.note}</Hint>}
        </li>
      ))}
    </Box>
  )
}
