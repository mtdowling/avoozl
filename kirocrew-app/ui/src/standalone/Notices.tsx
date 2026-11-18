// Shows a browser notice for each new Needs you item while the page is open
// and notices are on (SW8.2). It renders nothing.
import { useEffect } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { readPageState } from '../workspace-api.ts'
import { NOTICES_CHANGED, NOTICE_INTERVAL_MS, noticeText, noticesOn, takeNew, type NeedsYouItem } from '../notices.ts'
import { navigate } from './host.ts'

export function Notices() {
  const api = useAppApi()
  useEffect(() => {
    let timer = 0
    let live = true
    const read = async () => {
      const workspaceId = readPageState(window.localStorage).workspaceId
      if (!noticesOn(window.localStorage) || !workspaceId || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      try {
        const reply = await api.post<{ result: { items?: NeedsYouItem[] } }>('/apps/avoozl/api/command', { operation: 'conflicts.view', input: {}, workspaceId })
        if (!live) return
        for (const item of takeNew(window.localStorage, reply.result.items ?? [])) {
          const shown = new Notification(noticeText(item.title) || 'Avoozl needs you', { tag: item.id })
          shown.onclick = () => {
            window.focus()
            navigate('/apps/avoozl')
          }
        }
      } catch {
        // The next read tries again.
      }
    }
    const start = () => {
      window.clearInterval(timer)
      if (noticesOn(window.localStorage)) {
        void read()
        timer = window.setInterval(() => void read(), NOTICE_INTERVAL_MS)
      }
    }
    start()
    window.addEventListener(NOTICES_CHANGED, start)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener(NOTICES_CHANGED, start)
    }
  }, [api])
  return null
}
