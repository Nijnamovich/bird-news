/**
 * `expo-file-system` factory for the persisted-snapshot seam.
 *
 * This is the only module that names the native module, and only `src/main.ts`
 * imports it. The file logic itself lives in `snapshot-file-adapter.ts`, which
 * is native-free and unit-tested with a fake handle.
 *
 * `File`/`Paths` come from the SDK 58 file-system module (already a transitive
 * dependency of `expo`, declared explicitly in `package.json`).
 */

import { File, Paths } from 'expo-file-system';
import { FileSnapshotStore } from './snapshot-file-adapter.ts';
import type { SnapshotStore } from './snapshot-store.ts';

const SNAPSHOT_FILE_NAME = 'weather-snapshot-v1.json';

export function createFileSnapshotStore(): SnapshotStore {
  return new FileSnapshotStore(new File(Paths.document, SNAPSHOT_FILE_NAME));
}
