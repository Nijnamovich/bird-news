/**
 * Injection tokens for the two host-bound collaborators.
 *
 * `App` resolves these optionally: with no provider it uses an in-memory store
 * and the HTTP provider built from the base-URL constants. `src/main.ts`
 * supplies the native file store and the `AppState` adapter; tests supply
 * in-memory fakes. Tokens carry no native import, so this file is safe to load
 * from Vitest.
 */

import { InjectionToken } from '@angular/core';
import type { AppLifecycle } from './app-lifecycle.ts';
import type { SnapshotProvider } from './snapshot-provider.ts';
import type { SnapshotStore } from './snapshot-store.ts';

export const SNAPSHOT_STORE = new InjectionToken<SnapshotStore>('SNAPSHOT_STORE');
export const SNAPSHOT_PULL_PROVIDER = new InjectionToken<SnapshotProvider>(
  'SNAPSHOT_PULL_PROVIDER',
);
export const APP_LIFECYCLE = new InjectionToken<AppLifecycle>('APP_LIFECYCLE');
