# Design: the page draws with components, not class strings

`UC` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`; `SW` numbers in
`.kiro/specs/standalone-web/requirements.md`.

## D1. Three layers

```
views (121 files today)          no className, no style, no var(--…)
   │
   ▼
src/ui/  Avoozl parts            the only place that writes classes and variables
   │      and re-exports of
   │      Kiro Crew parts
   ▼
@kirocrew/app-sdk/ui             Kiro Crew's documented components and stylesheet
```

A view composes parts. A part either is a Kiro Crew part, re-exported by
name, or is drawn from Kiro Crew parts and a few classes and variables. When
Kiro Crew renames a class or a variable, the change is in `src/ui/`. When
the owner wants a different look for hints or errors, the change is one
part.

## D2. The first Avoozl parts

Taken from what views repeat most (V: counted at `05474af`).

| Part        | Replaces                                                              | Props                                       |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `Hint`      | `text-xs text-muted`, `text-muted`, `text-sm text-muted` (497 uses)   | `size: "xs" \| "sm"`                        |
| `ErrorText` | `text-sm text-danger`, `text-xs text-danger` (92 uses)                | `size`; uses `ErrorNotice` for a block      |
| `Stack`     | `flex flex-col gap-N` (about 180 uses)                                | `gap: 1 \| 2 \| 3 \| 4`                     |
| `Row`       | `flex flex-wrap items-center gap-2` and its kin                       | `gap`, `wrap`, `align`                      |
| `TextLink`  | `underline` on links (49 uses)                                        | the anchor's own props                      |
| `Field`     | `FieldRow.tsx`                                                        | as today                                    |
| `FieldGroup`| `FormSection.tsx`, `FieldBox.tsx`, or Kiro Crew's `SettingsSection`   | `title`, `blurb`                            |

A gap scale of four steps covers the strings counted; a fifth step is added
only when a view needs it, in the task that needs it.

## D3. Kiro Crew parts, and where they may differ

`src/ui/` has one module per Kiro Crew part in use, which re-exports it
(UC1.2). Where the page's own version does more, the task compares them
before it swaps:

| Avoozl's own            | Kiro Crew part      | What to compare                                                       |
| ----------------------- | ------------------- | --------------------------------------------------------------------- |
| `Modal.tsx`             | `Modal`             | Focus trap, Escape, the footer button order the tests hold (V: #520)  |
| `Markdown.tsx`          | `MarkdownRenderer`  | Code highlighting, links that open outside, the size cap              |
| `InfoTip` in `controls` | `InfoTip`           | Tap to open on touch, which the page's tests hold                     |
| raw `<select>`          | `Select`            | Grouped options and a blank choice                                    |
| `Badge.tsx` variants    | `Badge`             | Today's mapping of five page variants onto Kiro Crew's five (V)       |

What a Kiro Crew part lacks is decided by the owner on the screenshots
(UC1.3): keep the Avoozl version in `src/ui/`, or accept the Kiro Crew
part's behavior.

## D4. The raw-style test (UC3)

`kirocrew-app/ui/test/raw-style.test.mjs` parses each view with the
TypeScript compiler the page already uses for its type check, and counts
`className` and `style` attributes, `<style>` elements and `var(--`
strings outside `src/ui/`. The allow-list,
`kirocrew-app/ui/test/raw-style-allow.json`, maps each file to its count.
The test fails when a file's count rises, when a file not on the list has
any, and when a file at zero is still listed. A task that moves a view
lowers its number in the same change.

## D5. The class check (UC4)

The test exists and is skipped by default (V: `host-classes.test.mjs`
needs `KIROCREW_HOST_CSS`). The change is where its stylesheet comes from:

- With `standalone-web` built, the test uses its fetched source at the pin
  and builds the stylesheet with Kiro Crew's own `@source` lines only, not
  the extra line the standalone page adds. That is the stylesheet a person
  gets inside Kiro Crew.
- Before that, `kirocrew-app/ui/test/kirocrew-css.json` names a release and
  the digest of its built stylesheet. The test downloads the built
  stylesheet from that release's published package, checks the digest and
  caches it. Which published file to take is the first task's question
  (A: the installed wheel holds one, `kiro_crew/static/dist/assets/src-*.css`,
  named by a content hash; a fetch from the release's wheel was not tried).

A class missing from Kiro Crew's stylesheet fails with its file list. The
fix is a part: either use a class Kiro Crew has, or give the part a rule of
its own. With D1's layers, such a rule is in one file.

## D6. Order

1. The test of D4 with today's counts, and the class check of D5. Nothing
   moves yet; the numbers stop growing.
2. `Hint`, `ErrorText`, `Stack`, `Row`, `TextLink`: the parts that remove
   the most strings.
3. The Kiro Crew parts, one per task, starting with `Select` and `Toggle`
   (raw controls), then `Modal`, `InfoTip`, `PageHeader`, `StatCard`,
   `ErrorNotice`, `MarkdownRenderer`.
4. The settings pages onto `Field` and `FieldGroup`.
5. The views, a group at a time, until the allow-list is empty.

## D7. Risks

| Risk                                                            | Guard                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A Kiro Crew part behaves differently from Avoozl's own          | D3's comparison, the owner's screenshots, the existing tests (UC5.3)      |
| A part grows a `className` escape hatch and views use it        | UC2.3; the raw-style test counts `className` on parts too                |
| The move stalls half done                                       | The allow-list only shrinks; each task is useful on its own (UC5.1)       |
| A Kiro Crew part is missing from an older Kiro Crew             | UC1.4's declarations; the pin and `minKiroCrewVersion` move together (SW12.8) |
