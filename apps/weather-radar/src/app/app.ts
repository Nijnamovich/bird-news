import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { SafeAreaProvider, SafeAreaView, ScrollView, Text, View } from '@ng-native/components';
import { ColorScheme, StatusBar } from '@ng-native/device';
import { Icon, type IconName } from './icons.ts';
import {
  DEFAULT_CACHE_CONFIG,
  errorState,
  evaluateSnapshot,
  shouldAcceptIncoming,
  type CacheConfig,
  type StoredSnapshot,
} from './weather/snapshot-cache.ts';
import { iconNameFor } from './weather/snapshot-icons.ts';
import {
  FixtureSnapshotProvider,
  HttpPullSnapshotProvider,
} from './weather/snapshot-provider.ts';
import {
  formatAge,
  formatDay,
  formatHour,
  formatTemperature,
  formatWind,
  freshnessLabel,
} from './weather/format.ts';
import { resolvePullBaseUrl } from './weather/pull-base-url.ts';
import type {
  AlertSeverity,
  Cardinal,
  IconCode,
  WeatherAlert,
} from './weather/weather-snapshot.types.ts';

/** Platform typeface stack; the stylesheet's colours are the CSS source of truth. */
const FONT_FAMILY = 'Roboto, Droid Sans, sans-serif';
/** Screen gutter and hourly-card width, in density-independent pixels. */
const PAGE_PADDING = 16;
const HOUR_CARD_WIDTH = 64;
/** Alert edge colours (warnings yellow / error red). */
const ACCENT_COLOR = '#ffbe00';
const ERROR_COLOR = '#e00000';

/**
 * Production pull origin. Set it to a NAMED Cloudflare tunnel with a stable
 * hostname, e.g. `'https://weather.<your-domain>'`; a quick tunnel is rejected
 * because its rotating hostname breaks the saved value.
 *
 * Empty (the shipped default) → bundled fixture and zero network requests.
 * Only `https://` or the empty string is accepted here.
 */
const PULL_BASE_URL = '';

/**
 * DEV ONLY: plain-HTTP producer on this machine, served by
 * `npm run weather:serve` and reached with `adb reverse tcp:8080 tcp:8080`
 * (or the LAN IP). Empty by default.
 *
 * This is the seam that later becomes the named-tunnel URL in
 * `PULL_BASE_URL`; insecure HTTP is reachable ONLY from this constant.
 */
const DEV_HTTP_BASE_URL = '';

const resolvedPullBaseUrl = resolvePullBaseUrl({
  production: PULL_BASE_URL,
  dev: DEV_HTTP_BASE_URL,
});
if (!resolvedPullBaseUrl.ok) {
  throw new Error(resolvedPullBaseUrl.error);
}
const ACTIVE_PULL_BASE_URL = resolvedPullBaseUrl.value;

/**
 * The only screen.
 *
 * Read-only contract: one parameterless GET to the companion producer, with
 * `Accept: application/json` only. No request body, cookies, authorization
 * header, device identifier, or user-data query parameter.
 *
 * The bundled fixture paints immediately. A successful pull replaces it only
 * when `shouldAcceptIncoming` says the document is new enough. On any failure
 * the last-known-good stays on screen; there is no error toast when data
 * exists.
 *
 * Cache is in-memory on purpose. Persistence is not implemented in this
 * version: the last-known-good document lives for the session only, so a cold
 * start always falls back to the bundled fixture.
 *
 * Element names are lowercase, and that is load-bearing: an uppercase name is
 * read as an unknown Angular component and commits as an empty view.
 */
@Component({
  selector: 'app-root',
  imports: [SafeAreaProvider, SafeAreaView, ScrollView, Text, View, Icon],
  template: `
    <safe-area-provider>
      <safe-area-view class="screen" [style]="screenStyle">
        <scroll-view class="page">
          <view class="content" [style]="pageContentStyle">
            @if (current(); as c) {
              <view class="header">
                <text class="place">{{ locationName() }}</text>
                <text class="condition">{{ c.condition.text }}</text>
                <view class="hero">
                  <icon [name]="heroIcon()" [size]="64" [tone]="iconTone()" />
                  <text class="temperature">{{ temperature(c.temperature) }}</text>
                </view>
                <text class="feels">Sensación {{ temperature(c.feelsLike) }}</text>
                <view class="metrics">
                  <text class="metric">
                    Viento {{ wind(c.wind.speed, c.wind.directionCardinal) }}
                  </text>
                  <text class="metric">Humedad {{ c.humidity }}%</text>
                </view>
              </view>
            } @else {
              <view class="header">
                <text class="place">{{ locationName() }}</text>
                <text class="condition">{{ bannerText() }}</text>
              </view>
            }

            <view
              class="banner"
              [class.banner-stale]="freshness().state === 'stale'"
              [class.banner-expired]="freshness().state === 'expired' || freshness().state === 'error'"
            >
              <icon [name]="'info'" [size]="14" [tone]="iconTone()" />
              <text class="banner-text">{{ bannerText() }}</text>
              @if (freshness().document !== null) {
                <text class="banner-age">· {{ age(freshness().ageSeconds) }}</text>
              }
            </view>

            @for (alert of activeAlerts(); track alert.id) {
              <view class="alert" [style]="alertStyle(alert.severity)">
                <icon [name]="'warnings'" [size]="20" [tone]="iconTone()" />
                <view class="alert-copy">
                  <text class="alert-title">{{ alert.title }}</text>
                  <text class="alert-text">{{ alert.text }}</text>
                </view>
              </view>
            }

            @if (hourly().length > 0) {
              <view class="section">
                <text class="section-title">Próximas horas</text>
                <scroll-view
                  class="hours"
                  [horizontal]="true"
                  contentContainerClass="hours-content"
                >
                  @for (entry of nextHours(); track entry.time) {
                    <view class="hour" testID="hour-card" [style]="hourStyle">
                      <text class="hour-time">{{ hour(entry.time) }}</text>
                      <icon [name]="iconFor(entry.iconCode)" [size]="24" [tone]="iconTone()" />
                      <text class="hour-temp">{{ temperature(entry.temperature) }}</text>
                      <view class="hour-precip">
                        <icon [name]="'drop'" [size]="10" [tone]="iconTone()" />
                        <text class="hour-precip-text">{{ entry.precipProbability }}%</text>
                      </view>
                    </view>
                  }
                </scroll-view>
              </view>
            }

            @if (daily().length > 0) {
              <view class="section">
                <text class="section-title">Próximos 7 días</text>
                <view class="days">
                  @for (entry of daily(); track entry.date) {
                    <view class="day" testID="day-row">
                      <text class="day-name">{{ day(entry.date) }}</text>
                      <icon [name]="iconFor(entry.iconCode)" [size]="22" [tone]="iconTone()" />
                      <text class="day-precip">{{ entry.precipProbability }}%</text>
                      <text class="day-temps">
                        {{ temperature(entry.tempMin) }} / {{ temperature(entry.tempMax) }}
                      </text>
                    </view>
                  }
                </view>
              </view>
            }

            @if (source(); as from) {
              <text class="attribution">
                {{ from.attribution }} · solo lectura · uso personal
              </text>
            }
          </view>
        </scroll-view>
      </safe-area-view>
    </safe-area-provider>
  `,
  styles: `
    :host {
      flex: 1;
    }
    .screen {
      flex: 1;
      background-color: #f2f7f9;
    }
    .page {
      flex: 1;
    }
    .content {
      gap: 14px;
      padding-bottom: 28px;
    }
    .header {
      padding: 20px;
      gap: 4px;
      border-radius: 14px;
      background-color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 39, 60, 0.12);
    }
    .place {
      font-size: 26px;
      font-weight: 700;
      color: #00273c;
    }
    .condition {
      font-size: 15px;
      color: #464646;
    }
    .hero {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .temperature {
      font-size: 64px;
      font-weight: 700;
      color: #00273c;
    }
    .feels {
      font-size: 13px;
      color: #464646;
    }
    .metrics {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 10px;
    }
    .metric {
      font-size: 13px;
      color: #10658e;
    }
    .banner {
      flex-direction: row;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 8px;
      background-color: #e6eff3;
    }
    .banner-text {
      font-size: 12px;
      font-weight: 700;
      color: #00537f;
    }
    .banner-age {
      font-size: 12px;
      color: #00537f;
    }
    .banner-stale {
      background-color: #fff3cd;
    }
    .banner-expired {
      background-color: #fde8e8;
    }
    .alert {
      flex-direction: row;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border-left-width: 4px;
      border-radius: 8px;
      background-color: #fff8e1;
    }
    .alert-copy {
      flex: 1;
      gap: 2px;
    }
    .alert-title {
      font-size: 13px;
      font-weight: 700;
      color: #3c3c3c;
    }
    .alert-text {
      font-size: 12px;
      color: #3c3c3c;
    }
    .section {
      gap: 8px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #00273c;
    }
    .hours {
      height: 124px;
    }
    .hours-content {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      padding: 0 2px;
    }
    .hour {
      height: 112px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 10px;
      background-color: #ffffff;
    }
    .hour-time {
      font-size: 12px;
      color: #464646;
    }
    .hour-temp {
      font-size: 16px;
      font-weight: 700;
      color: #00273c;
    }
    .hour-precip {
      flex-direction: row;
      align-items: center;
      gap: 2px;
    }
    .hour-precip-text {
      font-size: 10px;
      color: #10658e;
    }
    .days {
      border-radius: 12px;
      overflow: hidden;
      background-color: #ffffff;
    }
    .day {
      flex-direction: row;
      align-items: center;
      gap: 12px;
      min-height: 46px;
      padding: 0 12px;
      border-bottom-width: 1px;
      border-bottom-color: #e6eff3;
    }
    .day-name {
      width: 70px;
      font-size: 13px;
      font-weight: 700;
      color: #3c3c3c;
    }
    .day-precip {
      width: 42px;
      text-align: right;
      font-size: 12px;
      color: #10658e;
    }
    .day-temps {
      flex: 1;
      text-align: right;
      font-size: 13px;
      color: #00273c;
    }
    .attribution {
      margin-top: 6px;
      font-size: 11px;
      color: #a0a0a0;
      text-align: center;
    }
    @media (prefers-color-scheme: dark) {
      .screen {
        background-color: #00273c;
      }
      .header,
      .hour,
      .days {
        background-color: #003959;
      }
      .place,
      .temperature,
      .section-title,
      .hour-temp,
      .day-temps {
        color: #f2f7f9;
      }
      .condition,
      .feels,
      .hour-time,
      .day-name {
        color: #c7d8e2;
      }
      .metric,
      .day-precip,
      .hour-precip-text {
        color: #8fd3f4;
      }
      .banner {
        background-color: #003959;
      }
      .banner-text,
      .banner-age {
        color: #f2f7f9;
      }
      .banner-stale {
        background-color: #4a3b00;
      }
      .banner-expired {
        background-color: #4a0d0d;
      }
      .alert {
        background-color: #3d3418;
      }
      .alert-title,
      .alert-text {
        color: #f2f7f9;
      }
      .day {
        border-bottom-color: #0b4a6b;
      }
    }
  `,
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly colorScheme = inject(ColorScheme);
  private readonly fixture = new FixtureSnapshotProvider();
  private readonly pull = new HttpPullSnapshotProvider({
    baseUrl: ACTIVE_PULL_BASE_URL,
    // Insecure HTTP is reachable ONLY from DEV_HTTP_BASE_URL above.
    allowInsecureHttp: ACTIVE_PULL_BASE_URL.startsWith('http://'),
  });

  private readonly nowMs = signal(Date.now());
  private readonly stored = signal<StoredSnapshot | null>(null);
  private readonly failed = signal(false);

  private destroyed = false;
  private clock: ReturnType<typeof setInterval> | null = null;

  /**
   * The document's own freshness windows, with `DEFAULT_CACHE_CONFIG` as the
   * fallback when nothing is stored. Purging remains a local-cache policy.
   */
  private readonly cacheConfig = computed<CacheConfig>(() => {
    const stored = this.stored();
    if (stored === null) {
      return DEFAULT_CACHE_CONFIG;
    }
    return {
      ttlSeconds: stored.doc.timing.ttlSeconds,
      staleAfterSeconds: stored.doc.timing.staleAfterSeconds,
      purgeAfterLocalSeconds: DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds,
    };
  });

  /** Cache evaluation, including the "no document and load failed" state. */
  protected readonly freshness = computed(() => {
    const stored = this.stored();
    if (stored === null && this.failed()) {
      return errorState();
    }
    return evaluateSnapshot(this.nowMs(), stored, this.cacheConfig());
  });

  protected readonly snapshot = computed(() => this.freshness().document);
  protected readonly current = computed(() => this.snapshot()?.current ?? null);
  protected readonly hourly = computed(() => this.snapshot()?.hourly ?? []);
  protected readonly daily = computed(() => this.snapshot()?.daily ?? []);
  protected readonly nextHours = computed(() => this.hourly());
  protected readonly source = computed(() => this.snapshot()?.source ?? null);
  protected readonly locationName = computed(
    () => this.snapshot()?.location.name ?? 'Necochea',
  );
  protected readonly timezone = computed(
    () => this.snapshot()?.location.timezone ?? 'America/Argentina/Buenos_Aires',
  );

  protected readonly bannerText = computed(() => {
    const state = this.freshness();
    // A bundled demo document is not "stale" in the sense that matters: it is a sample.
    if (this.snapshot()?.source.id === 'fixture') {
      return 'Datos de ejemplo · sin conexión';
    }
    if (state.state === 'loading' && state.document === null) {
      return 'Cargando…';
    }
    return freshnessLabel(state.badge);
  });

  /** Alerts that are severe enough to show and currently in their window. */
  protected readonly activeAlerts = computed<readonly WeatherAlert[]>(() => {
    const now = this.nowMs();
    return (this.snapshot()?.alerts ?? []).filter((alert) => {
      if (
        alert.severity !== 'moderate' &&
        alert.severity !== 'severe' &&
        alert.severity !== 'extreme'
      ) {
        return false;
      }
      const startsAt = Date.parse(alert.startsAt);
      if (!Number.isFinite(startsAt) || startsAt > now) {
        return false;
      }
      if (alert.endsAt === null) {
        return true;
      }
      const endsAt = Date.parse(alert.endsAt);
      return Number.isFinite(endsAt) && now <= endsAt;
    });
  });

  protected readonly heroIcon = computed<IconName>(() => {
    const current = this.current();
    return current === null ? 'cloud' : iconNameFor(current.iconCode);
  });

  protected readonly screenStyle = { fontFamily: FONT_FAMILY };
  protected readonly pageContentStyle = { padding: PAGE_PADDING };
  protected readonly hourStyle = { width: HOUR_CARD_WIDTH };

  /** Glyph ink follows the resolved colour scheme, not the OS alone. */
  protected readonly iconTone = computed<'light' | 'dark'>(() =>
    this.colorScheme.current() === 'dark' ? 'light' : 'dark',
  );

  constructor() {
    inject(StatusBar).set({ style: 'auto' });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.clock !== null) {
        clearInterval(this.clock);
        this.clock = null;
      }
    });

    // The fixture is local, so it paints in the same microtask turn.
    void this.paintFixtureThenRefresh();

    // Keeps the freshness label honest while the screen stays open.
    this.clock = setInterval(() => {
      if (!this.destroyed) {
        this.nowMs.set(Date.now());
      }
    }, 60_000);
  }

  protected temperature(celsius: number): string {
    return formatTemperature(celsius);
  }

  protected wind(speed: number, cardinal: Cardinal | null): string {
    return formatWind(speed, cardinal);
  }

  protected age(seconds: number): string {
    return formatAge(seconds);
  }

  protected hour(iso: string): string {
    return formatHour(iso, this.timezone());
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected iconFor(code: IconCode): IconName {
    return iconNameFor(code);
  }

  protected alertStyle(severity: AlertSeverity): { borderLeftColor: string } {
    return {
      borderLeftColor:
        severity === 'severe' || severity === 'extreme' ? ERROR_COLOR : ACCENT_COLOR,
    };
  }

  private async paintFixtureThenRefresh(): Promise<void> {
    const loaded = await this.fixture.load();
    if (this.destroyed) {
      return;
    }
    // Do not overwrite a live document that won a race with the fixture.
    if (this.stored() === null && loaded.kind === 'snapshot') {
      this.store(loaded.doc, Date.now());
    }
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (ACTIVE_PULL_BASE_URL.length === 0) {
      return;
    }

    // Only a document that came from the pull producer can match its ETag;
    // the bundled fixture carries a different snapshotId.
    const known = this.stored();
    const knownSnapshotId =
      known !== null && known.doc.source.id !== 'fixture' ? known.doc.snapshotId : undefined;

    try {
      const result = await this.pull.load(knownSnapshotId);
      if (this.destroyed) {
        return;
      }
      if (result.kind === 'not-modified') {
        // Revalidated: the cached bytes stand, but the local clock restarts.
        const cached = this.stored();
        if (cached !== null) {
          this.stored.set({ doc: cached.doc, receivedAtLocalMs: Date.now() });
        }
        this.failed.set(false);
        this.nowMs.set(Date.now());
        return;
      }
      const decision = shouldAcceptIncoming(this.stored(), result.doc);
      if (decision.accept) {
        this.store(result.doc, Date.now());
      } else {
        // Duplicate/older still proves upstream reachable: clear a stale error flag.
        this.failed.set(false);
      }
    } catch {
      if (this.destroyed) {
        return;
      }
      // Keep last-known-good. A fixture is data, so no error toast is shown.
      this.failed.set(true);
      this.nowMs.set(Date.now());
    }
  }

  private store(doc: StoredSnapshot['doc'], receivedAtLocalMs: number): void {
    this.stored.set({ doc, receivedAtLocalMs });
    this.nowMs.set(Date.now());
    this.failed.set(false);
  }
}
