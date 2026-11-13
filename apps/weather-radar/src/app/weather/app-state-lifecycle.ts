/**
 * React Native `AppState` adapter for the foreground seam.
 *
 * Imported by `src/main.ts` only: composing it there keeps `App` and every
 * Vitest module free of native imports.
 */

import { AppState } from 'react-native';
import type { AppLifecycle } from './app-lifecycle.ts';

export class AppStateLifecycle implements AppLifecycle {
  onForeground(listener: () => void): () => void {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        listener();
      }
    });
    return () => subscription.remove();
  }
}
