import { Component, computed, input } from '@angular/core';
import { View } from '@ng-native/components';

/**
 * The small weather icon set, drawn from native views because ng-native 0.9.0
 * ships no SVG element and no icon library (`react-native-svg` is not a
 * dependency). Each glyph is a tree of `<view>`s whose shape comes from
 * `border-radius` and `transform: rotate(...)`; the colour comes from one
 * inline style binding, so size and tone changes cost no new art.
 *
 * `skew` is deliberately never used: Android has no skew on a view.
 */
export type IconName =
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'rain'
  | 'thunder'
  | 'snow'
  | 'fog'
  | 'wind'
  | 'drop'
  | 'warnings'
  | 'info';

/** White glyph on a blue control. */
const INK_LIGHT = '#ffffff';
/** Primary-pressed glyph on a light surface. */
const INK_DARK = '#00537f';
/** The colour a cut-out shows when the glyph sits on the control blue. */
const CUT_LIGHT = '#10658e';
/** The colour a cut-out shows when the glyph sits on a light surface. */
const CUT_DARK = '#ffffff';

@Component({
  selector: 'icon',
  standalone: true,
  imports: [View],
  template: `
    <view class="icon" [style]="{ width: size(), height: size() }">
      @switch (name()) {
        @case ('sun') {
          <!-- disc plus four cardinal rays -->
          <view class="el round sun-body" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round sun-t" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round sun-b" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round sun-l" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round sun-r" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('moon') {
          <!-- a disc with one offset overlay cutting a crescent -->
          <view class="el round moon-body" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round moon-cut" [style]="{ backgroundColor: cut() }"></view>
        }
        @case ('cloud') {
          <!-- a wide rounded bar with a puff on its left top -->
          <view class="el round cloud-bar" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round cloud-puff" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('rain') {
          <!-- a rounded head with two drops under it -->
          <view class="el round head" [style]="{ backgroundColor: ink() }"></view>
          <view class="el b2 drop-a" [style]="{ backgroundColor: ink() }"></view>
          <view class="el b2 drop-b" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('thunder') {
          <!-- a bolt: three rotated bars zig-zagging -->
          <view class="el b2 bolt1" [style]="{ backgroundColor: ink() }"></view>
          <view class="el b2 bolt2" [style]="{ backgroundColor: ink() }"></view>
          <view class="el b2 bolt3" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('snow') {
          <!-- three small flakes -->
          <view class="el round flake-a" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round flake-b" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round flake-c" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('fog') {
          <!-- three horizontal bars -->
          <view class="el round fog-1" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round fog-2" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round fog-3" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('wind') {
          <!-- three alternating wavy bars -->
          <view class="el wind-1" [style]="{ backgroundColor: ink() }"></view>
          <view class="el wind-2" [style]="{ backgroundColor: ink() }"></view>
          <view class="el wind-3" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('drop') {
          <!-- a single drop: rounded head with one tail -->
          <view class="el round head" [style]="{ backgroundColor: ink() }"></view>
          <view class="el b2 drop-c" [style]="{ backgroundColor: ink() }"></view>
        }
        @case ('warnings') {
          <!-- a clipped rotated square reads as a triangle, with a small bang inside -->
          <view class="warn-clip">
            <view class="el b3 warn-tri" [style]="{ backgroundColor: ink() }"></view>
          </view>
          <view class="el b2 warn-bar" [style]="{ backgroundColor: cut() }"></view>
          <view class="el round warn-dot" [style]="{ backgroundColor: cut() }"></view>
        }
        @case ('info') {
          <!-- a disc with an i cut out of it -->
          <view class="el round info-body" [style]="{ backgroundColor: ink() }"></view>
          <view class="el round info-dot" [style]="{ backgroundColor: cut() }"></view>
          <view class="el b2 info-bar" [style]="{ backgroundColor: cut() }"></view>
        }
      }
    </view>
  `,
  styles: `
    :host {
      align-items: center;
      justify-content: center;
    }
    .icon {
      position: relative;
    }
    .el {
      position: absolute;
    }
    .round {
      border-radius: 999px;
    }
    .b2 {
      border-radius: 2px;
    }
    .b3 {
      border-radius: 3px;
    }
    /* sun */
    .sun-body {
      top: 28%;
      left: 28%;
      width: 44%;
      height: 44%;
    }
    .sun-t {
      top: 2%;
      left: 46%;
      width: 8%;
      height: 16%;
    }
    .sun-b {
      bottom: 2%;
      left: 46%;
      width: 8%;
      height: 16%;
    }
    .sun-l {
      left: 2%;
      top: 46%;
      width: 16%;
      height: 8%;
    }
    .sun-r {
      right: 2%;
      top: 46%;
      width: 16%;
      height: 8%;
    }
    /* moon */
    .moon-body {
      top: 8%;
      left: 8%;
      width: 80%;
      height: 80%;
    }
    .moon-cut {
      top: 0%;
      left: 42%;
      width: 66%;
      height: 66%;
    }
    /* cloud */
    .cloud-bar {
      top: 52%;
      left: 8%;
      width: 84%;
      height: 30%;
    }
    .cloud-puff {
      top: 26%;
      left: 18%;
      width: 46%;
      height: 46%;
    }
    /* rain / drop */
    .head {
      top: 6%;
      left: 26%;
      width: 48%;
      height: 44%;
    }
    .drop-a {
      top: 58%;
      left: 34%;
      width: 10%;
      height: 30%;
    }
    .drop-b {
      top: 58%;
      left: 56%;
      width: 10%;
      height: 30%;
    }
    .drop-c {
      top: 58%;
      left: 45%;
      width: 10%;
      height: 30%;
    }
    /* thunder */
    .bolt1 {
      top: 3%;
      left: 50%;
      width: 18%;
      height: 46%;
      transform: rotate(22deg);
    }
    .bolt2 {
      top: 42%;
      left: 26%;
      width: 48%;
      height: 15%;
      transform: rotate(-22deg);
    }
    .bolt3 {
      top: 52%;
      left: 30%;
      width: 18%;
      height: 46%;
      transform: rotate(22deg);
    }
    /* snow */
    .flake-a {
      top: 18%;
      left: 43%;
      width: 14%;
      height: 14%;
    }
    .flake-b {
      top: 52%;
      left: 18%;
      width: 14%;
      height: 14%;
    }
    .flake-c {
      top: 52%;
      left: 68%;
      width: 14%;
      height: 14%;
    }
    /* fog */
    .fog-1 {
      top: 22%;
      left: 8%;
      width: 84%;
      height: 10%;
      border-radius: 6px;
    }
    .fog-2 {
      top: 45%;
      left: 18%;
      width: 74%;
      height: 10%;
      border-radius: 6px;
    }
    .fog-3 {
      top: 68%;
      left: 8%;
      width: 84%;
      height: 10%;
      border-radius: 6px;
    }
    /* wind */
    .wind-1 {
      top: 22%;
      left: 8%;
      width: 74%;
      height: 12%;
      border-radius: 6px;
    }
    .wind-2 {
      top: 44%;
      left: 18%;
      width: 74%;
      height: 12%;
      border-radius: 0 6px 0 6px;
    }
    .wind-3 {
      top: 66%;
      left: 8%;
      width: 84%;
      height: 12%;
      border-radius: 6px 0 6px 0;
    }
    /* warnings */
    .warn-clip {
      position: absolute;
      top: 10%;
      left: 6%;
      width: 88%;
      height: 52%;
      overflow: hidden;
    }
    .warn-tri {
      top: 0%;
      left: 16%;
      width: 68%;
      height: 96%;
      transform: rotate(45deg);
    }
    .warn-bar {
      top: 30%;
      left: 46%;
      width: 8%;
      height: 18%;
    }
    .warn-dot {
      top: 53%;
      left: 46%;
      width: 8%;
      height: 8%;
    }
    /* info */
    .info-body {
      top: 8%;
      left: 8%;
      width: 84%;
      height: 84%;
    }
    .info-dot {
      top: 24%;
      left: 46%;
      width: 9%;
      height: 9%;
    }
    .info-bar {
      top: 40%;
      left: 46%;
      width: 9%;
      height: 30%;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  /** `light` is a white glyph on a blue control; `dark` is pressed blue on a surface. */
  readonly tone = input<'light' | 'dark'>('light');
  readonly size = input<number>(24);

  /** The glyph colour. */
  protected readonly ink = computed(() => (this.tone() === 'light' ? INK_LIGHT : INK_DARK));

  /** The colour a cut-out inside the glyph shows, i.e. what sits behind the icon. */
  protected readonly cut = computed(() => (this.tone() === 'light' ? CUT_LIGHT : CUT_DARK));
}
