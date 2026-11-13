// Every z-index on the page, in one order, lowest first. Modals are not on
// this list: Modal.tsx opens a <dialog> with showModal(), which puts it on
// the browser's top layer, above any z-index here or in the host. A tooltip
// inside a modal portals into that modal, so only its own tooltips sit
// above it. The Graph draws in one SVG and has no overlay of its own.
export const LAYER = {
  // A control drawn over its neighbor: the drawer's resize handle.
  raised: 1,
  // Sticky columns: the plan view's left column.
  sticky: 10,
  // The task drawer and the New plan drawer, with their backdrops.
  drawer: 50,
  // Page tooltips, above the host's own layers too.
  tooltip: 2147483000,
} as const
