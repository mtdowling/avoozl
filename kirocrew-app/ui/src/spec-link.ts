// How a Needs you item opens its spec on the Specs page. App.tsx provides it;
// the item views only call it, so they import no page.
import { createContext, useContext } from 'react'

export const SpecLinkContext = createContext<((planId: string) => void) | null>(null)

export const useOpenSpec = () => useContext(SpecLinkContext)
