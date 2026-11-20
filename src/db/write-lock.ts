/**
 * Serializes multi-step write transactions inside this single-user desktop process.
 * This replaces cross-server PostgreSQL advisory locks because the embedded PGlite
 * database is owned by one local server process.
 */
const state = globalThis as typeof globalThis & { __chronosWriteTail?: Promise<void> };

export function withDatabaseWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = state.__chronosWriteTail ?? Promise.resolve();
  const current = previous.then(work, work);
  state.__chronosWriteTail = current.then(() => undefined, () => undefined);
  return current;
}
