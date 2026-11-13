// Long lists show PAGE rows, then a button that adds PAGE more. One
// constant for every list on the page. Kept free of JSX so node can test it.
export const PAGE = 100

// How many of `total` rows show after `pages` clicks' worth.
export const visibleCount = (pages: number, total: number) => Math.min(total, Math.max(1, pages) * PAGE)

export const moreLabel = (left: number) => `Show ${Math.min(PAGE, left)} more (${left} left)`
