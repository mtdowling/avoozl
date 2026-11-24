---
name: open
description: Open this machine's Avoozl page in the browser. Runs avoozl link and shows the one-time link it prints. Run only when the person asks for it.
disable-model-invocation: true
allowed-tools: Bash(avoozl link)
---

# Open the Avoozl page

Run `avoozl link` once, with no arguments.

- When it prints a link, show the person that link on its own line and
  nothing else. The link signs a browser in once, so do not run it again.
- When it fails, show its error as it printed it. When the error says the page
  is not running, tell the person to set `serve.enabled` in this machine's
  `config.json` and run `avoozl tick`, as the error says.

Do not write the link to a file, a commit, an issue or a pull request. It
carries a sign-in token.
