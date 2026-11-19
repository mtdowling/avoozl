# uc-p1 receipt: a change of look is one edit

Run 2026-11-19 at `9d9919c1`, the commit that lands uc-4.2's last change (#737). Result: **PASS** on all three steps. No image is committed. The screenshots are kept outside git in `~/workplace/uc-shots/p1/`, and the owner has them.

## Setup

- The repository is at `9d9919c1`.
- Kiro Crew is the pinned release, v0.12.2. Its stylesheet is the one `kirocrew-app/ui/test/kirocrew-css.json` names (sha256 `5d85426f…6ae0`).
- The page is the built demo app in the page-test harness, drawn on that stylesheet (`AVOOZL_HOST_CSS`), in headless Chrome. It is not a Kiro Crew process. The harness serves the same bundle and the same stylesheet, and it can be driven page by page.

## Steps

1. **Change `Hint`'s size and color in `src/ui/` only.** The scratch edit is two lines of `kirocrew-app/ui/src/ui/Hint.tsx` and touches no other file (`git diff --stat`). Every size goes one step up (`xs` to `sm`, 12 px to 14 px), and the color goes from muted to accent. The edit was not committed.
   - Before and after, each run opened every nav page and item of the demo app, plus Release queue and Workflow map. That is 28 pages at 390 and 1280 px, light and dark: 112 shots per run.
   - Each run marked `Hint`'s element with `data-hint` and read every one's computed font size and color.
2. **Rename one CSS variable in a scratch copy of Kiro Crew's stylesheet, then run the class check against it.** `node scripts/proof-uc-p1.mjs` renames `--muted` to `--muted-renamed` in all 141 places it appears in the sheet. Then it runs the class check of `host-classes.test.mjs` (`class-tokens.mjs`, plus Box's class table in `ui/box.json`) on the scratch sheet. The class check reads classes only. So the script also lists every file under `src/` that reads a variable the scratch sheet no longer defines.
3. **Count the files that write a class or a variable.** The same script counts, per file under `src/`, its `className` and `style` attributes, `<style>` elements, `var(--` uses, and class-table entries. It is the same count as `raw-style.test.mjs`.

## Expected and observed

- EXPECTED (1): every hint on every view changes, and no view file changed. OBSERVED:
  - Each of the 112 shots has hints, 2,084 in all.
  - All 2,084 changed both font size and color.
  - All 112 shots differ in pixels.
  - The only changed file was `ui/Hint.tsx`.
- EXPECTED (2): the check fails, naming only files in `src/ui/`. OBSERVED:
  - The class check finds no missing class on either sheet, because no class name changed.
  - 15 files read the renamed `--muted`, and all 15 are in `src/ui/`. Ten are part files (`Modal.tsx`, `Tabs.tsx`, `controls.tsx`, `box.json` and others) and five are look maps in `ui/looks/`.
  - A planted `'var(--muted)'` in `PlansView.tsx` made the script fail, naming `PlansView.tsx`.
- EXPECTED (3): every such file is in `src/ui/`. OBSERVED: 35 files write a class or a variable. 33 are in `src/ui/`. The other two are `standalone/StartSession.tsx` and `standalone/main.tsx`. They are the host shim the standalone build draws in Kiro Crew's place (SW1). The Kiro Crew bundle (`dist/index.mjs`) does not include them, and `raw-style.test.mjs` skips them too.

## What the first run found

At `42f0ba4d`, step 1 failed. All 1,012 `Hint` elements changed, but 227 Boxes in 59 views drew muted text with `tone="muted"` or `css-color="muted"`. Another 35 `Hint`s set their own `css-font-size`, so a new hint size skipped them.

#737 fixed both:
- Those Boxes are now `Hint`s.
- `Hint` takes no color or font size of its own.
- `raw-style.test.mjs` fails on a muted `Box` in a view.

The look did not change: before-and-after pixel diffs show only antialiasing.
