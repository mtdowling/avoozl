---
repo: avoozl
category: Planning
---

# The page draws with components, not class strings

## Requirements

### Introduction

The Avoozl page draws with Kiro Crew's components where one fits, and with a
small set of Avoozl's own components everywhere else. Class names, inline
styles and CSS variables are written only in `hosts/kirocrew/ui/src/ui/`.

#### What this builds on

- [standalone-web](../standalone-web/standalone-web.md) builds the same page on Kiro Crew's own
  parts at a pin. One folder of styled components keeps its class check and
  its content security policy small.
- Requirement 92.12 of [avoozl](../avoozl/avoozl.md): a screen change needs phone
  and desktop, light and dark screenshots for the owner's approval before
  it merges. Screenshots are never committed (AGENTS.md).

#### Scope

- Every view under `hosts/kirocrew/ui/src`, including the side panel.

#### Out of scope

- New screens, new behavior, or a redesign.
- Kiro Crew's own pages and components. Avoozl changes none of them.
- The page's text.

#### Words

| Word | Meaning |
| --- | --- |
| Kiro Crew part | A component Kiro Crew exports from `@kirocrew/app-sdk/ui` |
| Avoozl part | A component in `hosts/kirocrew/ui/src/ui/` |
| View | Any other file under `hosts/kirocrew/ui/src` that renders |
| Raw style | A `className` or `style` written in a view, a `<style>` element a view renders, or a `var(--` string in a view |


#### Requirement UC1: Kiro Crew's part where one fits

**User story:** As the owner, I want the page to use Kiro Crew's documented
components, so that it matches Kiro Crew and depends on Kiro Crew's
supported surface.

##### Acceptance criteria

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

#### Requirement UC2: A small set of Avoozl parts for the rest

**User story:** As the maintainer, I want the patterns every view repeats to
be components, so that a change of look is one edit.

##### Acceptance criteria

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

#### Requirement UC3: Views write no raw style

**User story:** As the maintainer, I want a test to keep raw styles out of
views, so that the page does not slide back.

##### Acceptance criteria

1. A test SHALL fail when a view writes a raw style that is not in an
   allow-list. The list SHALL name each file with its count, and SHALL only
   shrink: a change that adds to a file's count fails.
2. When a view reaches zero, it SHALL leave the list, and the test SHALL
   then hold it at zero. The list is empty, so every view is held at zero.
3. A view SHALL NOT write a CSS variable. Only `src/ui/` SHALL.
4. The page's `<style>` elements SHALL live in `src/ui/`, each a constant
   text, so the standalone page's content security policy can list them by
   hash (`standalone-web`, SW2.5).

#### Requirement UC4: The class check runs against Kiro Crew's stylesheet

**User story:** As the owner, I want to know before a merge when the page
uses a class Kiro Crew's stylesheet does not have, so that nothing goes
missing quietly inside Kiro Crew.

##### Acceptance criteria

1. `hosts/kirocrew/ui/test/host-classes.test.ts` SHALL run on every test
   run, with no skip, against the Kiro Crew stylesheet that
   `hosts/kirocrew/ui/test/kirocrew-css.json` names by release, package and
   digest. A stylesheet with another digest SHALL be refused.
2. The test SHALL name each missing class with the files that use it. The
   classes the stylesheet lacks SHALL be listed in
   `host-classes-known.json`, and the list SHALL only shrink.
3. A class that only `src/ui/` uses and that Kiro Crew lacks SHALL be defined
   in `src/ui/` as a style rule of that part, not added to a view.

## Design

`UC` numbers are in [Requirements](#requirements); `R` numbers are in
[avoozl requirements](../avoozl/avoozl.md#requirements); `SW` numbers in
[standalone-web requirements](../standalone-web/standalone-web.md#requirements).

### D1. Three layers

```text
views                            no className, no style, no var(--...)
   |
   v
src/ui/  Avoozl parts            the only place that writes classes and variables
   |      and wrappers of
   |      Kiro Crew parts
   v
@kirocrew/app-sdk/ui             Kiro Crew's documented components and stylesheet
```

A view composes parts. A part either wraps a Kiro Crew part by name, or is
drawn from Kiro Crew parts and a few classes and variables. When Kiro Crew
renames a class or a variable, the change is in `src/ui/`. A different look
for hints or errors is a change to one part.

### D2. Avoozl parts

| Part | Draws | Props |
| --- | --- | --- |
| `Box` | Any layout or text element | `as`, and look props from `box.json` |
| `Hint` | Muted text | `size`, and `Box`'s props |
| `ErrorText` | An error line in the danger color | `size`, `as`, `flush` |
| `Stack` | A vertical stack | `gap: 0 \| 1 \| 2 \| 3 \| 4` |
| `Row` | A wrapping row | `gap`, `wrap`, `align` |
| `TextLink` | An underlined link | the anchor's own props |
| `Field` | A settings field row | label, control, help, default line |
| `FieldGroup` | A titled group of fields | `title`, `blurb` |

`Box` turns its props into Kiro Crew's classes and one inline style, each
value named in `src/ui/box.json`, so class names and theme variables are
written in that table and nowhere else. A value joins `box.json` in the
change that needs it.

### D3. Kiro Crew parts and Avoozl's own

`src/ui/` has one module per Kiro Crew part in use, which wraps it (UC1.2):
`Btn.tsx`, `Card.tsx`, `Badge.tsx`, `Toggle.tsx`, `EmptyState.tsx`,
`SegmentedControl.tsx` and `Input.tsx`. `Badge.tsx` maps the page's five
variants onto Kiro Crew's five.

The page keeps its own version where Kiro Crew's part lacks something it
needs (UC1.3):

| Avoozl's own | Reason |
| --- | --- |
| `Modal.tsx` | Focus trap, Escape and Back, the fixed footer order the tests hold |
| `Markdown.tsx` | Code highlighting and the page's own link handling |
| `SelectField.tsx` | Kiro Crew's `Select` takes no id, `aria-describedby` or option groups |
| `InfoTip` in `controls.tsx` | Tap to open on touch |
| `Field.tsx`, `FieldGroup.tsx` | Kiro Crew's `Settings*` parts have no slot for the marker, reset, default line or `aria-describedby` |

### D4. Raw-style test (UC3)

`hosts/kirocrew/ui/test/raw-style.test.ts` parses each view and counts
`className` and `style` attributes, `<style>` elements and `var(--` strings
outside `src/ui/` and `src/standalone/`. The allow-list,
`hosts/kirocrew/ui/test/raw-style-allow.json`, maps each file to its count.
The test fails when a file's count rises, when a file not on the list has
any, and when a file at zero is still listed. The list is empty.

The page's `<style>` texts are constants in `src/ui/PageStyles.tsx` and the
parts that need one, so the standalone page can hash each (SW2.5).

### D5. Class check (UC4)

`hosts/kirocrew/ui/test/kirocrew-css.json` names a Kiro Crew release, its
published wheel, the stylesheet inside it and that stylesheet's SHA-256.
`hosts/kirocrew/ui/test/kirocrew-css.ts` reads that one file out of the wheel
with HTTP range requests, checks the digest and caches it in the temporary
directory.

`host-classes.test.ts` compares the classes the page's `.tsx` files use with
that stylesheet and fails on any class it lacks that
`host-classes-known.json` does not list, naming the files that use it. The
fix is a part: use a class Kiro Crew has, or give the part a rule of its own.
With D1's layers, such a rule is in one file.

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`UC1` to `UC4`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
[avoozl requirements](../avoozl/avoozl.md#requirements).

A task that changes a screen gives the owner screenshots of each view it
touched at 390 and 1280 px, light and dark, before and after (R92.12);
screenshots are shown to the owner and never committed (AGENTS.md).

Task IDs start with `uc-` so they never collide with the IDs
of the other specs.

### Phase 1: Stop the growth

- [x] `uc-1.1` The raw-style test [UC3.1, UC3.2, UC3.3] (§D4)
  - The test fails on a planted extra `className` in a listed view, on any raw style in a view not on the list, and on a listed file whose count is zero.
  - `hosts/kirocrew/ui/test/raw-style.test.ts` and `raw-style-allow.json`, counting `className`, `style`, `<style>` and `var(--` per view outside `src/ui/`.
- [x] `uc-1.2` The class check runs against Kiro Crew's own stylesheet [UC4] (§D5)
  - The test fails on a planted class Kiro Crew's stylesheet lacks and names the file that uses it; a stylesheet with the wrong digest is refused.
  - A Kiro Crew stylesheet named by release and digest in `kirocrew-css.json`, fetched and cached by `kirocrew-css.ts`; `host-classes.test.ts` runs with no skip.

### Phase 2: The parts that remove the most strings

- [x] `uc-2.1` `Hint`, `ErrorText`, `Stack`, `Row` and `TextLink`, after uc-1.1 [UC2.1, UC2.3, UC2.4] (§D2)
  - The five render tests in `ui-parts.test.ts` pass in light and dark; the page tests pass.
  - The five parts in `src/ui/`; the views use them in place of the class strings.
- [x] `uc-2.2` Move the shared parts into `src/ui/`, after uc-1.1 [UC1.2, UC2.2] (§D1)
  - No view imports `@kirocrew/app-sdk/ui` directly, checked by `ui-imports.test.ts`; the existing page tests pass.
  - `Button.tsx`, `Badge.tsx`, `Tabs.tsx`, `Tooltip.tsx`, `RadioFold.tsx`, `PairedCards.tsx` and `controls.tsx` live in `src/ui/`; one module per Kiro Crew part in use wraps it.

### Phase 3: Kiro Crew's parts

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

### Phase 4: Settings and the rest of the views

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
