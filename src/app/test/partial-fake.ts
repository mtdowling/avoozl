// A fake that holds only the calls a test gives, typed as the whole
// interface the code under test takes. The code reaches only the calls the
// test's path needs; a call left out stays absent at run time, so a check
// for its presence finds none, just as on the fake before it was typed.
// shortcut: the one place a test fake is widened to its interface; replace a
// use with a full fake when its path grows past what the test names.
// `given` may hold calls the interface does not name but the code reaches
// through an untyped module.
export const partialFake = <T extends object>(
  given: Partial<T> & Record<string, unknown>,
): T => given as T;
