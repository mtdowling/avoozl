// Which pane of a list-and-detail page is on screen. Follows Kiro Crew's
// list-detail pattern. A desktop shows what it always did. A phone shows ONE
// pane: the list, then the detail with a Back control (ListDetailBack).
//
// `detailOpen` is explicit state, not "is something selected": a page that
// already has a selection (Settings always has an open section) must still
// open on its list. Kept free of JSX so node can test the rule directly.
import { useCallback, useMemo, useState } from 'react'
import { useMedia } from './use-media.ts'

// Under this width a page is a phone: one pane, a top rail, no resize handles.
export const PHONE = '(max-width: 767px)'

export const usePhone = () => useMedia(PHONE)

// The panes a page shows: both on a desktop, one on a phone.
export function panes(phone: boolean, detailOpen: boolean) {
  return { showList: !phone || !detailOpen, showDetail: !phone || detailOpen }
}

// `startOpen`: the page was opened onto a particular detail (a link), so a
// phone starts on it rather than on the list.
export function useListDetail(startOpen = false) {
  const phone = usePhone()
  const [detailOpen, setDetailOpen] = useState(startOpen)
  const openDetail = useCallback(() => setDetailOpen(true), [])
  const closeDetail = useCallback(() => setDetailOpen(false), [])
  return useMemo(() => ({ phone, ...panes(phone, detailOpen), openDetail, closeDetail }), [phone, detailOpen, openDetail, closeDetail])
}

export type ListDetail = ReturnType<typeof useListDetail>
