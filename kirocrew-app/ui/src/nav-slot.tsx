// A page's own controls drawn in the left nav, under its open section, as
// Radar's rail holds its filters (Specs and Activity filters). The nav marks
// a place for each section with a slot (NavAccordion's data-nav-slot); the
// page portals its controls there, so their state stays in the page. With
// the nav collapsed to its thin bar there is no room, and the controls show
// in the page instead. On a phone they are in the menu.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SlotHost {
  register: (key: string, el: HTMLElement | null) => void
  slots: Record<string, HTMLElement | null>
  // The nav is the thin bar: no slot, controls go in the page.
  inline: boolean
  setInline: (inline: boolean) => void
}

const SlotContext = createContext<SlotHost | null>(null)

export function NavSlotProvider(props: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({})
  const [inline, setInline] = useState(false)
  const register = useCallback((key: string, el: HTMLElement | null) => {
    setSlots((had) => (had[key] === el ? had : { ...had, [key]: el }))
  }, [])
  const value = useMemo(() => ({ register, slots, inline, setInline }), [register, slots, inline])
  return <SlotContext.Provider value={value}>{props.children}</SlotContext.Provider>
}

export const useNavSlotHost = () => useContext(SlotContext)

// `section` is the nav section's key ('plans', 'activity').
export function NavSlotFor(props: { section: string; children: ReactNode }) {
  const host = useContext(SlotContext)
  // Outside the app shell (a test page with no nav): in place.
  if (!host || host.inline) return <>{props.children}</>
  const el = host.slots[props.section]
  return el ? createPortal(props.children, el) : null
}
