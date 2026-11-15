// The Forward screen (RC26.5.4): the exact public diff, title and body, shown
// before anything is pushed. Forward sends the hash that was shown; a change
// after display brings the new one back and asks again.
import { useEffect, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { Modal } from './Modal.tsx'
import { errorMessage } from './workspace-api.ts'
import { forwardClient, forwardOutcome, type ForwardAnswer, type ForwardReview } from './forward-api.ts'

export function ForwardScreen(props: { workspaceId: string; forwardId: string; title: string; onClose: (forwarded: boolean) => void }) {
  const { workspaceId, forwardId } = props
  const client = forwardClient(useAppApi())
  const [review, setReview] = useState<ForwardReview | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [blocked, setBlocked] = useState(false)

  const show = (answer: ForwardAnswer) => {
    setBlocked(answer.blocked === true)
    setReview(answer.review ?? null)
    setNote(answer.blocked || answer.changed || !answer.ok ? forwardOutcome(answer) : null)
  }
  const settle = async (step: () => Promise<ForwardAnswer>, done?: (answer: ForwardAnswer) => void) => {
    setBusy(true)
    try {
      const answer = await step()
      if (done && answer.ok && !answer.changed) done(answer)
      else show(answer)
    } catch (error) {
      setNote(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void settle(() => client.review(workspaceId, forwardId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, forwardId])

  return (
    <Modal
      id="forward-screen"
      title={props.title}
      width="60rem"
      onDismiss={() => props.onClose(false)}
      attrs={{ 'data-forward-screen': forwardId }}
      footer={
        <>
          <Btn onClick={() => props.onClose(false)}>Close</Btn>
          <Btn
            primary
            disabled={busy || blocked || !review}
            data-forward-push
            onClick={() =>
              void settle(
                () => client.push(workspaceId, forwardId, review!.hash),
                (answer) => {
                  setNote(forwardOutcome(answer))
                  props.onClose(true)
                },
              )
            }
          >
            Forward
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {note && (
          <p className="text-sm" role="status" data-forward-note>
            {note}
          </p>
        )}
        {busy && !review && <p className="text-sm text-muted">Preparing the public change…</p>}
        {review && (
          <>
            <p className="text-sm text-muted">
              This is exactly what is pushed to {review.target.split(':')[0]} as {review.person}, on branch {review.branch}. Nothing is pushed until you press Forward, and only if it still matches.
            </p>
            <section>
              <h3 className="text-sm font-medium">Title</h3>
              <p className="whitespace-pre-wrap break-words text-sm" data-forward-title>{review.title}</p>
            </section>
            <section>
              <h3 className="text-sm font-medium">Body</h3>
              <pre className="whitespace-pre-wrap break-words text-sm" data-forward-body>{review.body}</pre>
            </section>
            <section>
              <h3 className="text-sm font-medium">Files ({review.paths.length})</h3>
              <ul className="text-sm">{review.paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>
            </section>
            <section>
              <h3 className="text-sm font-medium">Diff</h3>
              <pre className="max-h-96 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }} data-forward-diff>{review.diff}</pre>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}
