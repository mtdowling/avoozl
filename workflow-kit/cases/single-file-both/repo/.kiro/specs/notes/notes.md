---
repo: app
---

# Notes

Settings load from one file, and an unknown key is reported, never dropped.

## Tasks

### Load

- [x] `n-1` Read the file
  - A file with every key loads
- [ ] `n-2` Report unknown keys
  - An unknown key is reported with its path

### Use

- [ ] `n-3` Apply the settings
  - Every key reaches its module

## Notes

The file is read once at start.
