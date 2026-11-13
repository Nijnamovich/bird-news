import { cleanup, render, screen } from '@ng-native/testing';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from './app.ts';

afterEach(() => {
  cleanup();
});

/**
 * Hermetic component test: the bundled fixture only. `PULL_BASE_URL` is the
 * empty string, so the screen makes no network call.
 */
describe('App', () => {
  test('should render the fixture screen with 24 hour cards and 7 day rows', async () => {
    const result = await render(App);
    try {
      // The location paints from the fallback before the fixture resolves; the
      // temperature waits for it.
      expect(screen.getByText('Necochea')).toBeTruthy();
      // The current temperature also appears in hour cards, so match all.
      expect((await screen.findAllByText('19°', undefined, { timeout: 1000 })).length).toBeGreaterThan(0);

      expect(screen.getByText('Próximas horas')).toBeTruthy();
      expect(screen.getByText('Próximos 7 días')).toBeTruthy();

      expect(screen.getAllByTestId('day-row')).toHaveLength(7);
      expect(screen.getAllByTestId('hour-card')).toHaveLength(24);
    } finally {
      result.unmount();
    }
  });
});
