// The Start a session dialog (standalone-web SW7, D7): what Open chat does on
// the standalone page. The page's buttons ask the SDK's chat launcher to open a
// chat; here that opens this dialog with the message, the role it maps to and
// the harness Settings › Models picks. Start runs `session.open`, and the
// dialog then shows that session's process view: status, log tail, cost,
// Send message and the copyable attach command (SW7.4).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn } from '../ui/Btn'
import { Hint } from '../ui/Hint'
import { ErrorText } from '../ui/ErrorText'
import { readPageState } from '../workspace-api.ts'
import { onOpenChat, type ChatLaunch } from './host.ts'

const COMMAND = '/apps/avoozl/api/command'

interface Preview {
  role: string
  harness: string | null
  permissionClass: 'read' | 'write'
  available: boolean
  reason: string | null
}
interface ProcessView {
  state: string
  exitCode: number | null
  logTail: string | null
  cost: number | null
  attach: string | null
  harness: string
}
interface SessionView {
  id?: string
  title?: string
  state?: 'queued' | 'working' | 'ended'
  slot?: string | null
  process?: ProcessView | null
  kirocrewChat?: boolean
}

const message = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught))

export function StartSession() {
  const api = useAppApi()
  const dialog = useRef<HTMLDialogElement>(null)
  const [launch, setLaunch] = useState<ChatLaunch | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [view, setView] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sent, setSent] = useState(false)
  const workspaceId = () => readPageState(window.localStorage).workspaceId ?? undefined
  const run = useCallback(
    async <T,>(operation: string, input: Record<string, unknown>): Promise<T> =>
      (await api.post<{ result: T }>(COMMAND, { operation, input, workspaceId: workspaceId() })).result,
    [api],
  )

  // Open Chat arrives from the host shim's navigate().
  useEffect(
    () =>
      onOpenChat((next) => {
        setLaunch(next)
        setText(next.message ?? '')
        setPreview(null)
        setView(null)
        setError(null)
        setSent(false)
        setReply('')
      }),
    [],
  )
  useEffect(() => {
    if (launch) dialog.current?.showModal()
  }, [launch])

  // What Start would do; or the session a link or Open chat named.
  useEffect(() => {
    if (!launch) return
    let live = true
    if (launch.slotKey)
      run<SessionView>('session.view', { slot: launch.slotKey }).then(
        (next) => live && setView(next),
        (caught) => live && setError(message(caught)),
      )
    else
      run<Preview>('session.open', { preview: true, agent: launch.agent }).then(
        (next) => live && setPreview(next),
        (caught) => live && setError(message(caught)),
      )
    return () => {
      live = false
    }
  }, [launch, run])

  // The process view follows the session until it ends.
  const id = view?.id,
    slot = launch?.slotKey ?? view?.slot
  const state = view?.state
  useEffect(() => {
    if (!launch || state === 'ended' || view?.kirocrewChat || (!id && !launch.slotKey)) return
    const read = () =>
      run<SessionView>('session.view', id ? { id } : { slot: launch.slotKey }).then(
        (next) => setView((current) => ({ ...current, ...next })),
        () => undefined,
      )
    const timer = window.setInterval(read, 2000)
    return () => window.clearInterval(timer)
  }, [id, state, launch, run, view?.kirocrewChat])

  const close = () => {
    dialog.current?.close()
    setLaunch(null)
  }
  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const opened = await run<{ id: string; title: string }>('session.open', { message: text, agent: launch?.agent })
      setView({ id: opened.id, title: opened.title, state: 'queued', slot: null })
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }
  const send = async () => {
    if (!slot || !reply.trim()) return
    try {
      await run('session.send', { slot, text: reply })
      setReply('')
      setSent(true)
    } catch (caught) {
      setError(message(caught))
    }
  }
  const copy = (value: string, what: string) =>
    void navigator.clipboard.writeText(value).then(() => setCopied(what))

  const showing = view && !view.kirocrewChat
  return (
    <dialog
      ref={dialog}
      data-start-session
      aria-labelledby="avoozl-start-session"
      onClose={() => setLaunch(null)}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-0 text-text shadow-xl"
    >
      {launch && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="border-b border-border px-5 py-3">
            <h2 id="avoozl-start-session" className="text-base font-semibold">
              {showing ? (view.title ?? 'Session') : 'Start a session'}
            </h2>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-4">
            {view?.kirocrewChat ? (
              <p data-needs-kirocrew>This is a Kiro Crew chat; open it in Kiro Crew.</p>
            ) : showing ? (
              <>
                <Hint size="xs" block data-session-state>
                  {view.state === 'queued'
                    ? 'Waiting for this machine’s supervisor to start it.'
                    : view.state === 'ended'
                      ? `Ended${view.process?.exitCode != null ? ` with exit code ${view.process.exitCode}` : ''}.`
                      : `Working${view.process?.harness ? ` on ${view.process.harness}` : ''}.`}
                  {view.process?.cost != null ? ` Cost $${view.process.cost.toFixed(2)}.` : ''}
                </Hint>
                <pre data-session-log className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border p-2 text-xs">
                  {view.process?.logTail || 'No output yet.'}
                </pre>
                {view.process?.attach && (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{view.process.attach}</code>
                    <Btn onClick={() => copy(view.process!.attach!, 'attach')}>{copied === 'attach' ? 'Copied' : 'Copy attach command'}</Btn>
                  </div>
                )}
                {view.state !== 'ended' && slot && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void send()
                    }}
                  >
                    <input
                      aria-label="Message to the session"
                      value={reply}
                      onChange={(event) => {
                        setReply(event.target.value)
                        setSent(false)
                      }}
                      className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                    />
                    <Btn type="submit" disabled={!reply.trim()}>
                      Send message
                    </Btn>
                    {sent && <Hint size="xs">Queued.</Hint>}
                  </form>
                )}
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Message
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    rows={8}
                    className="rounded-md border border-border bg-transparent p-2 text-sm"
                    data-session-message
                  />
                </label>
                {preview && (
                  <Hint size="xs" block data-session-plan>
                    Role {preview.role}
                    {preview.harness ? `, harness ${preview.harness}` : ''}, {preview.permissionClass === 'read' ? 'read-only' : 'can write'}, in this
                    workspace’s folder.
                  </Hint>
                )}
                {preview && !preview.available && (
                  <p data-no-harness className="m-0 text-sm">
                    {preview.reason} <a href="/apps/avoozl?settings=models">Open Settings › Models</a>
                  </p>
                )}
              </>
            )}
            {error && <ErrorText size="sm">{error}</ErrorText>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
            {!showing && !view?.kirocrewChat && preview && !preview.available && (
              <Btn onClick={() => copy(text, 'message')} disabled={!text.trim()}>
                {copied === 'message' ? 'Copied' : 'Copy message'}
              </Btn>
            )}
            <Btn onClick={close}>Close</Btn>
            {!showing && !view?.kirocrewChat && preview?.available && (
              <Btn primary disabled={busy || !text.trim()} onClick={() => void start()}>
                {busy ? 'Starting…' : 'Start'}
              </Btn>
            )}
          </footer>
        </div>
      )}
    </dialog>
  )
}
