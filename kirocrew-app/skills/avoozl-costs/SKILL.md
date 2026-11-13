---
name: avoozl-costs
description: Help a person choose Avoozl's Settings > Budgets, Settings > Prices and Settings > Routing > Providers values. Explains each field and its default, then proposes values with reasons. Never saves; the person saves on the page. Use when a chat opens from an Ask for help link on those pages.
---

# Avoozl budgets, prices and provider limits

You help a person fill in three Avoozl settings pages. The chat that opened
you holds the page's current settings as JSON. Ask what they want in plain
words, then propose values, one short reason each. Say which fields to
leave blank: a blank field uses the default shown on the page.

Never write a settings file and never call an Avoozl tool that saves. The
person types your values into the page and presses its Save button.

## Settings > Budgets

A budget is a cap per task. Retries, checks and reviews of a task share
its cap. Caps are set for the whole workspace, and a repository can set its
own. A spec's manifest and a task can also set one; those are not on this
page.

| Field | Key | Default | What it does |
|---|---|---|---|
| Dollar cap per task | `budget.usd` | No cap | Spend in US dollars a task may reach. Receipts are kept either way. |
| When a task reaches its cap | `budget.mode` | Stop | Stop: no new chat starts for the task and its running chats are asked to stop. Warn: it keeps running and shows Over budget. |
| Notice on Warn | `budget.notify` | Off | Workspace only. Sends a Kiro Crew notice when a task in Warn mode goes over. |
| Token cap | `budget.tokens` | 2,000,000 | For turns on a model with no known price. Input plus output tokens. |
| Credit cap | `budget.credits` | 200 | For turns Kiro Crew bills in credits, when no dollar price per credit is set. |

A repository field left blank uses the workspace value. Its mode choice
says so, for example "Use the workspace default (Stop)".

Rules of thumb to offer, not to impose: start with Stop; pick a dollar cap a
little above what a normal task costs on the receipts; use Warn for
repositories where finishing matters more than cost.

## Settings > Prices

Nobody needs to type prices. Avoozl ships a dated table of public list
prices for known models and uses it on its own. The page shows "Prices last
updated" with that date.

- A model Kiro Crew bills in credits is budgeted in credits, against the
  credit cap, because a token list price is not what it costs. A dollar
  price per credit, if the person knows one, turns credits into dollars.
- A model with no known price is budgeted against the token cap.
- Overrides are optional and kept on this computer only. Suggest one only
  when the person pays a different price than the list price.

## Settings > Routing > Providers

This table decides when a provider counts as low or out, so new tasks skip
it. Each row shows a provider's health and its usage in the last 5 hours.
Values are kept on this computer only.

| Field | Key | Default | What it does |
|---|---|---|---|
| Limit (credits per 5 h) | `providers.limits.<provider>.credits` | None | Credits a provider may use in 5 hours. At 100% it is out. Without a limit, usage never marks it low. |
| Low at | `providers.lowPercent` | 80 | Percent of a limit at which a provider counts as low. 1 to 99. |

Most people need only one limit per provider they pay for. The page does
not edit fallback models, the usage window, the error cooldown or provider
groups; those stay in `~/.config/avoozl/config.json` under `providers`.
