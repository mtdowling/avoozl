# VS Code client evidence

Receipts for [the VS Code client](../../design/vscode-client.md), produced on a
second computer against the canned fixture. Nothing here requires a particular
machine, a personal workspace, a provider account, or network access, and
nothing here contains a credential or a personal path.

## Reproducing

```sh
npm ci --ignore-scripts
node scripts/vscode-evidence.mjs
```

That builds a disposable workspace with the optional `product-launch` pack and
a separate disposable Git repository, starts an agent host whose provider
adapter runs real child processes, starts the workspace server and the editor
facade, and then drives the whole path over the Agent Host Protocol using the
protocol library's own client. It writes [`tool-roundtrip.json`](tool-roundtrip.json)
and removes the fixture unless `--keep` is passed.

The receipt records the negotiated protocol version, the provider request and
tool identifiers, the PID the started command wrote for itself, the signal it
received, whether its normal-completion marker exists, the resulting transcript
state, and every assertion by name.

## What the receipt establishes

- The facade negotiates a protocol version the installed editor actually
  offers. VS Code 1.138.0 offers `0.9.0` and below; a host that insists on
  `1.0.0` is refused.
- An approval sent over the protocol reaches the provider and a real child
  process starts.
- A protocol cancellation stops that real process: the recorded PID is gone,
  the command recorded `SIGTERM`, and no completion marker was written.
- A tool that ran and was then stopped is recorded as completed and
  unsuccessful, with wording that says it had started. It is not recorded as
  skipped.
- The run is interrupted rather than failed, carries no error, and keeps the
  provider's own diagnostic in a separate field.
- The same permission request cannot be answered twice.

## What it does not establish

- **A person clicking the native controls.** The actions were sent by the
  protocol library's client, which is what the editor sends on the wire, but
  no click was exercised. Clicked-control acceptance needs a human at the
  editor.
- **How Claude or Codex classify an interrupted turn.** The fixture provider
  deliberately reports an error result on cancellation — the shape that
  previously caused a stopped Claude run to be reported as failed — so the
  classification under test is the production one. It still is not a live
  provider.
- **Remote routing**, through a tunnel gateway or otherwise.
- **Anything about a physical phone.**

## Manual steps this does not cover

To exercise the native controls by hand:

```sh
node scripts/vscode-fixture.mjs --root /tmp/vscode-fixture
node scripts/vscode-fixture-host.mjs /tmp/vscode-fixture &
node cli.mjs serve --workspace /tmp/vscode-fixture/workspace --ahp
node cli.mjs editor --workspace /tmp/vscode-fixture/workspace
```

Paste the printed settings into an isolated VS Code profile, start a run from
the website or the CLI, open its conversation, and click Allow and then Cancel.
Then check the marker directory: the `.started` file names the real PID, a
`.interrupted` file records the signal, and no `.completed` file should exist.
Treat the printed address as a credential.
