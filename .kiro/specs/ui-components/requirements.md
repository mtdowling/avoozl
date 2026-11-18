---
category: Planning
---

# Requirements: the page draws with components, not class strings

Status: Approved

## Introduction

The Avoozl page uses six of the 27 components Kiro Crew documents for apps,
draws its own versions of several others, and writes most of its look as
class strings and inline styles in each view. This spec moves the page onto
Kiro Crew's components wherever one exists, and onto a small set of
Avoozl's own components everywhere else, so that class names and CSS
variables are written in one folder.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later. Nothing in it changes code until its
tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `05474af`; or **A**, assumed and not checked, with the reason.

### Why

- Kiro Crew documents 27 components in `@kirocrew/app-sdk/ui` (V: "Shared
  UI Components" in Kiro Crew's `docs/app-kit/getting-started.md`, release
  0.12.2). The page imports six: `Btn`, `Card`, `Input`, `EmptyState`,
  `SegmentedControl` and `Badge` (V: the module declaration in
  `kirocrew-app/ui/src/kirocrew-app-sdk.d.ts` and the imports under
  `kirocrew-app/ui/src`).
- Where Kiro Crew has a component, the page often draws its own:

  | Kiro Crew documents           | The page has                                                  |
  | ----------------------------- | ------------------------------------------------------------- |
  | `Modal`                       | `Modal.tsx`, 206 lines (V)                                    |
  | `Select`                      | 19 raw `<select>` (V)                                         |
  | `Toggle`                      | checkboxes among 49 raw `<input>` (V)                         |
  | `InfoTip`                     | its own `InfoTip` in `controls.tsx` (V)                       |
  | `StatCard`                    | its own Home tiles (A: read from the page, not traced)        |
  | `PageHeader`, `CardTitle`     | `SectionHeading`, `ViewHeading` in `controls.tsx` (V)         |
  | `ErrorNotice`                 | `text-sm text-danger` written 64 times, `text-xs text-danger` 28 (V) |
  | `MarkdownRenderer`            | `Markdown.tsx`, 171 lines (V)                                 |
  | `SettingsSection`, `SettingsCard`, `SettingsInput`, `SettingsToggle`, `SettingsSelect` | `FormSection.tsx`, `FieldBox.tsx`, `FieldRow.tsx` (V) |
  | `Btn`                         | 109 raw `<button>` beside 107 uses of `Btn` (V)               |

- The look is spread over every view: 2,383 `className` attributes with 631
  distinct strings, 820 inline style objects and 882 uses of a CSS variable,
  in 121 view files (V: counted under `kirocrew-app/ui/src`). A few strings
  carry most of it: the three muted-text strings `text-xs text-muted`,
  `text-muted` and `text-sm text-muted` appear 497 times, and
  `flex flex-col gap-N` about 180 (V).
- Inside Kiro Crew a utility class works only when Kiro Crew's own pages use
  it, because Kiro Crew's stylesheet is generated from its own sources (V:
  the `@source` lines of Kiro Crew's `website/src/index.css`). The check for
  this, `kirocrew-app/ui/test/host-classes.test.mjs`, is skipped unless
  `KIROCREW_HOST_CSS` is set (V). With 631 distinct strings in 121 files,
  nothing stops a view from using a class that does nothing inside Kiro
  Crew.

### What this builds on

- `.kiro/specs/standalone-web/` builds the same page on Kiro Crew's own
  parts at a pin. Fewer classes and one folder of styled components make its
  class check and its pin moves smaller. Neither spec waits on the other.
- Requirement 92.12 of `.kiro/specs/avoozl/`: a screen change needs phone
  and desktop, light and dark screenshots for the owner's approval before
  it merges. Screenshots are never committed (AGENTS.md).

### Scope

- Every view under `kirocrew-app/ui/src`, including the side panel.

### Out of scope

- New screens, new behavior, or a redesign. A view looks the same after its
  move, except where Kiro Crew's component draws a thing differently from
  Avoozl's own (UC2.3).
- Kiro Crew's own pages and components. Avoozl changes none of them.
- The page's text.

### Words

| Word              | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Kiro Crew part    | One of the 27 components Kiro Crew documents in `@kirocrew/app-sdk/ui`                    |
| Avoozl part       | A component in `kirocrew-app/ui/src/ui/`, the folder this spec adds                       |
| View              | Any other file under `kirocrew-app/ui/src` that renders                                   |
| Raw style         | A `className` or `style` written in a view, or a `<style>` element a view renders        |

## Requirements

### Requirement UC1: Kiro Crew's part where one exists

**User story:** As the owner, I want the page to use Kiro Crew's documented
components, so that it matches Kiro Crew and depends on Kiro Crew's
supported surface.

#### Acceptance criteria

1. Where a Kiro Crew part does what a view needs, the view SHALL use it:
   `Modal`, `Select`, `Toggle`, `InfoTip`, `StatCard`, `PageHeader`,
   `CardTitle`, `ErrorNotice`, `MarkdownRenderer`, `Skeleton`,
   `SearchInput` and the `Settings*` parts, as well as the six in use.
2. A Kiro Crew part SHALL be imported only through the page's own module of
   that name in `src/ui/`, which re-exports it, as `Badge.tsx` and
   `Button.tsx` already wrap `Badge` and `Btn` (V). A change of Kiro Crew's
   part then reaches the page through one file.
3. Where Avoozl's version does something the Kiro Crew part does not, the
   task SHALL say what in its pull request and either keep Avoozl's version
   in `src/ui/` or give up the difference; the owner decides which on the
   screenshots.
4. `kirocrew-app/ui/src/kirocrew-app-sdk.d.ts` SHALL declare every Kiro Crew
   part the page uses, with the props Kiro Crew documents.

### Requirement UC2: A small set of Avoozl parts for the rest

**User story:** As the maintainer, I want the patterns every view repeats to
be components, so that a change of look is one edit.

#### Acceptance criteria

1. `kirocrew-app/ui/src/ui/` SHALL hold the Avoozl parts. Each SHALL be
   named for what it is on the page, not for its classes, and the first set
   SHALL cover: muted and small text (`Hint`), an error line (`ErrorText`,
   built on `ErrorNotice` where it fits), a vertical stack with a gap
   (`Stack`), a wrapping row with a gap (`Row`), a field with its label,
   help and default line (from `FieldRow.tsx`), a titled group of fields
   (from `FormSection.tsx` and `FieldBox.tsx`), and a link styled as text.
2. The existing shared parts (`Button.tsx`, `Badge.tsx`, `Tabs.tsx`,
   `Tooltip.tsx`, `RadioFold.tsx`, `PairedCards.tsx` and the components in
   `controls.tsx`) SHALL move into `src/ui/` or be replaced by a Kiro Crew
   part.
3. An Avoozl part SHALL take props for what varies (a size, a tone, a gap
   from a fixed scale), not a `className` or `style` from its caller. A
   part MAY accept `className` only for layout inside its parent (width,
   grid placement), and SHALL say so in its type.
4. Each Avoozl part SHALL have one test that renders it in light and dark.

### Requirement UC3: Views write no raw style

**User story:** As the maintainer, I want a test to keep raw styles out of
views, so that the move does not slide back.

#### Acceptance criteria

1. A test SHALL fail when a view writes a raw style that is not in an
   allow-list. The list SHALL name each file with its count, and SHALL only
   shrink: a change that adds to a file's count fails.
2. When a view reaches zero, it SHALL leave the list, and the test SHALL
   then hold it at zero.
3. A view SHALL NOT write a CSS variable. Only `src/ui/` SHALL.
4. The `<style>` elements views render today (23, V) SHALL move into
   `src/ui/`, each a constant text, so the standalone page's content
   security policy can list them by hash (`standalone-web`, SW2.5).

### Requirement UC4: The class check runs, against Kiro Crew's own stylesheet

**User story:** As the owner, I want to know before a merge when the page
uses a class Kiro Crew's stylesheet does not have, so that nothing goes
missing quietly inside Kiro Crew.

#### Acceptance criteria

1. CI SHALL run `host-classes.test.mjs` on every change to
   `kirocrew-app/ui/src`, against a stylesheet built from Kiro Crew's own
   stylesheet source at the `standalone-web` pin, with only Kiro Crew's
   sources scanned. It SHALL NOT be skipped.
2. Until the pin's fetch exists (`standalone-web`, sw-1.2), the test SHALL
   run against a Kiro Crew stylesheet named in the repository by release
   and digest, fetched by the test the same way.
3. The test SHALL name each missing class with the files that use it. A
   class that only `src/ui/` uses and that Kiro Crew lacks SHALL be defined
   in `src/ui/` as a style rule of that part, not added to a view.

### Requirement UC5: Moved in small steps, each approved

**User story:** As the owner, I want the move made view by view, so that
each change is small enough to look at.

#### Acceptance criteria

1. Each task SHALL move one Kiro Crew part into use, one Avoozl part into
   being, or one group of views onto them, and SHALL change no behavior.
2. Each task that changes a screen SHALL give the owner screenshots of the
   views it touched, at 390 and 1280 px, light and dark, before and after,
   in Kiro Crew at the release `kirocrew-app/app.json` names in
   `minKiroCrewVersion` or later (R92.12).
3. The existing page tests SHALL pass with their assertions unchanged,
   except where a test reads a class or an element that a Kiro Crew part
   replaces; such a test SHALL be changed to read the part's role, label or
   `data-` attribute, and the pull request SHALL list it.
