// What Home says to set up first. A card that used to hide when nothing was
// there is one of these instead: it says what is missing and, where a button
// fixes it, gives that button. Kept free of JSX so node can test it directly.

export interface SetupFacts {
  repositories: number
  plans: number
  driver: 'running' | 'idle' | 'none' | 'unknown'
}

export type SetupId = 'repository' | 'driver' | 'epics'

export interface SetupCardData {
  id: SetupId
  title: string
  line: string
  // Empty when the line is the whole card: no button of its own.
  action: string
}

// In the order a person sets things up. Each appears only while it is true.
export function setupCards(facts: SetupFacts): SetupCardData[] {
  const cards: SetupCardData[] = []
  if (facts.repositories === 0)
    cards.push({
      id: 'repository',
      title: 'No repository yet',
      line: 'Avoozl needs one repository to plan epics for. Add it, then run the checks.',
      action: 'Add a repo',
    })
  if (facts.driver === 'none')
    cards.push({
      id: 'driver',
      title: 'No driver session',
      line: 'Nothing is released and nobody watches merges until a driver session runs.',
      action: 'Start a driver session',
    })
  // No button: New spec on Specs is the one way to start one.
  if (facts.plans === 0)
    cards.push({
      id: 'epics',
      title: 'No epics',
      line: 'No epics yet. Start one with New spec on Specs.',
      action: '',
    })
  return cards
}
