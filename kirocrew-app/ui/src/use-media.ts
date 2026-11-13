import { useEffect, useState } from 'react'

// Whether a media query matches now, kept current as it changes.
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia(query)
    const change = () => setMatch(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [query])
  return match
}
