// Mark done for a manual task, in the task drawer (design §4.16). A
// manual task shows what the person checks and Mark done, a dialog with
// Done, Skipped or Refused.
import { useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { Modal } from './ui/Modal.tsx'
import { RadioFold } from './ui/RadioFold.tsx'
import { DangerBtn, ICON, IconLabel } from './ui/controls.tsx'
import { Ban, Check, ClipboardCheck, RotateCcw, X } from './icons.ts'
import { relativeTime } from './task-api.ts'
import { errorMessage } from './workspace-api.ts'
import { manualClient, type ManualDone } from './manual-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Box } from './ui/Box'

type Choice = 'done' | 'skipped' | 'refused'

const MARKED: Record<Choice, string> = {
  done: 'Marked done. The tasks that wait on it may start.',
  skipped: 'Marked skipped. The tasks that wait on it may start.',
  refused: 'Marked refused. The tasks that wait on it stay held.',
}

// Mark done (R61.12): Done, Skipped or Refused. Done and Skipped release the tasks that wait on it;
// Refused is a no-go and keeps them held.
export function MarkDoneDialog(props: { workspaceId: string; taskId: string; title: string; onClose: () => void; onDone: (text: string) => void }) {
  const client = manualClient(useAppApi())
  const [choice, setChoice] = useState<Choice>('done')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.markDone(props.workspaceId, props.taskId, choice)
      props.onDone(MARKED[choice])
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      id="avoozl-mark-done"
      width="34rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-mark-done-line"
      attrs={{ 'data-mark-done-dialog': true }}
      title={
        <Box as="span" inlineFlex items="center" gap="1.5">
          <ClipboardCheck size={ICON} aria-hidden="true" /> Mark done: {props.title}
        </Box>
      }
      onDismiss={props.onClose}
      footer={
        <>
          <Btn type="button" primary disabled={busy} onClick={() => void submit()} data-mark-done-confirm css-display="inline-flex" css-align-items="center" css-gap="6">
            <ClipboardCheck size={ICON} aria-hidden="true" />
            {choice === 'done' ? 'Mark done' : choice === 'skipped' ? 'Mark skipped' : 'Mark refused'}
          </Btn>
        </>
      }
    >
      <div>
        <Hint id="avoozl-mark-done-line" as="p" size="sm">
          The tasks that wait on it may start after Done or Skipped. Refused keeps them held.
        </Hint>
      </div>
      <RadioFold<Choice>
        name="avoozl-mark-done-choice"
        label="How it ended"
        value={choice}
        onChange={setChoice}
        sections={[
          {
            key: 'done',
            title: 'Done',
            line: 'The step happened and its acceptance holds.',
            icon: Check,
          },
          {
            key: 'skipped',
            title: 'Skipped',
            line: 'It was not needed. It shows as skipped on the task and in Flow.',
            icon: X,
          },
          {
            key: 'refused',
            title: 'Refused',
            line: 'A no-go. The tasks that wait on it stay held until you reopen it.',
            icon: Ban,
          },
        ]}
      />
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Modal>
  )
}

// A manual task's panel at the top of the drawer: what the person checks,
// and Mark done, or how it was marked and Reopen.
export function ManualTask(props: {
  workspaceId: string
  task: {
    id: string
    title: string
    acceptance: string[]
    manualDone: ManualDone | null
  }
  onChanged: (text: string) => void
}) {
  const client = manualClient(useAppApi())
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = props.task.manualDone
  return (
    <Box aria-label="Manual task" as="section" css-border-color="accent" flex flexCol gap="2" rounded="base" border="all" p="3" data-manual-task>
      <Row gap={2}>
        <Badge variant="warning">Manual</Badge>
        <Box as="span" size="sm">
          A person does this step. No agent works on it.
        </Box>
      </Row>
      <div>
        <Box as="h4" size="sm" weight="semibold">
          What you check
        </Box>
        <Box as="ul" mt="1" listDisc pl="5" size="sm">
          {props.task.acceptance.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </Box>
      </div>
      {done ? (
        <Box flex flexWrap items="center" gap="2" size="sm">
          {done.choice === 'refused' ? <Badge variant="danger">Refused</Badge> : <Badge>{done.choice === 'skipped' ? 'Skipped' : 'Done'}</Badge>}
          <Hint size="xs">
            by {done.login ?? done.by} {relativeTime(done.at)}
            {done.via === 'github' ? ', closed on GitHub' : ''}
          </Hint>
          <DangerBtn
            icon={RotateCcw}
            tooltip="Open it again. The tasks that wait on it stop starting; running chats are left alone."
            confirm={{
              title: 'Reopen this task?',
              body: `New work on the tasks that wait on it stops until it is done again. Chats already running are left alone.`,
              action: 'Reopen',
            }}
            onConfirm={() =>
              void client.reopen(props.workspaceId, props.task.id).then(
                () => props.onChanged('Reopened. The tasks that wait on it wait again.'),
                (caught: unknown) => setError(errorMessage(caught)),
              )
            }
          >
            Reopen
          </DangerBtn>
        </Box>
      ) : (
        <div>
          <IconLabel icon={ClipboardCheck} primary tooltip="Record that the step happened" onClick={() => setOpen(true)}>
            Mark done
          </IconLabel>
        </div>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {open && (
        <MarkDoneDialog
          workspaceId={props.workspaceId}
          taskId={props.task.id}
          title={props.task.title}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false)
            props.onChanged(text)
          }}
        />
      )}
    </Box>
  )
}
