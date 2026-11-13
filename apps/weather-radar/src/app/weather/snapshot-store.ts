/**
 * The persisted-snapshot seam.
 *
 * `read` is synchronous on purpose: the screen hydrates the last-known-good
 * document in its constructor, before the first change detection paints. The
 * native file adapter can answer synchronously (`File.textSync`), and the
 * in-memory adapter used by tests trivially can.
 *
 * Implementations are best-effort: a storage failure must never stop the screen
 * from rendering. They return null / swallow the write instead of throwing into
 * the component.
 */

import type { StoredSnapshot } from './snapshot-cache.ts';

export interface SnapshotStore {
  /** Last-known-good document, or null when absent/corrupt/expired. */
  read(): StoredSnapshot | null;
  /** Persist a value; non-persistable documents are ignored by the adapter. */
  write(stored: StoredSnapshot): void;
}

/** Hermetic store for tests and the zero-configuration default. */
export class MemorySnapshotStore implements SnapshotStore {
  private stored: StoredSnapshot | null;

  constructor(initial: StoredSnapshot | null = null) {
    this.stored = initial;
  }

  read(): StoredSnapshot | null {
    return this.stored;
  }

  write(stored: StoredSnapshot): void {
    this.stored = stored;
  }
}
