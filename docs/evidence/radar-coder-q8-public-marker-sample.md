# Q8: the plans repository name in a public marker

Status: waiting for the owner's choice. Nothing is decided here.

## The sample

A repository in plans-repository mode projects each task to an issue in the
code repository. The issue ends with a marker. This is the marker when the
plans repository is named (fake names):

```
<!-- avoozl v=1 spec=sdk-retry tasks=sdk-1.1 commit=0123456789abcdef0123456789abcdef01234567 approved-by=octocat plans=example-org/example-plans -->
```

Without the name, the same marker has no `plans=` field and a crew reads the
spec from the code repository.

## What the name shows

If the code repository is public, anyone can read the line `plans=example-org/example-plans`.
That tells a reader a private repository of that name exists. It does not
give access. A crew without read access to that repository fails the `spec`
check and skips the issue (Q5).

## What the code does today

- `radar.showPlansRepo` decides. Unset, it is on for a private code repository
  and off for a public one.
- A public code repository with it off is refused before any write, with this
  advice: turn the setting on, or move the spec into the code repository.
- A content rule that blocks the name is also refused before any write.

## The choice for the owner

1. Turn `radar.showPlansRepo` on for the public repository and accept that the
   plans repository name is public.
2. Keep the setting off and move the spec into the code repository
   (`.kiro/specs/<name>/`), so no marker names a private repository.

Recommendation: option 2 for a public repository, because it leaves the name
private and a crew can read the spec without a second repository. Option 1 is
fine if the name is not sensitive.

## Owner steps

1. Pick option 1 or 2.
2. Record the choice in this file under a new "Decision" heading.
3. Tick `rc-q8` in `.kiro/specs/radar-coder/tasks.md`.
