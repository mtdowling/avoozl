---
category: Planning
---

# Requirements: the page draws with components, not class strings

## Introduction

The Avoozl page draws with Kiro Crew's components where one fits, and with a
small set of Avoozl's own components everywhere else. Class names, inline
styles and CSS variables are written only in `hosts/kirocrew/ui/src/ui/`.

### What this builds on

- `.kiro/specs/standalone-web/` builds the same page on Kiro Crew's own
  parts at a pin. One folder of styled components keeps its class check and
  its content security policy small.
- Requirement 92.12 of `.kiro/specs/avoozl/`: a screen change needs phone
  and desktop, light and dark screenshots for the owner's approval before
  it merges. Screenshots are never committed (AGENTS.md).

### Scope

- Every view under `hosts/kirocrew/ui/src`, including the side panel.

### Out of scope

- New screens, new behavior, or a redesign.
- Kiro Crew's own pages and components. Avoozl changes none of them.
- The page's text.

### Words

| Word | Meaning |
| --- | --- |
| Kiro Crew part | A component Kiro Crew exports from `@kirocrew/app-sdk/ui` |
| Avoozl part | A component in `hosts/kirocrew/ui/src/ui/` |
| View | Any other file under `hosts/kirocrew/ui/src` that renders |
| Raw style | A `className` or `style` written in a view, a `<style>` element a view renders, or a `var(--` string in a view |

## Requirements

### Requirement UC1: Kiro Crew's part where one fits

**User story:** As the owner, I want the page to use Kiro Crew's documented
components, so that it matches Kiro Crew and depends on Kiro Crew's
supported surface.

#### Acceptance criteria

1. The page SHALL use Kiro Crew's `Btn`, `Card`, `Badge`, `Toggle`,
   `EmptyState`, `SegmentedControl` and `Input`.
2. A Kiro Crew part SHALL be imported only through the page's own module of
   that name in `src/ui/`, which wraps or re-exports it, as `Badge.tsx` and
   `Btn.tsx` wrap `Badge` and `Btn`. A change of Kiro Crew's part then
   reaches the page through one file. A source test holds that no view
   imports `@kirocrew/app-sdk/ui`.
3. Where Kiro Crew's part lacks something the page needs, the page SHALL keep
   its own version in `src/ui/`: `Modal`, `Markdown`, `SelectField`,
   `InfoTip` in `controls.tsx`, `Field` and `FieldGroup`.
4. `hosts/kirocrew/ui/src/kirocrew-app-sdk.d.ts` SHALL declare every Kiro Crew
   part the page uses, with the props Kiro Crew documents.

### Requirement UC2: A small set of Avoozl parts for the rest

**User story:** As the maintainer, I want the patterns every view repeats to
be components, so that a change of look is one edit.

#### Acceptance criteria

1. `hosts/kirocrew/ui/src/ui/` SHALL hold the Avoozl parts, each named for
   what it is on the page, not for its classes. They SHALL include: the
   layout and text element `Box`, muted text (`Hint`), an error line
   (`ErrorText`), a vertical stack with a gap (`Stack`), a wrapping row with
   a gap (`Row`), a field with its label, help and default line (`Field`), a
   titled group of fields (`FieldGroup`), and a link styled as text
   (`TextLink`).
2. The shared parts `Button.tsx`, `Badge.tsx`, `Tabs.tsx`, `Tooltip.tsx`,
   `RadioFold.tsx`, `PairedCards.tsx` and `controls.tsx` SHALL live in
   `src/ui/`.
3. An Avoozl part SHALL take props for what varies (a size, a tone, a gap
   from a fixed scale), not a `className` or `style` from its caller. `Box`
   takes its look props from the fixed tables in `src/ui/box.json`.
4. `Hint`, `ErrorText`, `Stack`, `Row` and `TextLink` SHALL each have a test
   that renders it in light and dark
   (`hosts/kirocrew/ui/test/ui-parts.test.ts`).

### Requirement UC3: Views write no raw style

**User story:** As the maintainer, I want a test to keep raw styles out of
views, so that the page does not slide back.

#### Acceptance criteria

1. A test SHALL fail when a view writes a raw style that is not in an
   allow-list. The list SHALL name each file with its count, and SHALL only
   shrink: a change that adds to a file's count fails.
2. When a view reaches zero, it SHALL leave the list, and the test SHALL
   then hold it at zero. The list is empty, so every view is held at zero.
3. A view SHALL NOT write a CSS variable. Only `src/ui/` SHALL.
4. The page's `<style>` elements SHALL live in `src/ui/`, each a constant
   text, so the standalone page's content security policy can list them by
   hash (`standalone-web`, SW2.5).

### Requirement UC4: The class check runs against Kiro Crew's stylesheet

**User story:** As the owner, I want to know before a merge when the page
uses a class Kiro Crew's stylesheet does not have, so that nothing goes
missing quietly inside Kiro Crew.

#### Acceptance criteria

1. `hosts/kirocrew/ui/test/host-classes.test.ts` SHALL run on every test
   run, with no skip, against the Kiro Crew stylesheet that
   `hosts/kirocrew/ui/test/kirocrew-css.json` names by release, package and
   digest. A stylesheet with another digest SHALL be refused.
2. The test SHALL name each missing class with the files that use it. The
   classes the stylesheet lacks SHALL be listed in
   `host-classes-known.json`, and the list SHALL only shrink.
3. A class that only `src/ui/` uses and that Kiro Crew lacks SHALL be defined
   in `src/ui/` as a style rule of that part, not added to a view.
