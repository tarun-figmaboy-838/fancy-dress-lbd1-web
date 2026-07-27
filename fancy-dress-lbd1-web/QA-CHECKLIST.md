# QA checklist — Fancy Dress: Heavy & Light

Everything below was exercised in a real Chromium instance driven over CDP
(real pointer events, no shortcuts unless noted). ✅ = verified this session.

## Boot & scenes

- ✅ Boots to the Tutorial intro; 0 console errors, 0 failed requests
- ✅ 165 asset references all resolve (137 images, 27 clips, 1 font)
- ✅ Tutorial → Lbd1 hand-off via **Next**
- ✅ All 7 level screens reachable; `Level 2 → 3 → 4 → 5 → 6 → 7`
- ✅ Version watermark (`vMT_01_04`) hidden on the intro

## Tutorial

- ✅ Let's Go → demo plays; book and ball both visible in the pans
- ✅ Tap the **wrong** item → red glow, Heavier/Lighter labels, Try again
- ✅ **Try Again** → prompt replays and the selection reopens
- ✅ Tap the **correct** item → correct sprite, arrows, Next
- ✅ Next → loads Lbd1

## Every level (1–7)

- ✅ Real drag of item 1 → left pan: **dropped and visible**
- ✅ Real drag of item 2 → right pan: **dropped and visible**
- ✅ Real tap on the correct item registers
- ✅ Drop released in empty space returns the item to its tray, still draggable
- ✅ Drop into the *wrong* basket recovers; sequence still advances
- ✅ Full playthrough L1→L7 through the Next button
- ✅ Level 7 correct answer shows the game-over panel

## Balance scale

- ✅ Needle leads the beam; beam follows ~0.04s later
- ✅ Single settle, no repeated oscillation
- ✅ Exact final pose, no drift: `beam −8°, needle −24°, pans 82 / −28`
- ✅ Needle rotates about its mounting pin — identical `left/top/size/origin`
  at −24°, −12°, −5°, 0°, +5°, +12°, +24° (checked in L1, L4, L7)
- ✅ No needle position/scale curves remain in any clip

## Interaction

- ✅ 14/14 item-in-pan combinations: 100% of the artwork is tappable
- ✅ Tap area is the artwork, not the pan (L1 book: 155×107 vs a 202×75 pan)
- ✅ Cursor: `default` → `grab` when the game hands the item over → `grabbing`
  while dragging → `default` once locked
- ✅ Items are not draggable before the level controller starts

## Hints, labels, effects

- ✅ Item-tap hint uses the animated button hand, centred on the item (offset 0, +5)
- ✅ Tutorial hint centred on the ball (offset 0, 0)
- ✅ 69 `tap_anim` frames preloaded at boot, 0 fetched mid-animation
- ✅ Heavier/Lighter labels derived from the live pans: ±300 dx, dy 0, mirrored
- ✅ Labels pop and hold a tinted glow (red = heavier, cyan = lighter)
- ✅ Item pops when its glow sprite lands (5 sites across both scenes)
- ✅ Confetti: falls from above, spans the full height, self-removes,
  repeat calls do not stack (`layers 0 → 1 → 0`)

## God Mode

- ✅ QA suite: 0 failures
- ✅ Editor drag/resize exact; teardown restores values, closes panels,
  clears marks, restores native `requestAnimationFrame`

## Not verified here — needs a human with sound and a real GPU

- ⬜ **Voice-over overlap.** Headless reports 0 sounding `<audio>` elements.
  Paste this in the console and play through; nothing should print:
  ```js
  setInterval(() => {
    const on = [...document.querySelectorAll('audio')].filter(a => !a.paused && !a.ended);
    if (on.length > 1) console.warn('OVERLAP', on.map(a => a.src.split('/').pop()));
  }, 100);
  ```
- ⬜ **Animation smoothness.** Headless froze animations entirely under load
  while a real browser was fine — it cannot judge jank.
- ⬜ Resolutions other than 1440×900 (stage geometry is resolution-independent,
  but the fit has only been eyeballed at one size this session)
- ⬜ Touch devices — all drag testing used synthetic mouse events

## Known content issues (authored, unchanged — product decisions)

- **Level 3** asks for the *heavier* of a ball and a bus, and the correct
  answer is the **ball** (`bookWeight 5` vs `ballWeight 1`). Internally
  consistent, pedagogically wrong.
- The **left** drag arrow has no hand child, so it shows nothing; the right
  one shows a hand.
- The tutorial's balance reacts from `t=0` inside the demo clips rather than
  after the item lands — re-timing those clips is the remaining spec gap.
- 9 of 11 item sprites use the computed in-pan resting pose; only the pencils
  are hand-tuned.
