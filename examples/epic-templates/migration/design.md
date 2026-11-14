# Design: migration

Status: Draft

Stage one builds the tool or compatibility layer. Stage two is one task per
repository; each depends on stage one and has its own check. Stage three
removes the old way and depends on every repository task. Add one task per
repository by copying a `migrate-repo-*` entry in `tasks.md` and the manifest,
then add its ID to the `requires` of `remove-old-path`.
