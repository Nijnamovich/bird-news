/**
 * File-backed `SnapshotStore`, expressed over a tiny structural file handle.
 *
 * The handle has the same shape as the `expo-file-system` `File` methods used
 * here, but this module imports no native code: Vitest can drive it with a fake
 * and assert the discard/create/swallow branches. The native factory in
 * `snapshot-file-store.ts` is composed only by `src/main.ts`.
 */

import { decodeStoredSnapshot, encodeStoredSnapshot } from './snapshot-persistence.ts';
import type { SnapshotStore } from './snapshot-store.ts';
import type { StoredSnapshot } from './snapshot-cache.ts';

/** The narrow slice of an Expo `File` this adapter uses. */
export interface SnapshotFileHandle {
  readonly exists: boolean;
  textSync(): string;
  create(options: { intermediates: boolean }): void;
  writeSync(content: string): void;
  delete(): void;
}

export class FileSnapshotStore implements SnapshotStore {
  private readonly file: SnapshotFileHandle;
  private readonly nowMs: () => number;

  constructor(file: SnapshotFileHandle, nowMs: () => number = Date.now) {
    this.file = file;
    this.nowMs = nowMs;
  }

  read(): StoredSnapshot | null {
    try {
      if (!this.file.exists) {
        return null;
      }
      const stored = decodeStoredSnapshot(this.file.textSync(), this.nowMs());
      if (stored === null) {
        // Corrupt, foreign or past the purge window: drop it silently.
        this.discard();
      }
      return stored;
    } catch {
      this.discard();
      return null;
    }
  }

  write(stored: StoredSnapshot): void {
    try {
      const raw = encodeStoredSnapshot(stored);
      if (raw === null) {
        // Never replace a good pull document with a fixture or an error.
        return;
      }
      if (!this.file.exists) {
        this.file.create({ intermediates: true });
      }
      this.file.writeSync(raw);
    } catch {
      // Storage is best-effort; the in-memory document still renders.
    }
  }

  private discard(): void {
    try {
      if (this.file.exists) {
        this.file.delete();
      }
    } catch {
      // Nothing else to do: the next read decides again.
    }
  }
}
