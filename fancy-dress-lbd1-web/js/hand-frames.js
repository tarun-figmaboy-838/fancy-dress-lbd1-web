/* ============================================================================
 *  hand-frames.js — the tap-hand animation as one sprite sheet.
 *
 *  The 69 authored frames are 1200x1200 canvases whose artwork occupies only
 *  314x594 of them, and they are displayed in a 400x400 node. Swapping
 *  background-image 50 times a second therefore asked Chrome to rasterise a
 *  1.4M-pixel bitmap down to ~200px on every frame, and to keep up to 397MB of
 *  decoded frames alive — which is what made the hand stutter.
 *
 *  Here they are cropped to the artwork, scaled to the size they actually
 *  render at, and packed into one texture. Playback becomes a
 *  background-position change: no decode, no raster, compositor only.
 *
 *  `inset` places the sprite layer over the sub-rect of the node that the crop
 *  came from, as a percentage, so the artwork keeps exactly the position and
 *  size inside the node that it had before — placeHand()'s HAND_ART centroid
 *  and every authored coordinate stay valid.
 *
 *  Regenerate with scratchpad/buildsheet.js --write.
 * ========================================================================== */
window.SPRITE_SHEETS = {
  tapHand: {
    src: "assets/img/tap_hand_sheet.webp",
    cols: 12, rows: 6,
    inset: [31,37.3333,19.5,36.5],
    frames: {
      "assets/img/frame_00_delay-0.02s.gif": [0, 0],
      "assets/img/frame_01_delay-0.02s.gif": [1, 0],
      "assets/img/frame_02_delay-0.02s.gif": [2, 0],
      "assets/img/frame_03_delay-0.02s.gif": [3, 0],
      "assets/img/frame_04_delay-0.02s.gif": [4, 0],
      "assets/img/frame_05_delay-0.02s.gif": [5, 0],
      "assets/img/frame_06_delay-0.02s.gif": [6, 0],
      "assets/img/frame_07_delay-0.02s.gif": [7, 0],
      "assets/img/frame_08_delay-0.02s.gif": [8, 0],
      "assets/img/frame_09_delay-0.02s.gif": [9, 0],
      "assets/img/frame_10_delay-0.02s.gif": [10, 0],
      "assets/img/frame_11_delay-0.02s.gif": [11, 0],
      "assets/img/frame_12_delay-0.02s.gif": [0, 1],
      "assets/img/frame_13_delay-0.02s.gif": [1, 1],
      "assets/img/frame_14_delay-0.02s.gif": [2, 1],
      "assets/img/frame_15_delay-0.02s.gif": [3, 1],
      "assets/img/frame_16_delay-0.02s.gif": [4, 1],
      "assets/img/frame_17_delay-0.02s.gif": [5, 1],
      "assets/img/frame_18_delay-0.02s.gif": [6, 1],
      "assets/img/frame_19_delay-0.02s.gif": [7, 1],
      "assets/img/frame_20_delay-0.02s.gif": [8, 1],
      "assets/img/frame_21_delay-0.02s.gif": [9, 1],
      "assets/img/frame_22_delay-0.02s.gif": [10, 1],
      "assets/img/frame_23_delay-0.02s.gif": [11, 1],
      "assets/img/frame_24_delay-0.02s.gif": [0, 2],
      "assets/img/frame_25_delay-0.02s.gif": [1, 2],
      "assets/img/frame_26_delay-0.02s.gif": [2, 2],
      "assets/img/frame_27_delay-0.02s.gif": [3, 2],
      "assets/img/frame_28_delay-0.02s.gif": [4, 2],
      "assets/img/frame_29_delay-0.02s.gif": [5, 2],
      "assets/img/frame_30_delay-0.02s.gif": [6, 2],
      "assets/img/frame_31_delay-0.02s.gif": [7, 2],
      "assets/img/frame_32_delay-0.02s.gif": [8, 2],
      "assets/img/frame_33_delay-0.02s.gif": [9, 2],
      "assets/img/frame_34_delay-0.02s.gif": [10, 2],
      "assets/img/frame_35_delay-0.02s.gif": [11, 2],
      "assets/img/frame_36_delay-0.02s.gif": [0, 3],
      "assets/img/frame_37_delay-0.02s.gif": [1, 3],
      "assets/img/frame_38_delay-0.02s.gif": [2, 3],
      "assets/img/frame_39_delay-0.02s.gif": [3, 3],
      "assets/img/frame_40_delay-0.02s.gif": [4, 3],
      "assets/img/frame_41_delay-0.02s.gif": [5, 3],
      "assets/img/frame_42_delay-0.02s.gif": [6, 3],
      "assets/img/frame_43_delay-0.02s.gif": [7, 3],
      "assets/img/frame_44_delay-0.02s.gif": [8, 3],
      "assets/img/frame_45_delay-0.02s.gif": [9, 3],
      "assets/img/frame_46_delay-0.02s.gif": [10, 3],
      "assets/img/frame_47_delay-0.02s.gif": [11, 3],
      "assets/img/frame_48_delay-0.02s.gif": [0, 4],
      "assets/img/frame_49_delay-0.02s.gif": [1, 4],
      "assets/img/frame_50_delay-0.02s.gif": [2, 4],
      "assets/img/frame_51_delay-0.02s.gif": [3, 4],
      "assets/img/frame_52_delay-0.02s.gif": [4, 4],
      "assets/img/frame_53_delay-0.02s.gif": [5, 4],
      "assets/img/frame_54_delay-0.02s.gif": [6, 4],
      "assets/img/frame_55_delay-0.02s.gif": [7, 4],
      "assets/img/frame_56_delay-0.02s.gif": [8, 4],
      "assets/img/frame_57_delay-0.02s.gif": [9, 4],
      "assets/img/frame_58_delay-0.02s.gif": [10, 4],
      "assets/img/frame_59_delay-0.02s.gif": [11, 4],
      "assets/img/frame_60_delay-0.02s.gif": [0, 5],
      "assets/img/frame_61_delay-0.02s.gif": [1, 5],
      "assets/img/frame_62_delay-0.02s.gif": [2, 5],
      "assets/img/frame_63_delay-0.02s.gif": [3, 5],
      "assets/img/frame_64_delay-0.02s.gif": [4, 5],
      "assets/img/frame_65_delay-0.02s.gif": [5, 5],
      "assets/img/frame_66_delay-0.02s.gif": [6, 5],
      "assets/img/frame_67_delay-0.02s.gif": [7, 5],
      "assets/img/frame_68_delay-0.12s.gif": [8, 5]
    }
  }
};
