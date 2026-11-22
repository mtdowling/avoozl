---
repo: avoozl
---
# Tasks: the page draws with components, not class strings

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`UC1` to `UC4`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`.

A task that changes a screen gives the owner screenshots of each view it
touched at 390 and 1280 px, light and dark, before and after (R92.12);
screenshots are shown to the owner and never committed (AGENTS.md).

Task IDs start with `uc-` so they never collide with the IDs
of the other specs.

## Phase 1: Stop the growth

- [x] `uc-1.1` The raw-style test [UC3.1, UC3.2, UC3.3] (§D4)
  - The test fails on a planted extra `className` in a listed view, on any raw style in a view not on the list, and on a listed file whose count is zero.
  - `hosts/kirocrew/ui/test/raw-style.test.ts` and `raw-style-allow.json`, counting `className`, `style`, `<style>` and `var(--` per view outside `src/ui/`.
- [x] `uc-1.2` The class check runs against Kiro Crew's own stylesheet [UC4] (§D5)
  - The test fails on a planted class Kiro Crew's stylesheet lacks and names the file that uses it; a stylesheet with the wrong digest is refused.
  - A Kiro Crew stylesheet named by release and digest in `kirocrew-css.json`, fetched and cached by `kirocrew-css.ts`; `host-classes.test.ts` runs with no skip.

## Phase 2: The parts that remove the most strings

- [x] `uc-2.1` `Hint`, `ErrorText`, `Stack`, `Row` and `TextLink`, after uc-1.1 [UC2.1, UC2.3, UC2.4] (§D2)
  - The five render tests in `ui-parts.test.ts` pass in light and dark; the page tests pass.
  - The five parts in `src/ui/`; the views use them in place of the class strings.
- [x] `uc-2.2` Move the shared parts into `src/ui/`, after uc-1.1 [UC1.2, UC2.2] (§D1)
  - No view imports `@kirocrew/app-sdk/ui` directly, checked by `ui-imports.test.ts`; the existing page tests pass.
  - `Button.tsx`, `Badge.tsx`, `Tabs.tsx`, `Tooltip.tsx`, `RadioFold.tsx`, `PairedCards.tsx` and `controls.tsx` live in `src/ui/`; one module per Kiro Crew part in use wraps it.

## Phase 3: Kiro Crew's parts

- [x] `uc-3.1` `SelectField` and `Toggle` for the raw controls, after uc-2.2 [UC1.1, UC1.3, UC1.4] (§D3)
  - No view renders a raw `<select>` or checkbox; each moved control keeps its label, its `aria-describedby` and its keyboard behavior, checked by test.
  - Selects use `src/ui/SelectField.tsx`; switches use Kiro Crew's `Toggle` through `src/ui/Toggle.tsx`, declared in `kirocrew-app-sdk.d.ts`.
- [x] `uc-3.2` `Modal`, after uc-2.2 [UC1.3] (§D3)
  - The modal tests pass.
  - `src/ui/Modal.tsx` stays Avoozl's, for its focus trap, Escape and footer order.
- [x] `uc-3.3` `InfoTip` and headings, after uc-2.2 [UC1.3] (§D3)
  - The tooltip and heading tests pass.
  - `InfoTip`, `SectionHeading` and `ViewHeading` stay Avoozl's in `src/ui/controls.tsx`, for touch behavior and title alignment.
- [x] `uc-3.4` `Markdown`, after uc-2.2 [UC1.3] (§D3)
  - The markdown tests pass.
  - `src/ui/Markdown.tsx` stays Avoozl's, for code highlighting and link handling.

## Phase 4: Settings and the rest of the views

- [x] `uc-4.1` Settings onto `Field` and `FieldGroup`, after uc-2.1, uc-3.1 [UC2.1, UC2.2] (§D2)
  - The settings tests pass; no Settings view is left in the allow-list.
  - Every Settings page and settings dialog uses the two parts. Kiro Crew's `Settings*` parts have no slot for the page's own control, marker, reset, default line, width or `aria-describedby`, so `Field` and `FieldGroup` stay Avoozl's in `src/ui/` (UC1.3).
- [x] `uc-4.2` The remaining views, after uc-2.1, uc-2.2, uc-3.1, uc-3.2, uc-3.3, uc-3.4 [UC3] (§D4)
  - The allow-list is empty; no view writes a `className`, `style`, `<style>` or `var(--`; the class check passes.
  - The page's `<style>` texts live in `src/ui/` as constants.

- [x] `uc-p1` Proof: a change of look is one edit, after uc-1.2, uc-4.1, uc-4.2 [UC1 to UC4] (§D1) (**MANUAL**)
  - Expected: (1) every hint on every view changes, and no view file changed; (2) the check fails naming only files in `src/ui/`; (3) every such file is in `src/ui/`.
  - Expected result observed; receipt at `docs/evidence/ui-components-p1.md`, with no image committed.
  - Setup: the repository at the commit that lands uc-4.2, and a running Kiro Crew at the pinned release.
  - Action: (1) change `Hint`'s size and color in `src/ui/` only; (2) rename one CSS variable in a scratch copy of Kiro Crew's stylesheet and run the class check against it; (3) count the files that write a class or a variable.
  - Failure means: a view still carries its own look.
  - Next decision: none.
