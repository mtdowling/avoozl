# UX audit: Settings › Budgets, Prices and Providers

Audited 2026-11-13. Each page was rendered with sample data on the test
harness page (`kirocrew-app/ui/test/browser/settings-shots.mjs`) at 375, 768
and 1280 px wide, light and dark, with every fold open. Before and after
pictures are in `docs/ux/cost-settings/`.

To make them again:

```sh
cd kirocrew-app/ui
AVOOZL_CHROME=<chrome> AVOOZL_HOST_CSS=<host stylesheet> \
  node test/browser/settings-shots.mjs <out dir> --open
```

Each problem below is marked **Fixed** or **Open**.

## Settings › Budgets

### Wording

- **Fixed.** The workspace mode offered "Same as above (stop)", but nothing
  sits above the workspace. A repository said the same thing. Each
  inherited choice now says where it comes from and what it is: "Use the
  workspace default (Stop)". The workspace has no inherit choice.
- **Fixed.** "Stop: at the cap no new session starts and its chats are
  asked to stop." mixed a title and a sentence, and said "session", a word
  people don't see on the page. Stop and Warn are now titles with one plain
  line each: "When a task reaches its cap, no new chat starts for it and
  its running chats are asked to stop."
- **Fixed.** "At the cap (optional)" did not say what cap. The group is
  now "When a task reaches its cap".
- **Fixed.** "Token cap for unpriced turns" and "Credit cap for unpriced
  turns" used jargon. They are now "Token cap per task" and "Credit cap per
  task", in a box whose blurb says when each one applies.
- **Fixed.** The notice checkbox said "warn-mode task" but sat apart from
  Warn. It now sits inside the Warn choice, at the workspace.

### Missing information

- **Fixed.** A blank field showed its fallback only as a placeholder, which
  disappears once you type and that screen readers often skip. Each field
  now has a "Blank: …" line, tied to the input with `aria-describedby`.
- **Fixed.** A repository's token and credit placeholders showed
  "2000000" and "200" with no hint that they came from the workspace. They
  now say "Blank: the workspace default (2,000,000 tokens)".
- **Fixed.** A repository's summary line showed only its name. It now says
  "$8, Warn" or "uses the workspace default".

### Layout

- **Fixed.** At 768 px, the three cap fields wrapped their labels to two
  lines at different heights, so the inputs did not line up. The dollar
  cap now has its own box, and the two fallback caps sit together under
  Advanced.
- **Fixed.** Every field was flat in one card. Fields are now grouped in
  titled, bordered boxes (`FieldBox`): Dollar cap, When a task reaches its
  cap, and the folded Advanced caps.
- **Fixed.** The mode was a stack of small native radios. It is now the
  shared radio fold-out (`RadioFold`), with large click targets and the
  open choice outlined.
- **Open.** Each repository has its own Save. One Save for the page would
  be simpler, but the backend writes one level per call with the file's
  hash. Left as is.

### Keyboard and screen reader

- **Fixed.** The mode radios had no group name a screen reader would read
  in full. `RadioFold` is a `radiogroup` named "When a task reaches its
  cap", and arrow keys move the choice.
- Already fine: inputs have labels, Save results use `role="status"` and
  errors `role="alert"`.

## Settings › Prices

- **Fixed.** The page asked people to type prices per model and said
  "Avoozl ships no prices". Nobody knows list prices by heart. Avoozl now
  ships a dated table of public list prices (`src/app/default-prices.mjs`,
  with its source URL and date) and uses it with no setup.
- **Fixed.** No date said how fresh prices were. The page says "Prices
  last updated 2026-11-13." with a Source link.
- **Fixed.** Models showed "none" in every field and "4 turns with no
  price", with no reason. A **Models in use** list now says how each model
  is budgeted, in plain words: built-in price, your price, billed in
  credits (counted against the credit cap, with the number), or no known
  price (counted against the token cap, with the number).
- **Fixed.** A model Kiro Crew bills in credits was priced by its token
  list price whenever one existed, which is not what it cost. Credit turns
  are now budgeted in credits unless a dollar price per credit is set, and
  the page says so.
- **Fixed.** The override table was the whole page. It is now **Override
  prices**, optional and collapsed by default. Each field shows the
  built-in price as its placeholder, so a blank field visibly means "use
  the list price".
- **Fixed.** At 375 px, the model column broke IDs into single letters
  ("claud / e-son / net-5.5"). Models now get their own line, and the two
  price fields wrap below.
- **Fixed.** The task warning for a model with no price said "Add its price
  in Settings › Prices". It now says why in plain words: no known price
  (token cap) or billed in credits (credit cap).
- **Open.** Built-in prices cover Claude models only, because those have a
  public per-token list price that Kiro Crew offers. Others fall back to
  the token cap and say so.

## Settings › Providers (Thresholds)

- **Fixed.** Limits and groups were free text with a grammar to learn
  ("<provider or model> credits|tokens <amount>"). Limits are now rows:
  provider or model, amount, a credits or tokens menu, Remove, and Add a
  limit. Errors name the row ("The limit for claude needs an amount
  above 0.") instead of a key ("lowPercent must be a whole number.").
- **Fixed.** All six fields had the same weight. The form now shows three
  boxes, Low and out, Limits and Fallback models, and folds the usage
  window, error cooldown and provider groups under Advanced.
- **Fixed.** Defaults were placeholders only. Each field now says "Blank:
  80%", "Blank: 5 hours", "Blank: 30 minutes", "Blank: no fallback".
- **Fixed.** The Limits blurb did not say what window it counts in. It now
  says "in 5 hours" (the window in use).
- **Fixed.** Save sat outside both cards. It is now at the bottom of the
  Thresholds card, and the saved message uses `role="status"`.
- **Fixed.** "Saved on this machine only" now says "this computer", like
  the rest of the app.
- **Superseded.** While this branch was open, main (PR #33) moved
  Providers into Settings › Routing as one table: each provider's health,
  usage and credit limit per 5 hours, plus "Low at". That already is a few
  plain fields, so this branch keeps main's form and drops its own page
  and its after-shots. Its Ask for help link moved onto main's Providers
  section.

## All three pages

- **Fixed.** No way to get help choosing values. Each page has the shared
  chat-icon **Ask for help** link (`AskForHelp` in `controls.tsx`, built
  on `task/modal-followups`). It opens a Kiro Crew chat with the page, its
  current values, and the guide (the `avoozl-costs` skill,
  `kirocrew-app/skills/avoozl-costs/SKILL.md`). The chat may propose
  values; it is told to save nothing, so the page's Save stays the only
  write.
- **Fixed.** Light and dark both read well at every width after the change;
  borders use `var(--border)` and the open choice uses `var(--accent)`.
- **Open.** The raw keys (`budget.usd`, `providers.lowPercent`) stay under
  each field, as on the other Settings pages, for people who edit the
  files by hand.
