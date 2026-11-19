# Home laid out like Issue Radar's home (2026-11-17)

Home now opens with six number tiles (Ready, Running, Needs you, Waiting,
Landing queue, Landed this week), each a link to its view. Needs you is a
full-width grid of cards, each with the one answer that unblocks it. Then
Landing queue beside CI health, and Recently landed beside Stuck or quiet.
In flight, Progress by epic and the existing cards follow.

Only the layout idea comes from Issue Radar; the code and CSS are Avoozl's
own, on the host's theme variables.

Shots are the full app shell with the host stylesheet, on fake data:

```
env AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/home-shots.mjs docs/evidence/home-radar-layout
```

| File | What |
| --- | --- |
| `home-<width>-<theme>` | A busy workspace (`?page=app&home=1`) |
| `home-empty-<width>-<theme>` | An empty workspace: each section says so in one line |

Landing queue and Recently landed read `landing.view`, which reads Avoozl's
own landing queue table: no GitHub call and no git. CI health uses the CI
facts `flow.view` already sends. No section waits on another read.
