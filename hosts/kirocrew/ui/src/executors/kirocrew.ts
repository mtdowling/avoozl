import type { AppApi } from '@kirocrew/app-sdk'

// The chat's project folder, from Kiro Crew's slot list, or null when the
// host refuses the read or the chat is not listed.
// shortcut: Kiro Crew gives a panel tab no project folder, and its app grant
// matches path prefixes only, so this needs `/api/chat/slots` in app.json's
// permissions.api, which reaches every chat. Without that grant the read is
// refused and the folder rule is skipped. Switch to an SDK call that names
// the panel's own chat folder if Kiro Crew adds one.
export async function chatProject(api: AppApi, chat: string): Promise<string | null> {
  if (!chat) return null
  try {
    const rows = await api.get<{ key?: string; project?: string }[]>('/api/chat/slots')
    const row = (Array.isArray(rows) ? rows : []).find((item) => item.key === chat)
    return typeof row?.project === 'string' && row.project ? row.project : null
  } catch {
    return null
  }
}
