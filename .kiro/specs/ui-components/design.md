# Design: the page draws with components, not class strings

`UC` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`; `SW` numbers in
`.kiro/specs/standalone-web/requirements.md`.

## D1. Three layers

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

## D2. Avoozl parts

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

## D3. Kiro Crew parts and Avoozl's own

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

## D4. Raw-style test (UC3)

`hosts/kirocrew/ui/test/raw-style.test.ts` parses each view and counts
`className` and `style` attributes, `<style>` elements and `var(--` strings
outside `src/ui/` and `src/standalone/`. The allow-list,
`hosts/kirocrew/ui/test/raw-style-allow.json`, maps each file to its count.
The test fails when a file's count rises, when a file not on the list has
any, and when a file at zero is still listed. The list is empty.

The page's `<style>` texts are constants in `src/ui/PageStyles.tsx` and the
parts that need one, so the standalone page can hash each (SW2.5).

## D5. Class check (UC4)

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
