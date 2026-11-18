# Tasks: the page draws with components, not class strings

Status: Approved

Explicit `after` lists and the manifest's `requires` govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`UC1` to `UC5`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; run `npm test`, `npm run
test:ui` and `git diff --check` before landing; change no behavior and no
text; lower the task's files in the raw-style allow-list in the same change.
A task that changes a screen gives the owner screenshots of each view it
touched at 390 and 1280 px, light and dark, before and after, taken in Kiro
Crew (UC5.2, R92.12); screenshots are shown to the owner and never
committed (AGENTS.md).

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `uc-` so they never collide with the IDs
of the other specs.

## Phase 1: Stop the growth

- [x] uc-1.1 The raw-style test with today's counts [UC3.1, UC3.2, UC3.3] (§D4)
  - `kirocrew-app/ui/test/raw-style.test.mjs` and `raw-style-allow.json`, counting `className`, `style`, `<style>` and `var(--` per view outside `src/ui/`.
  - Done when: The test passes on today's views; it fails on a planted extra `className` in a listed view, on any raw style in a new view, and on a listed file whose count is zero.
  - Built: PR #614.
- [x] uc-1.2 The class check runs in CI against Kiro Crew's own stylesheet [UC4] (§D5)
  - A Kiro Crew stylesheet named by release and digest, fetched and cached by the test; `host-classes.test.mjs` runs on every change to `kirocrew-app/ui/src` with no skip.
  - Done when: The test fails on a planted class Kiro Crew's stylesheet lacks and names the file that uses it; a stylesheet with the wrong digest is refused; the CI classifier selects the test for a change under `kirocrew-app/ui/src`; every class it finds missing today is listed in the pull request with its files.
  - Built: PR #615.

## Phase 2: The parts that remove the most strings

- [x] uc-2.1 `Hint`, `ErrorText`, `Stack`, `Row` and `TextLink`, after uc-1.1 [UC2.1, UC2.3, UC2.4] (§D2)
  - The five parts in `src/ui/`, each with a light and dark render test; the views that use the strings of D2 most move first, and the allow-list drops by what they removed.
  - Done when: The five render tests pass; the raw-style count across views drops by at least 600; the page tests pass with assertions unchanged; screenshots go to the owner.
  - Built: PR #620.
- [ ] uc-2.2 Move the shared parts into `src/ui/`, after uc-1.1 [UC1.2, UC2.2] (§D1)
  - `Button.tsx`, `Badge.tsx`, `Tabs.tsx`, `Tooltip.tsx`, `RadioFold.tsx`, `PairedCards.tsx` and the components of `controls.tsx` move; one module per Kiro Crew part in use re-exports it.
  - Done when: No view imports `@kirocrew/app-sdk/ui` directly, checked by a source test; the page renders the same, checked by the existing page tests with assertions unchanged.

## Phase 3: Kiro Crew's parts

- [ ] uc-3.1 `Select` and `Toggle` for the raw controls, after uc-2.2 [UC1.1, UC1.4] (§D3)
  - The 19 `<select>` and the checkbox `<input>` elements move to Kiro Crew's `Select` and `Toggle`; their declarations join `kirocrew-app-sdk.d.ts`.
  - Done when: No view renders a raw `<select>` or checkbox; each moved control keeps its label, its `aria-describedby` and its keyboard behavior, checked by test; differences found are listed in the pull request; screenshots go to the owner.
- [ ] uc-3.2 `Modal`, after uc-2.2 [UC1.1, UC1.3] (§D3)
  - Compare `Modal.tsx` with Kiro Crew's `Modal` on focus, Escape and the footer order the tests hold; swap, or keep Avoozl's in `src/ui/` with the owner's decision recorded.
  - Done when: The modal tests pass with assertions unchanged, or each changed one is listed with the reason; screenshots of three dialogs go to the owner.
- [ ] uc-3.3 `InfoTip`, `PageHeader`, `CardTitle`, `StatCard` and `ErrorNotice`, after uc-2.2 [UC1.1, UC1.3, UC1.4] (§D3)
  - Each replaces the page's own version where one exists; the touch behavior of `InfoTip` is compared first.
  - Done when: The tooltip and heading tests pass with assertions unchanged, or each changed one is listed; Home's tiles use `StatCard`; screenshots go to the owner.
- [ ] uc-3.4 `MarkdownRenderer`, after uc-2.2 [UC1.1, UC1.3] (§D3)
  - Compare with `Markdown.tsx` on code highlighting, outside links and the size cap; swap, or keep Avoozl's with the owner's decision recorded.
  - Done when: The markdown tests pass with assertions unchanged, or each changed one is listed; screenshots of a spec page and a task drawer go to the owner.

## Phase 4: Settings and the rest of the views

- [ ] uc-4.1 Settings onto `Field` and `FieldGroup`, after uc-2.1, uc-3.1 [UC2.1, UC2.2] (§D2)
  - Every Settings page and settings dialog uses the two parts, built on Kiro Crew's `Settings*` parts where they fit.
  - Done when: The settings tests pass with assertions unchanged; no Settings view is left in the allow-list; screenshots of every Settings page go to the owner.
- [ ] uc-4.2 The remaining views, after uc-2.1, uc-2.2, uc-3.1, uc-3.2, uc-3.3, uc-3.4 [UC3, UC5] (§D6)
  - The views left in the allow-list move a group at a time, each group its own pull request; the 23 `<style>` elements move into `src/ui/` as constant texts.
  - Done when: The allow-list is empty; no view writes a `className`, `style`, `<style>` or `var(--`; the class check passes; screenshots of every view at 390 and 1280 px, light and dark, go to the owner.

- [ ] uc-p1 Proof: a change of look is one edit, after uc-1.2, uc-4.1, uc-4.2 [UC1 to UC5] (§D1)
  - Setup: the repository at the commit that lands uc-4.2, and a running Kiro Crew at the pinned release.
  - Action: (1) change `Hint`'s size and color in `src/ui/` only; (2) rename one CSS variable in a scratch copy of Kiro Crew's stylesheet and run the class check against it; (3) count the files that write a class or a variable.
  - Expected: (1) every hint on every view changes, and no view file changed; (2) the check fails naming only files in `src/ui/`; (3) every such file is in `src/ui/`.
  - Failure means: a view still carries its own look.
  - Next decision: none.
  - Done when: Expected result observed; receipt under `docs/evidence/`, with no image committed.
