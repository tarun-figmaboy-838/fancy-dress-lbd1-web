# QA checklist — Fancy Dress: Heavy & Light

Every ✅ below was exercised in a real Chromium instance driven over CDP with
real pointer events — no forced state unless the line says so. Numbers are the
measured values, not targets.

Last full pass: Chromium 150, 1440×900, cold cache.

---

## 1. Load

| | measured |
|---|---|
| ✅ First contentful paint | **188 ms** |
| ✅ DOMContentLoaded | **100 ms** |
| ✅ Engine booted and interactive | **187 ms** |
| ✅ Load event | **658 ms** |
| ✅ Initial transfer | **1 484 KB** over 94 requests |
| ✅ Failed / 4xx requests | **0** |
| ✅ JS errors, console errors, warnings | **0 / 0 / 0** |

- ✅ Nothing blocks the first screen. Load order is code (17–41 ms) → audio
  (58–67 ms) → backdrop art (67–73 ms) → hint-hand frames (87 ms+).
- ✅ The scene no longer waits on audio metadata before starting. It used to
  gate on a `preload()` that gives up after 4 s per clip.
- ✅ The 69 hint-hand frames (532 KB) load from a `requestIdleCallback`, so they
  never compete with the backdrop or the first voice line.
- ✅ 165 asset references all resolve; **0 unreferenced files** on disk.

## 2. Voice-over ↔ text sync

Typing speed is `clipLength / characters`, so the text lands exactly with the
last word — but only if `clipLength` is right.

- ✅ **All 49 spoken lines are in sync.** Worst drift **23 ms**; every line
  under the 120 ms threshold.
- ✅ Typing runs at **5.5–10.3 characters/second**, paced by the voice.
- ✅ Every clip length is verified against the duration the element settles on
  after playing the file through — not the estimate it reports while streaming.

> **Fixed this pass.** Chrome only *estimates* an Ogg's duration while the file
> streams and refines it as bytes arrive, so an element questioned early answers
> 15–25% short. Every line was typing ahead of the voice — worst case
> `Heavy things go down…`, which read **5.20 s** as **3.93 s** and finished
> 1.27 s early. The real lengths now ship in `js/audio-lengths.js`, read out of
> the Ogg granule positions and MP3 frame headers.

## 3. Audio clashes

Measured by hooking every `HTMLMediaElement`, then sampling which ones are
actually sounding every 60 ms through real playthroughs.

| scenario | overlapping samples | lines cut mid-word |
|---|---|---|
| ✅ Levels 1–7, played straight through (98 lines) | **0** | **0** |
| ✅ Level → Next → level, ×6 | **0** | **0** |
| ✅ Tutorial, all 7 lines | **0** | **0** |
| ✅ Tutorial → Lbd1 hand-off | **0** | **0** |
| ✅ 6 scene/level jumps, one every 1.2 s, all mid-word | **0** | **0** |

> **Fixed this pass.** That last row used to produce **4.3 s of two voices at
> once**. Loading a scene threw the old controller instances away but left their
> coroutines running: a stopped line went on to start its *next* line over the
> incoming scene's. `Controllers.reset()` now kills every runner first. A second
> hole: `Runner.run` deferred the coroutine body by a microtask and never
> re-checked the token, so a line stopped in that window still got its first
> word out — these coroutines call `AudioSource.Play()` before they await
> anything cancellable.

## 4. Every level (1–7)

Real drags into both pans, then a real tap on the correct item.

| lvl | weights | left drop | right drop | balance tips | needle | celebration | cleared |
|---|---|---|---|---|---|---|---|
| 1 | 1 vs 5 | ✅ | ✅ | ✅ correct | −24° | 61 pieces | ✅ |
| 2 | 1 vs 5 | ✅ | ✅ | ✅ correct | −24° | 58 pieces | ✅ |
| 3 | 5 vs 1 | ✅ | ✅ | ✅ correct | +24° | 56 pieces | ✅ |
| 4 | 5 vs 1 | ✅ | ✅ | ✅ correct | +24° | 69 pieces | ✅ |
| 5 | 5 vs 1 | ✅ | ✅ | ✅ correct | +24° | 66 pieces | ✅ |
| 6 | 5 vs 1 | ✅ | ✅ | ✅ correct | +24° | 57 pieces | ✅ |
| 7 | 5 vs 1 | ✅ | ✅ | ✅ correct | +24° | 57 pieces | ✅ |

- ✅ **The balance tips toward the heavier item in all seven levels** — checked
  by comparing the two pans' real screen positions against the weight pair, not
  by trusting the animation.
- ✅ Needle and plate always agree in direction (plate −8° with needle −24°).
- ✅ Every level advances through its own **Next** button; L7 → game-over panel.
- ✅ Confetti clears completely between levels (`0 pieces, 0 layers`).

## 5. Answer paths

- ✅ **Correct** → correct sprite, item pops, confetti (56 pieces), praise line,
  explanation with labels, Next.
- ✅ **Wrong** → wrong sprite, explanation types in full
  ("Heavy things go down, light things go up!"), *then* Try Again appears.
- ✅ **Try Again** → reopens the selection (this was a soft-lock on every level
  once; it is now re-tested explicitly).
- ✅ Labels land on the right pans with the right tint: **Heavier** red
  `rgba(255,92,92)` on the low side (x 1201), **Lighter** cyan
  `rgba(90,214,255)` on the high side (x 168).
- ✅ Both labels pop in and hold their glow; items pop when their glow sprite
  lands.

## 6. Screens and rendering

- ✅ All 8 screens (tutorial + 7 levels) render with **0 blank images**, **0 new
  4xx**, nothing off-stage.
- ✅ 22 images on screen per level; the only spriteless nodes are the three
  authored layout containers (`items`, `Image`, `Image (1)`), whose Image
  components are disabled in the scene data.
- ✅ Tutorial's invisible 1702×585 hint container is retired after the demo —
  without that the tutorial cannot be answered at all.

## 7. Repo hygiene

- ✅ **0 unreferenced assets** (165 files, 2 744 KB, all reachable).
- ✅ **0** `console.log`, `TODO`, `FIXME` or `HACK` in shipping JS.
- ✅ `.gitignore` added (logs, editor cruft, `.vercel`, `*.bak`, `node_modules`).
- ✅ No stray build output or scratch files tracked.
- ⬜ **God Mode is 160 KB and loads on every page view.** It is dev tooling;
  delete the seven tags at the bottom of `index.html` for the learner build, as
  documented. Left in deliberately.
- ⬜ **The 69 GIF frames stay GIFs.** Re-encoding them through WebP was measured
  and makes them *bigger* — 532 KB → 538 KB at q0.85, 621 KB at q0.92 — because
  they are already flat palette art with an alpha channel. A real `cwebp
  -lossless` pass is the only way to improve on them and no encoder is
  available here.
- ⬜ `UltraSimpleWeightGame` has 7 instances that never drive anything. It is in
  the authored scene, so it is kept to mirror the Unity component surface.

## 8. Not verifiable headlessly — needs a human

- ⬜ **How it sounds.** Overlap is proven absent by measurement, but mix,
  loudness and whether a line *feels* rushed need ears.
- ⬜ **Animation smoothness.** Headless cannot judge jank; it froze animations
  entirely under load in an earlier session while a real browser was fine.
- ⬜ **Touch.** All drag testing used synthetic mouse events.
- ⬜ Resolutions other than 1440×900. The stage math is resolution-independent
  and was verified at four sizes previously, but not re-checked this pass.

## 9. Authored behaviour worth a product decision

These are faithful to the Unity project and were **not** changed.

- **Level 3 asks for the heavier of a ball and a bus, and the answer is the
  ball** (`bookWeight 5` vs `ballWeight 1`). Internally consistent — the balance
  tips to match — but pedagogically backwards.
- **The tutorial can be answered before it teaches anything.** The ball button
  is authored `interactable = 1` and `Start()` only disables the book button, so
  a tap on the ball during the opening narration is accepted as the correct
  answer and jumps straight to "well done". One line in `TutorialManager.start`
  would gate it until the prompt finishes.
- **The left drag arrow has no hand child**, so it shows nothing while the right
  one shows a hand.
- **The tutorial's balance reacts from `t=0`** inside the demo clips rather than
  when the item lands.
- **9 of 11 item sprites use the computed in-pan resting pose**; only the three
  pencils are hand-tuned.

---

### Reproducing this

The harness is a plain CDP client over Node's built-in WebSocket — no puppeteer.
Start any static server on the folder, launch Chrome with
`--remote-debugging-port`, and drive it. The audio checks work by wrapping
`HTMLMediaElement.prototype.play/pause` before the page scripts run
(`Page.addScriptToEvaluateOnNewDocument`) and sampling which elements are
sounding; that is the only reliable way to catch two voices at once, since the
elements are created with `new Audio()` and never enter the DOM.
