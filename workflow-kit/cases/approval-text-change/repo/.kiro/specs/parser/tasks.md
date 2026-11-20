---
repo: app
---

# Tasks: Parser

- [x] `p-1` Read the token table
  - Every row of `tokens.csv` becomes one token kind
- [ ] `p-2` Report unknown tokens
  - An unknown token is reported with its line, column and text
- [ ] `p-3` Recover after an unknown token
  - The parser skips to the next line
