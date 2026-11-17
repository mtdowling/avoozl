// The side panel's pure rules (rc-8.3, design D10). The host gives a panel tab
// no props, so the panel reads its chat from the chat page's URL.
// shortcut: this relies on the host's URL shape (/chat?sid=<slot> or
// /embed/chat/<slot>) and slot names (spec-builder-<name>[-<8 hex>],
// crew-<id>); test/panel-chat.test.mjs fails when they change. Switch to the
// SDK if it ever passes the chat key.
export type PanelChat =
  | { kind: 'spec-builder'; spec: string }
  | { kind: 'crew'; crew: string }
  | { kind: 'avoozl' }
  | { kind: 'other' }

export function currentChat(loc: Pick<Location, 'pathname' | 'search'>): string {
  const sid = new URLSearchParams(loc.search).get('sid')
  if (sid) return sid
  const match = /\/embed\/chat\/([^/?#]+)/.exec(loc.pathname)
  return match ? decodeURIComponent(match[1]) : ''
}

export function classifyChat(chat: string, known: { specs: string[] }): PanelChat {
  // The longest name wins, so `demo-two` is not taken for `demo`.
  const spec = [...known.specs]
    .sort((a, b) => b.length - a.length)
    .find((name) => chat === `spec-builder-${name}` || new RegExp(`^spec-builder-${escape(name)}-[0-9a-f]{8}$`).test(chat))
  if (spec) return { kind: 'spec-builder', spec }
  if (chat.startsWith('crew-') && chat.length > 5) return { kind: 'crew', crew: chat.slice(5) }
  if (chat.startsWith('avoozl_')) return { kind: 'avoozl' }
  return { kind: 'other' }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// RC8.3: opens by itself only in a Spec Builder chat with an unapproved
// tasks.md. The host has no call that lets an app open its tab, so this is
// the rule the panel states and a host that offers one can use.
export function opensItself(chat: PanelChat, spec: { files: string[]; approved: boolean }): boolean {
  return chat.kind === 'spec-builder' && spec.files.includes('tasks.md') && !spec.approved
}
