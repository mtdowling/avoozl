// The frames box exec and its broker speak over the session's Unix socket
// (vm-harness D3): one type byte, a 4-byte big-endian length, the payload.
//
//   H  hello: JSON {command, cwd}, the first frame from box exec
//   I  standard input bytes;  E  standard input ended
//   S  a signal name to pass on (SIGTERM, SIGINT, SIGHUP)
//   O  standard output bytes; R  standard error bytes
//   X  the command's exit: JSON {code}
//   F  refused: a message; box exec prints it and exits 126
//
// It imports nothing outside Node, so a sandbox needs to open only these
// files to run box exec.
export const MAX_FRAME = 8 * 1024 * 1024;
export const SIGNALS = new Set(["SIGTERM", "SIGINT", "SIGHUP"]);

export function frame(type, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(
        typeof payload === "string" ? payload : JSON.stringify(payload),
      );
  const head = Buffer.alloc(5);
  head.write(type, 0, 1, "latin1");
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
}

// Feed socket chunks in; `onFrame(type, payload)` gets each whole frame.
// A frame over MAX_FRAME ends the reader with an error.
export function frameReader(onFrame, onError) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 5) {
      const length = buffer.readUInt32BE(1);
      if (length > MAX_FRAME) {
        buffer = Buffer.alloc(0);
        onError(new Error("A box exec frame is too large."));
        return;
      }
      if (buffer.length < 5 + length) return;
      const type = buffer.toString("latin1", 0, 1),
        payload = buffer.subarray(5, 5 + length);
      buffer = buffer.subarray(5 + length);
      onFrame(type, payload);
    }
  };
}
