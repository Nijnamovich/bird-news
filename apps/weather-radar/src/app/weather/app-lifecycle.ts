/**
 * Foreground transitions, behind a seam.
 *
 * The native adapter (`app-state-lifecycle.ts`) wraps React Native's `AppState`
 * and is composed only at the entry point; `App` depends on this interface, so
 * the hermetic render test never imports a native module.
 */
export interface AppLifecycle {
  /** Call `listener` whenever the app returns to the foreground. Returns an unsubscribe. */
  onForeground(listener: () => void): () => void;
}
