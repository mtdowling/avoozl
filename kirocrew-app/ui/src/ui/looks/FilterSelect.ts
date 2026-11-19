// Looks FilterSelect reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { LookProps } from '../Box'

// One labelled filter dropdown with an "All" choice, shared by the Graph and
// Delivery filters so both look and behave the same.
export const selectStyle = { 'css-border-color': 'border', 'css-color': 'text', 'css-background': 'card-transparent' } as const satisfies LookProps
