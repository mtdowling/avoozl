// The data the Radar-based screens show in demo mode. One call, `demo.fixtures`
// (src/app/demo-radar.mjs `demoFixtures`), returns all of it from the open
// sample. Everything is made up and nothing here writes anywhere.
//
// For the side panel and the app reshape:
//  - Read it with `useDemoFixtures()` (Demo.tsx). It is null when the demo is
//    off, so real screens keep their own reads and show nothing from here.
//  - The Release queue, claims and conflicts also work through their
//    own operations in the demo (`radar.releasequeue`, `radar.crews`,
//    `conflicts.view`); the fixtures repeat only what no operation gives yet:
//    machines, the epic > plan > phase rows, the drafted review, the Mirror
//    sample and the two Stop the line states.
//  - The Stop the line example is a page toggle: pick `stopLine[example]`.
//    The sample's own line never stops.
// Kept free of JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export const FIXTURES_VERSION = 1

// One Issue Radar crew. `machine` comes from Kiro Crew, not GitHub (Variant A).
export interface FixtureCrew {
  kind: 'radar-crew'
  id: string
  name: string | null
  machine: string | null
  status: 'working' | 'waiting' | 'waiting-on-you'
  repository: string
  // The issue it holds a live claim on, or null.
  issue: number | null
  // The issue it handed back, when it holds no claim.
  handedBack?: number
  title: string
  phase: string | null
  pr: number | null
  updatedAt: string | null
  url: string | null
  prUrl: string | null
}

export type PhaseGate = 'passed' | 'open' | 'closed'

export interface FixturePhase {
  id: string
  title: string
  gate: PhaseGate
  total: number
  merged: number
  // Merged, released or claimed.
  released: number
  // One reason the phase is held, or null.
  held: string | null
}

export interface FixtureEpic {
  id: string
  title: string
  plans: { id: string; title: string; phases: FixturePhase[] }[]
}

export type WaitingItem =
  | { kind: 'handback'; taskId: string; title: string; issue: number; url: string; crew: string; machine: string; question: string; label: string; since: string }
  | { kind: 'review-draft'; pr: number; title: string; url: string; since: string }
  | { kind: 'decision'; taskId: string; title: string; detail: string; since: string }

export interface ReviewDraft {
  repository: string
  pr: number
  title: string
  url: string
  author: string
  state: 'ready-to-post'
  draftedBy: string
  draftedAt: string
  verdict: 'comment'
  summary: string
  findings: { path: string; line: number | null; severity: 'should-fix' | 'nit'; text: string }[]
}

export interface FixtureMerge {
  repository: string
  pr: number
  title: string
  url: string
  mergedAt: string
  crew: string
  machine: string
}

export interface StopState {
  state: 'running' | 'stopped'
  releasing: boolean
  say: string
  reason?: string
  by?: string
  openedAt?: string
  unclaimedReadyRemoved?: number
  claimedCommented?: number
  onlyRadar?: string
}

export type MirrorState = 'to_forward' | 'blocked' | 'forwarded' | 'public_open' | 'public_merged' | 'closed_unmerged'

export interface FixtureMirror {
  // True: shape only, the sample's own repository is private and has no mirror.
  sample: true
  source: string
  mirror: string
  forwardMode: 'nudge' | 'auto'
  sync: { state: 'in-sync' | 'diverged'; checkedAt: string }
  scan: 'clean' | 'hit'
  items: { state: MirrorState; task: string; mirrorPr: number; publicPr?: number; reason: string; forward?: string }[]
}

export interface DemoFixtures {
  version: number
  generatedAt: string
  repository: string
  epics: FixtureEpic[]
  crews: FixtureCrew[]
  waitingOnYou: WaitingItem[]
  reviewDraft: ReviewDraft
  recentMerges: FixtureMerge[]
  stopLine: { example: 'running' | 'stopped'; running: StopState; stopped: StopState }
  mirror: FixtureMirror
}

export function fixturesClient(api: AppApi) {
  return {
    read: async () => (await api.post<{ result: DemoFixtures }>(COMMAND_PATH, { operation: 'demo.fixtures', input: {} })).result,
  }
}

// The Stop the line state the page shows for the current toggle.
export function stopExample(fixtures: DemoFixtures, example: 'running' | 'stopped'): StopState {
  return fixtures.stopLine[example]
}
