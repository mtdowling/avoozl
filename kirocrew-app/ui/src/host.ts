// The host SDK's hooks as every view uses them. Outside Demo mode they are
// the host's own. In Demo mode (design §6.11) host calls pass guardApi, and
// Open chat only says what it would do, so no view can start a session.
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react'
import { useAppApi as useHostApi, useChatLauncher as useHostChat, useNavigate } from '@kirocrew/app-sdk'
import { CHAT_PREVIEW, guardApi } from './demo-api.ts'

export { useNavigate }

export interface DemoGuard {
  active: boolean
  // Shows one preview sentence on the page.
  notice(text: string): void
}

const DemoGuardContext = createContext<DemoGuard>({ active: false, notice: () => undefined })

export function DemoGuardProvider(props: { value: DemoGuard; children: ReactNode }) {
  return createElement(DemoGuardContext.Provider, { value: props.value }, props.children)
}

export const useDemoGuard = () => useContext(DemoGuardContext)

export function useAppApi() {
  const api = useHostApi()
  const { active, notice } = useDemoGuard()
  return useMemo(() => (active ? guardApi(api, notice) : api), [api, active, notice])
}

export function useChatLauncher() {
  const host = useHostChat()
  const { active, notice } = useDemoGuard()
  const openChat = host.openChat
  return useMemo(() => (active ? { openChat: () => notice(CHAT_PREVIEW) } : { openChat }), [active, notice, openChat])
}
