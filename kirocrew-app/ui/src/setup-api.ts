// What Home says to set up first. A card that used to hide when nothing was
// there is one of these instead: it says what is missing and gives the button
// that fixes it. Kept free of JSX so node can test it directly.

export interface SetupFacts {
  repositories: number
  // Repositories whose effective coder is Issue Radar.
  radarRepositories: number
  // Crews Issue Radar reported, or null when Avoozl cannot read them.
  radarCrews: number | null
  plans: number
  driver: 'running' | 'idle' | 'none' | 'unknown'
}

export type SetupId = 'repository' | 'driver' | 'epics' | 'crew'

export interface SetupCardData {
  id: SetupId
  title: string
  line: string
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
  if (facts.plans === 0)
    cards.push({
      id: 'epics',
      title: 'No epics',
      line: 'An epic is a goal that needs many changes in order. Start one in Spec Builder.',
      action: 'Plan an epic',
    })
  if (facts.radarRepositories > 0 && (facts.radarCrews === null || facts.radarCrews === 0))
    cards.push({
      id: 'crew',
      title: facts.radarCrews === null ? 'No Radar crew seen for this repo' : 'No Radar crew for this repo',
      line: 'Issue Radar crews code the issues Avoozl releases. Copy the values, then create a crew in Radar.',
      action: 'Copy values for Radar',
    })
  return cards
}
