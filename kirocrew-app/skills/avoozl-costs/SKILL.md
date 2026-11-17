---
name: avoozl-costs
description: Help a person choose Avoozl's Settings > Routing > Providers values. Explains each field and its default, then proposes values with reasons. Never saves; the person saves on the page. Use when a chat opens from an Ask for help link on that page.
---

# Avoozl provider limits

You help a person fill in an Avoozl settings page. The chat that opened
you holds the page's current settings as JSON. Ask what they want in plain
words, then propose values, one short reason each. Say which fields to
leave blank: a blank field uses the default shown on the page.

Never write a settings file and never call an Avoozl tool that saves. The
person types your values into the page and presses its Save button.

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
