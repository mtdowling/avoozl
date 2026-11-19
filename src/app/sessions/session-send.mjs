// Send message on a `process` session (R98.2, design §4.28): a person's
// message is queued as a `send` session request. The backend's drain hands
// it to the supervisor, which resumes the child with it once its current
// run exits. Avoozl itself never types into a child.
import { fail } from "../store/store.mjs";
import { enqueueSessionRequests } from "./session-requests.mjs";

export const SEND_MAX_CHARS = 8000;
// The resume turn's first line, so the child tells the person's message from
// relayed text; the process brief names it (processSteps). Only a person
// queues a send (session.send is person-only), so the line is Avoozl's own.
export const PERSON_MESSAGE_HEAD =
  "From the person who runs this task, sent with Send message on the Avoozl page:";
export const personMessage = (text) => `${PERSON_MESSAGE_HEAD}\n\n${text}`;
const FINISHED = new Set(["closed", "lost", "gone"]);

// session.send: {slot, text}. Returns the queued request's id and state.
export function queueSessionSend(store, input = {}) {
  const slot = input.slot;
  if (typeof slot !== "string" || !slot) fail("Name the session.", 422);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) fail("Write a message to send.", 422);
  if (text.length > SEND_MAX_CHARS)
    fail(`A message is at most ${SEND_MAX_CHARS} characters.`, 422);
  const binding = store.get("session_bindings", slot);
  if (!binding) fail(`No session ${slot}.`, 404);
  if (binding.executor !== "process")
    fail("Send message here is for process sessions; open the chat.", 409);
  if (FINISHED.has(binding.status))
    fail(`Session ${slot} has ended; it takes no messages.`, 409);
  const {
    sends: [request],
  } = enqueueSessionRequests(
    store,
    {
      sends: [
        {
          executor: "process",
          slot,
          task: binding.taskId,
          role: binding.role,
          text: personMessage(text),
        },
      ],
    },
    { source: "person" },
  );
  return { id: request.id, state: "queued", slot, taskId: binding.taskId };
}
