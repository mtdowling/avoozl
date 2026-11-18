// The Forward screen (RC26.5.4): the exact public diff, title and body, shown
// before anything is pushed. Forward sends the hash that was shown; a change
// after display brings the new one back and asks again.
import { useEffect, useState } from 'react'
import { Btn } from './ui/Btn'
import { useAppApi } from './host.ts'
import { Modal } from './ui/Modal.tsx'
import { errorMessage } from './workspace-api.ts'
import { forwardClient, forwardOutcome, type ForwardAnswer, type ForwardReview } from './forward-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

export function ForwardScreen(props: { workspaceId: string; forwardId: string; title: string; onClose: (forwarded: boolean) => void }) {
  const { workspaceId, forwardId } = props
  const client = forwardClient(useAppApi())
  const [review, setReview] = useState<ForwardReview | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [stopped, setStopped] = useState<string | null>(null)

  const show = (answer: ForwardAnswer) => {
    setBlocked(answer.blocked === true)
    setStopped(answer.stopped ?? null)
    setReview(answer.review ?? null)
    setNote(answer.stopped || answer.blocked || answer.changed || !answer.ok ? forwardOutcome(answer) : null)
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
      dismissLabel="Cancel"
      title={props.title}
      width="60rem"
      onDismiss={() => props.onClose(false)}
      attrs={{ 'data-forward-screen': forwardId }}
      footer={
        <>
          <Btn
            primary
            disabled={busy || blocked || !review || stopped !== null}
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
      <Stack gap={3}>
        {note && (
          <Box as="p" size="sm" role="status" data-forward-note>
            {note}
          </Box>
        )}
        {busy && !review && <Hint as="p" size="sm">Preparing the public change…</Hint>}
        {review && (
          <>
            <Hint as="p" size="sm">
              This is exactly what is pushed to {review.target.split(':')[0]} as {review.person}, on branch {review.branch}. Nothing is pushed until you press Forward, and only if it still matches.
            </Hint>
            <section>
              <Box as="h3" size="sm" weight="medium">Title</Box>
              <Box as="p" whitespace="pre-wrap" breakWords size="sm" data-forward-title>{review.title}</Box>
            </section>
            <section>
              <Box as="h3" size="sm" weight="medium">Body</Box>
              <Box as="pre" whitespace="pre-wrap" breakWords size="sm" data-forward-body>{review.body}</Box>
            </section>
            <section>
              <Box as="h3" size="sm" weight="medium">Files ({review.paths.length})</Box>
              <Box as="ul" size="sm">{review.paths.map((path) => <li key={path}><code>{path}</code></li>)}</Box>
            </section>
            <section>
              <Box as="h3" size="sm" weight="medium">Diff</Box>
              <pre className="max-h-96 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }} data-forward-diff>{review.diff}</pre>
            </section>
          </>
        )}
      </Stack>
    </Modal>
  )
}
