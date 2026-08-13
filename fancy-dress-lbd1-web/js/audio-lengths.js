/* ============================================================================
 *  audio-lengths.js — exact clip lengths, read from the audio containers.
 *
 *  Unity gets AudioClip.length for free; a browser only learns a duration
 *  once the element has loaded, and the ported coroutines need it the moment
 *  a line starts (typing speed is clipLength / characters). Shipping the
 *  numbers keeps the voice and the text exactly in step on the first play,
 *  on a cold cache, and with no metadata round-trip to wait for.
 *
 *  Regenerate with scratchpad/durations.js --emit after changing any clip.
 * ========================================================================== */
window.AUDIO_LENGTHS = {
  /* Level 3's two lines, re-cut to say "toy bus" — see AUDIO_FIXES in
     controllers.js. Measured off the rendered files, same as the rest. */
  "assets/audio/Here_is_a_ball_and_a_toy_bus.wav": 4.193,
  "assets/audio/Let_us_place_the_toy_bus_on_the_balance.wav": 4.399,

  "assets/audio/Heavy_things_go_down_light_things_go_up_.ogg": 5.200,
  "assets/audio/Here_is_a_Pencil_and_a_Toy_car.ogg": 4.150,
  "assets/audio/Here_is_a_Pencil_and_a_ball.ogg": 3.530,
  "assets/audio/Here_is_a_Pumpkin_and_a_apple.ogg": 3.864,
  "assets/audio/Here_is_a_Teddy_bear_and_a_Cube.ogg": 4.055,
  "assets/audio/Here_is_a_ball_and_a_Bus.ogg": 3.673,
  "assets/audio/Here_is_a_book_and_a_PENCIL.ogg": 3.648,
  "assets/audio/Here_is_a_book_and_a_ball.ogg": 3.360,
  "assets/audio/Here_is_a_watermelon_and_an_orange.ogg": 5.057,
  "assets/audio/Let_us_place_the_Bus_on_the_balance.ogg": 4.000,
  "assets/audio/Let_us_place_the_Cube_on_the_balance.ogg": 4.102,
  "assets/audio/Let_us_place_the_Pumpkin_on_the_balance.ogg": 4.150,
  "assets/audio/Let_us_place_the_Teddy_bear_on_the_balance.ogg": 4.580,
  "assets/audio/Let_us_place_the_apple_on_the_balance.ogg": 4.246,
  "assets/audio/Let_us_place_the_ball_on_the_balance.ogg": 4.246,
  "assets/audio/Let_us_place_the_book_on_the_balance.ogg": 4.389,
  "assets/audio/Let_us_place_the_orange_on_the_balance.ogg": 4.150,
  "assets/audio/Let_us_place_the_pencil_on_the_balance.ogg": 4.198,
  "assets/audio/Let_us_place_the_toy_car_on_the_balance.ogg": 4.293,
  "assets/audio/Let_us_place_the_watermelon_on_the_balance.ogg": 4.532,
  "assets/audio/Light_heavy.mp3.ogg": 1.933,
  "assets/audio/Look_at_the_empty_balance_.ogg": 2.917,
  "assets/audio/Tap_on_the_heavier_item.ogg": 3.339,
  "assets/audio/Tap_on_the_lighter_item.ogg": 2.332,
  "assets/audio/Well_done_.ogg": 1.818,
  "assets/audio/anya_and_madhav_weigh_many1_1_.mp3": 7.732,
  "assets/audio/btn.mp3": 0.183
};
