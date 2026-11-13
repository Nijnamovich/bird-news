/** Pure display helpers for the weather screen. No Angular, no native imports. */

import type { FreshnessBadge } from './snapshot-cache.ts';
import type { Cardinal } from './weather-snapshot.types.ts';

const LOCALE = 'es-AR';

/**
 * One `Intl.DateTimeFormat` per locale + timeZone + shape, built lazily.
 *
 * The template calls these helpers on every change-detection pass, and
 * constructing a formatter is the expensive part; formatting itself is not.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  kind: 'hour' | 'day',
  timeZone: string,
): Intl.DateTimeFormat {
  const key = `${LOCALE}|${timeZone}|${kind}`;
  const cached = formatters.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const created =
    kind === 'hour'
      ? new Intl.DateTimeFormat(LOCALE, {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
      : new Intl.DateTimeFormat(LOCALE, {
          timeZone,
          weekday: 'short',
          day: 'numeric',
        });
  formatters.set(key, created);
  return created;
}

export function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}°`;
}

export function formatWind(speed: number, cardinal: Cardinal | null): string {
  const value = `${Math.round(speed)} km/h`;
  return cardinal === null ? value : `${value} ${cardinal}`;
}

export function formatAge(ageSeconds: number): string {
  const seconds = Math.max(0, Math.floor(ageSeconds));
  if (seconds < 60) {
    return 'hace menos de 1 min';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  return `hace ${Math.floor(hours / 24)} d`;
}

export function formatHour(iso: string, timezone: string): string {
  try {
    const parts = formatterFor('hour', timezone).formatToParts(new Date(iso));

    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch {
    return '--:--';
  }
}

/** `'2026-11-16'` → `'lun 16'`, using the es-AR short weekday. */
export function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  try {
    const parts = formatterFor('day', 'UTC').formatToParts(parsed);

    const weekday = (parts.find((part) => part.type === 'weekday')?.value ?? '')
      .replace(/\.$/, '')
      .trim();
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    return weekday.length > 0 ? `${weekday} ${day}` : day;
  } catch {
    return date;
  }
}

export function freshnessLabel(badge: FreshnessBadge): string {
  switch (badge) {
    case 'none':
      return '';
    case 'updated':
      return 'Actualizado';
    case 'stale':
      return 'Datos desactualizados';
    case 'expired':
      return 'Datos vencidos';
    case 'error':
      return 'Sin datos';
  }
}
