// `panel.view`: everything the chat side panel shows, in one read. Each part is
// read on its own and a part that fails is null, so the panel shows that
// section as unread and the others still show. Read only.
//
// Reads every part with `reads`, an object of name -> () => value | Promise.
// A read that throws is null.
export async function panelView(reads) {
  const out = {};
  await Promise.all(
    Object.entries(reads).map(async ([name, read]) => {
      try {
        out[name] = await read();
      } catch {
        out[name] = null;
      }
    }),
  );
  return { readAt: new Date().toISOString(), ...out };
}
