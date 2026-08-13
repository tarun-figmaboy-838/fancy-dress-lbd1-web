# The Fancy Dress Competition — Heavy & Light (static web build)

A dependency-free HTML/CSS/JS rebuild of the Unity project **Fancy Dress Lbd1**.
No Unity, no WebGL build, no frameworks, no build step. Deploy the folder as-is.

```
index.html
css/style.css
js/data.js          extracted scene tree + configs + animation curves (generated)
js/audio-lengths.js exact clip lengths read from the containers (generated)
js/hand-frames.js   the tap-hand animation packed into one sprite sheet (generated)
js/engine.js        uGUI-compatible runtime (layout, CanvasScaler, Animator, audio, tweens)
js/controllers.js   the six MonoBehaviours, ported one function each
js/main.js          scene bootstrap + SceneManager equivalent
assets/img          69 files — 64 sprites (webp), 1 hand sheet (webp), 4 flat PNGs
assets/audio        27 clips
assets/fonts        LilitaOne-Regular.ttf
god-mode/           dev/QA suite — 7 tags in index.html, delete to ship
```

## Run it

Any static host works. Locally:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Vercel / Netlify / GitHub Pages: drop the folder in, no configuration needed.

It also runs from `file://` — `data.js` is embedded rather than fetched — but audio
autoplay policies are stricter there, so a local server is recommended.

## What was ported

**Two scenes**, in the original build order from `EditorBuildSettings.asset`:

| Scene | Nodes | Contents |
|---|---|---|
| `Tutorial` | 54 | Intro splash → guided demo → tap the heavier item |
| `Lbd1` | 352 | 7 self-contained levels |

**Six MonoBehaviours**, ported line-by-line with the original state machines,
delays, easings and edge cases:

| Script | Instances |
|---|---|
| `WeightGameTutorialController` | 7 |
| `WeightMeasuringGame` | 7 |
| `DraggableItem` | 14 |
| `BasketDropZone` | 14 |
| `UltraSimpleWeightGame` | 7 |
| `TutorialManager` | 1 |
| `ButtonAnimator` | 1 |

**Level progression** is not driven by a script — the original wires it through
inspector `OnClick` persistent calls (`SetActive(false)` on the current level,
`SetActive(true)` on the next). All six transitions were extracted and are
replayed by the same mechanism, so the Next button behaves identically.

**The 7 levels** keep their own instruction text, VO clips, sprite sets
(normal / highlight / correct / wrong) and weight pairs:

1. pencil vs ball — tap the lighter
2. pencil vs toy car — tap the lighter
3. ball vs bus — tap the heavier
4. pumpkin vs apple — tap the heavier
5. watermelon vs orange — tap the lighter
6. teddy bear vs cube — tap the lighter
7. book vs pencil — tap the heavier (last level → game over panel + final VO)

## Fidelity notes

Some things that are easy to get wrong here and how they were handled:

**CanvasScaler.** The project uses `ScreenMatchMode.MatchWidthOrHeight` with
`match = 0.5`, not 0 or 1 — a hardcoded `min(sw, sh)` scales the whole game
wrong. The build reproduces Unity's log-space blend,
`scale = exp(lerp(log sw, log sh, 0.5))`, and resizes the canvas rect to
`safeArea / scale` on every resize, so edge-anchored elements move with the
aspect ratio exactly as they do in Unity.

**…fitted, and with the canvas pinned to the design size.** Two separate things
went wrong on anything that is not 16:9, and they need two separate fixes.

*The scale.* `match = 0.5` lands between fitting the width and fitting the
height, so it scales past one of them and crops. On a phone held upright it
threw away 47% of the width — both item trays off-screen. The scale is now
`min(s, sw, sh)`; at 16:9 `sw === sh` so the design aspect is untouched.

*The canvas size.* Unity sets the canvas rect to `screenSize / scale`, which
grows it on the axis with room to spare and sends edge-anchored elements out to
the new edges. That is right for a layout built to stretch, and wrong for this
one: the table, the backdrop band and the message bar are anchored to the canvas
edges while the balance and the trays sit at the centre, so a taller canvas walks
the furniture away from the game. At 870×971 the table detached completely and
left the pedestals floating over a gap. The canvas is therefore held at
1920×1080 and the whole thing is fitted and centred, so the composition is
identical at every aspect ratio — measured: the tray-to-table offset is the same
819 design px at 870×971, 1024×768, 1440×900, 2560×1080, 1200×1200 and 600×900.

Whatever is left over is filled by `#game::before` — the scene's own backdrop,
blown up and blurred, so the room appears to continue past the frame instead of
showing black bars.

**Safe area and the visual viewport.** The fit is computed against
`visualViewport` where it exists — on iOS that is the honest visible height once
the URL bar has collapsed — minus the `env(safe-area-inset-*)` values, and the
stage is centred inside that box rather than the raw viewport, so a notch cannot
eat the left edge of the tray in landscape. `resize`, `orientationchange` and
both `visualViewport` events feed one rAF-coalesced layout pass.

**Portrait.** A 16:9 game on a 9:19.5 phone becomes a small strip whichever way
you scale it. When the design area would occupy less than 60% of the viewport
height in portrait, the build shows a "turn your device sideways" prompt instead
of letting a child squint at 33px tap targets. In landscape on the smallest phone
tested (844×390) the item targets measure 61–114px, all above the 44px
comfortable minimum.

**Balance animation.** The pans, needle and plate are driven by the real
`Scale_LeftDown` (0.75 s), `Scale_RightDown` (0.667 s) and `Scale_Balanced`
curves read out of the `.anim` files, not by a CSS guess. Every keyframe has
zero in/out tangents, so the interpolation is exactly `3t² − 2t³`.
`Animator.CrossFade(0.2)` blends out of the live pose rather than snapping to
the clip's first frame — without that the pans visibly jump back to neutral
before re-tilting. Measured end poses match the clip data to the unit.

**The tutorial's demo animations.** `BookAnimation` (23 curves) and
`BallAnimation` (33 curves) — the hand carrying each item into a basket while
the scale reacts — are played from the extracted keyframes, including the
discrete `m_IsActive` curves that swap the tray copy for the basket copy.

**Image.raycastPadding.** All 14 draggable items carry non-zero padding (e.g. a
634×423 rect inset by 220 px on each side). The artwork is a small part of a
mostly transparent PNG, so without this the hit area would extend far beyond
what a child sees. Reproduced with an inset pointer target per image.

**Sprites.** All 107 textures are single-sprite mode with zero 9-slice borders
and every Image is draw type Simple with a white tint, so no atlas crop rects,
no `border-image`, and no Linear-space tint conversion are needed — the colour
space is Linear but with no non-white tints it makes no difference.

**Text.** TextMeshPro line height comes from the font asset's own metrics
(`lineHeight / pointSize` = 80.01 / 70). The per-instance TMP margins inset the
text area inside the rect, and negative margins push it back outside — that is
how the message bar gets a ~1480px wrap width out of a 200px rect. CSS padding
cannot go negative, so the text area is a positioned inner box offset by the
four margins (`.tmp-inner`), which is what keeps the instruction line
left-aligned on one line instead of wrapping into a narrow paragraph.

**Image tint vs. subtree opacity.** Unity's `Image.color.a` tints only that one
graphic; `CanvasGroup.alpha` is what propagates to children. CSS `opacity` always
cascades, so the sprite is painted by a `.un.img::before` layer whose own opacity
carries the tint (`--gfx` / `--gfxAlpha`), and the element's `opacity` is left to
CanvasGroup. This matters because the scene is full of alpha-0 hit shapes that
contain *visible* children: all 14 basket drop targets (a dropped item is
parented into one), the tutorial's two hint hands, and every level's right-hand
drag arrow. Painting the tint on the element hid all of them. Note that a
relative `url()` inside a CSS custom property resolves against the stylesheet
that reads it, not the document, so sprite paths are made absolute first.

**The stage transform.** The Canvas node *is* the `#stage` element, and the
fit-to-viewport transform (`translate(-50%,-50%) scale(scaleFactor)`) belongs to
`computeScale()`. `Node.applyLayout` therefore skips the stage node: writing a
rect there wipes the transform, which renders the game unscaled at design size
and crops whatever sits near the bottom or right edge — the item trays first.

**Drag.** `OnBeginDrag` reparents the item to the root canvas, which drops
pointer capture in browsers, so move/up are bound to the window. Movement is
divided by the canvas scale factor and `ClampToCanvas` is reproduced using the
padded corners, matching the original's 10 px drag threshold.

**Cursor affordance.** A draggable item's Button is deliberately made
non-interactable while the item is meant to be *dragged*, so `.btn`'s pointer
cursor is switched off at exactly the wrong moment. `DraggableItem` therefore
mirrors its own `dragEnabled` / `isLockedAfterDrop` flags onto a `draggable`
class (via property accessors, since the controller writes the flags directly),
giving `cursor: grab`, and `body.dragging` gives `grabbing` for the duration of
a drag.

**The tap hand is one sprite sheet, not 69 images.** `tap_anim` was authored as
69 separate 1200×1200 frames, and it plays in a 400×400 node — so every frame
swap asked the browser to rasterise a 1.4M-pixel bitmap down to about 200px, and
to keep up to 397 MB of decoded frames alive while it looped. Measured against
the artwork, 87% of each of those canvases is empty: the hand occupies only
314×594 of the 1200×1200.

`js/hand-frames.js` maps every authored frame path to a cell in
`assets/img/tap_hand_sheet.webp` — cropped to the artwork, scaled to the size it
actually renders at, packed 12×6. Playing the clip is now a `background-position`
change: one decode, one texture, no per-frame raster. The layer is `inset` to the
sub-rect of the node that the crop came from, expressed as a percentage, so the
artwork keeps exactly the position and size it had inside the full-size frame and
`placeHand()`'s `HAND_ART` centroid still holds — verified pixel-for-pixel
against the original frames (worst offset 1px of 400).

532 KB of GIFs and 69 requests became 182 KB and one.

**Sprite-swap clips are preloaded, but not urgently.** Anything still shipping as
loose frames is warmed from a `requestIdleCallback` rather than during boot, so
it cannot compete with the backdrop and the first voice line for the opening
screen's bandwidth. The animator also only re-applies a sprite when the frame
actually changes; it used to re-assign the same one on every tick.

**Clip lengths are shipped, not measured.** Instruction typing speed is
`clipLength / characters`, and Unity gets `AudioClip.length` for free. A browser
does not: Chrome only *estimates* an Ogg's duration while the file streams and
refines it as bytes arrive, so an element questioned early answers 15–25% short
— which typed every line noticeably ahead of the voice. `js/audio-lengths.js`
carries the real length of all 27 clips, read out of the Ogg granule positions
and MP3 frame headers, so the first play is already in step and the scene no
longer has to wait on a metadata round-trip before it can start.

**Drop-zone search.** `OnEndDrag` resolves the basket with
`FindObjectsOfType<BasketDropZone>()`, which in Unity **skips inactive
objects**. All 14 zones are registered in this build, 12 of them on the six
hidden levels, so the search is filtered by `activeInHierarchy`. Without that
filter a release can match a hidden level's basket: the item is parented into a
hidden subtree and vanishes, which reads as "the item won't drop and then
disappears".

## Known approximations

Two things cannot be extracted mechanically and are approximations:

1. **`ConfettiBlast` particle system** — the correct-answer burst is a CSS
   particle effect (46 pieces, randomised direction/spin/fall) placed at the
   particle object's position. It is not a port of the Unity particle module
   settings.
2. **Ghost-drag hint path easing** — the original is a DOTween `Sequence` with
   `SetEase(InOutSine)` applied across the whole sequence timeline. Here the
   ease is applied per path segment. The Catmull-Rom path, arc height, 1.2 s
   duration, 0.2 s hold and infinite loop all match.

## Tutorial / level consistency

The seven levels are internally identical in layout, so they define the target.
The Tutorial was authored slightly differently, and `js/data.js` now carries the
level values: tray row at reference y **729** (was 763), left tray
`anchoredPos.x` **−634** (was −620), left item **(27, 37)** (was (0, 52)), left
pan drop marker **(11.18, 83) / 255.854×95** (was (−8.52, 109) / 285.308×95), and
both in-pan item copies at **scale 0.9** landing on the marker origin — matching
what `DraggableItem.onDropSuccess` does in the levels. The two demo clips'
final keyframes were moved to the same origin so the fly-in lands there.

**Tap areas.** Every item's `raycastPadding` is now derived from its own
sprite's opaque bounding box, measured off-screen from each PNG's alpha channel,
so only the visible item responds — not the pan it is sitting in. All 18 item
nodes (14 level items plus the Tutorial's tray/basket copies, which previously
had no padding at all and were tappable across their whole 634×423 rect) were
set this way. For the level-1 pencil resting in a pan that turns a 159×198 hit
area trailing 100px below the pan into a 155×107 one narrower than the pan
itself, while keeping 100% of the artwork tappable and every target above the
80px comfortable-minimum. Level 3's jeep was the worst case beforehand: its
artwork is wider than the authored inset, leaving 22% of the visible vehicle
dead.

## Added polish

**The dashed drag path** (`Vector_10.png`) draws itself in with a 14-step reveal
and then keeps a soft cyan glow, so it reads as guidance rather than decoration.
Both run on the `::before` sprite layer, which is why they never fight the inline
rotate/scale the engine writes on the element (the right-hand copy is mirrored
with `scale: -1` and the reveal travels with it).

**Choosing an item pops it** — a 0.38s overshoot plus a brightness lift, again on
the `::before` layer so it composes with an item's own tilt instead of replacing
its transform.

**The tap hand is anchored by its artwork.** The hand frames are 1200×1200 with
the hand drawn around x 0.40–0.63, y 0.43–0.80 (it travels as it taps), so
centring the node on a target parked the visible hand about a tenth of a box
below whatever it pointed at — on the pan's stem rather than the item.
`placeHand()` offsets by that centroid, and all three hint call sites use it.

**Item placement is normalised.** Each sprite's artwork sits at a slightly
different offset inside its 634×423 canvas, so identical `anchoredPos` values
still looked inconsistent (the pencils were the obvious outlier). Every item's
tray position and in-pan position is now derived from its measured opaque
bounding box, so all 14 items land their *art centre* on the same tray point
(`6.9, 39.2`) and the same in-pan point (`-9, 10`). Scale and rotation stay
per-sprite, since the pencil needs a tilt the ball does not.

**Per-item resting pose in the pan.** `onDropSuccess` centred every item on the
drop marker at scale 0.9. Items whose artwork needs a nudge or a tilt to look
like it is lying in the bowl can now override that per instance with
`dropRestPos` / `dropRestScale` / `dropRestRot`; all three `Pencil_01` items
(levels 1, 2 and 7) use `[-9, 10]`, scale 1, 12°, and share one tray pose
(`6.9, 39.2`, scale 1.2, 28°) so the pencil looks the same wherever it appears.

## Two soft-locks that had to be fixed

**Try Again could not be answered.** `OnTryAgain` opened the item selection and
*then* started the instruction-5 coroutine. `typeInstruction()` disables both
item buttons on entry and never re-enables them, so the synchronous
`enableItemSelection()` was undone a microtask later and the child could never
answer — a dead end on every level. The selection is now reopened when the
prompt finishes, which is what `tutorialSequence` already did (and what
`TutorialManager.onTryAgainClicked` does, which is why the Tutorial never showed
this).

**Stale hints drove the shared hands.** `hintHand` and `itemHintHand` are single
objects on the Canvas, shared by all seven levels, and the Next button only
swaps level containers — the finished level's controller keeps running. A hint
timer still pending (they are armed with a 10s `arrowDelaySeconds`) would fire
during the *next* level and place the shared hand using the previous level's
coordinates. The Next handler now retires that controller's coroutines and
hides both hands.

## The opening splash

The splash backdrop is itself a full-screen `Button`, and its only `OnClick` is
`Play` on the title line — which is `PlayOnAwake: 0`, so tapping the artwork was
the *only* way to hear it. Two things follow from that, and both are wrong on a
screen whose one real control is the Let's Go button: the backdrop takes
`cursor: pointer` edge to edge, and `.un.btn.pressed` dips the brightness of the
entire splash on every tap. Each tap also restarts the 1.93 s line.

`ButtonAnimator` now retires the backdrop's button (`setInteractable(false)` →
`.nointeract`, so no pointer cursor and no press dip) and plays the line once on
its own. Browsers refuse audio before the first gesture and `Source.play()`
swallows that rejection rather than reporting it, so the code asks afterwards
whether playback actually started; if it did not, it spends the first tap on the
line and then unhooks. Unless that tap is Let's Go itself — the splash is over,
and starting the line only for the button's own `Stop` to cut it off is noise.

Measured: backdrop `interactable=no`, `cursor: default`, 0 press-dips in 3 taps,
and exactly one honoured play with autoplay permitted. With autoplay blocked the
retry arms and fires once and only once — a synthetic tap is not a trusted
gesture, so headless cannot prove the sound itself comes out, only that the
once-only logic holds.

## Hint timing

All seven levels ship one `arrowDelaySeconds` of **10**, and it gates every hint
a level has: the hand on Next / Try Again, the hand on the correct item, and the
ghost drag demo. Measured end-to-end on level 1, the hand took 10.02 s to reach
the Next button, and the drag demo usually never appeared at all — a child drops
the item well before it is due.

`HINT_DELAY` in `controllers.js` overrides it with **3 s**, and all three now
fire at 3.00 s (measured). It lives there rather than in `data.js`, which is
regenerated from the Unity project and would lose the change. The Tutorial scene
has its own `hintDelay` of 1 s, is already faster, and is left as authored.

## Arrow label cues

The Heavier / Lighter arrows used to be raised off the instruction text as it
typed — the red one once `"down"` had been typed, the cyan one once `"up"` had.
But the text types at a flat `clipLength / characters` and speech is not flat, so
the two drifted apart. Decoding the 5.20 s clip and reading its RMS envelope
gives where the words really are:

| | time |
|---|---|
| "Heavy" | 0.38–0.70 s |
| "things go" | 0.91–1.69 s |
| **"down"** | **1.75–2.16 s** |
| *(comma pause)* | 2.14–2.75 s — silence |
| "light" | 2.75–3.08 s |
| "things go" | 3.32–4.14 s |
| **"up"** | **4.30–4.58 s** |
| *(tail)* | 4.58–5.20 s — silence |

Against that, neither typed cue ever coincided with its word. `"down"` fired the
red arrow at 2.44 s — after "down" had finished, inside the silent comma pause.
`"up"` fired the cyan one at 4.95 s, after "up" had finished, in the trailing
silence.

So instruction 7 is now driven by the recording rather than by a character
count, in two parts.

**The line itself** (`LINE7_SPANS`, `charTimes`) has each word's characters spread
across that word's own spoken span, with the gaps between words held, so the word
types itself out as the voice says it. **The arrows** (`LABEL_CUE`, `cueAt`) are
timed off the clip to the *end* of their own word, so the child gets two beats
rather than one: the voice says "down" and the word appears, and then the arrow
drops onto it.

| | before | after | voice says it at |
|---|---|---|---|
| word "down" on screen | 2.44 s | **2.04 s** | 1.75–2.16 s |
| red Heavier arrow | 2.44 s | **2.16 s** | ″ |
| word "up" on screen | 5.00 s | **4.46 s** | 4.30–4.58 s |
| cyan Lighter arrow | 5.00 s | **4.58 s** | ″ |

Cueing an arrow to the *start* of its word instead puts it on the same frame as
the word's first letter, and the two read as a single event — which is why the
end of the word is used.

Both scale with the clip, and `charTimes` requires the line's word count to match
the table — so a re-worded or translated line falls back to exactly the flat
typing it had before rather than mistiming itself. Only instruction 7 is paced
this way; every other line still types flat, which is fine where no arrow depends
on a particular word.

**One clock, not a wait per character.** `E.wait` resolves on the first frame
past its deadline, so chaining one per character accumulates the rounding: the
text ran 0.19 s late by "down" and 0.36 s by "up", while the arrows — a single
wait each — did not drift at all. The line is therefore revealed from one
`E.tween` over its whole duration, which holds every character to its own
deadline.

Verified across all 16 places the arrows appear — 7 levels × (wrong + correct
answer) plus the Tutorial's two paths, which run the same code in
`TutorialManager.playInstruction7`. All 16 failed before, all 16 pass now.

## One deliberate deviation from the original

**The tutorial's leftover hint container.** `BookAnimation` and `BallAnimation`
each contain a single-keyframe `m_IsActive` curve that switches its hint
container **on** (`items /Item 2/Hint hand` → `0.000: 1`) and never switches it
back off, while switching that container's `Hand` / `Image` children off partway
through. The container is a 1702×585 Image with no sprite, `color.a = 0` and
`raycastTarget` on — so once the demo has played, an invisible hit shape covers
both items and swallows every tap. Reproduced faithfully, the tutorial can never
be answered.

`TutorialManager.setStep()` therefore retires the container when the clip that
raised it finishes (`hideDemoHints`). This is the only place where the build
intentionally does something the Unity project does not.

Everything else is driven by extracted data rather than eyeballing. This is
still a second implementation in a different renderer, so it targets ~95–99%
fidelity rather than pixel-identity — only a Unity WebGL build reproduces a
Unity scene exactly, and that defeats the point of removing Unity.

## Verification performed

Run against headless Chromium 141:

- Intro → Let's Go → tutorial hand-off, both scenes boot clean
- Full level 1 playthrough with real mouse drags: pencil → left basket,
  ball → right basket, tap the lighter item, labels, Next → level 2
- Balance poses after each drop match the extracted curve end values exactly
  (left pan −34 / right 79 / needle 20°, then left 82 / right −28 / needle −20°
  / plate −8°)
- Label positions match the scene's marker objects to the pixel
  (1662, 577) and (258, 419)
- Wrong-answer path and Try Again in both scenes: wrong sprite applied,
  message bar restored, animator frozen, sprites restored on retry
- `BallAnimation` end pose: left 80 / right −29 / needle −20° / basket ball active
- All 7 levels activate, Start, and lay out with nothing off-stage
- Confetti fires on the correct answer
- **0 console errors, 0 failed requests, 0 missing assets** (164 asset
  references all resolve)

## God Mode (dev only)

`god-mode/` adds a debug, QA and design-review layer: press **Shift + G** in the
running game, or open `index.html?debug=1`. It gives you scene/level navigation,
forced game states, a Figma-style live layout editor (drag, 8 resize handles,
exact x/y/w/h fields, snap, layout-JSON export), animation-speed control,
animation previews, an automated QA suite and a kid-focused UX review.

Everything is additive and reversible — delete the seven god-mode tags at the
bottom of `index.html` to ship the learner build. Full documentation:
[`god-mode/README.md`](god-mode/README.md).

## Analytics

`Assets/Plugins/WebGL/TrackingPlugin.jslib` declares five hooks
(`quizAnswerSubmittedString`, `cubeStageSubmitted`, `waterFlowSubmitted`,
`SendLevelStart`, `SendLevelComplete`).

**No C# in this project imports or calls any of them** — there is no
`DllImport` anywhere in `Assets/scripts`. The original build therefore never
emitted a single analytics event, and this build does not either, so the
behaviour matches. If you want telemetry, the natural call sites are
`WeightGameTutorialController.onItemSelected` (answer submitted) and the
level-activation path in `main.js`; say the word and I'll wire them to the
same `window.*` names with the same payload shapes.

## Instruction copy

`COPY_FIXES` in `controllers.js` rewrites the authored instruction text before a
level types it. It lives there rather than in `data.js`, which is regenerated
from the Unity project and would lose the edits. Only keys beginning
`instruction` are touched, and the sibling `*Audio` keys are skipped — those are
asset paths, not copy.

| fix | why |
|---|---|
| `toycar` → `toy car` | Level 2's `instruction4` writes it as one word, while its own `instruction2` and the recording both say "toy car". |
| `bus` → `toy bus` | Level 3 weighs a cricket ball against a **yellow toy bus** and called it "a bus". A real bus outweighs a cricket ball by tonnes, so a balance tipping toward the ball reads as nonsense to a child picturing the real vehicle. The artwork is unmistakably a toy; the copy was what was wrong. |

The `bus` rule is `/(\btoy\s+)?\bbus\b/gi`, so it is idempotent — run over an
already-corrected line it cannot produce "toy toy bus" — and `\b` keeps it off
"busy" and "buses". No `itemData.itemName` contains "bus", and none is rewritten
in any case: the ghost-drag hint matches on those names.

**The recordings still say "bus".** Copy can be fixed in code; a voice-over
cannot. Level 3's banner now reads "toy bus" while the narration says "bus", and
closing that gap needs two clips re-recorded:

| clip | line to record |
|---|---|
| `Here_is_a_ball_and_a_Bus.ogg` | "Here is a ball and a toy bus." |
| `Let_us_place_the_Bus_on_the_balance.ogg` | "Let us place the toy bus on the balance." |

Drop the new files in at the same paths and add their lengths to
`js/audio-lengths.js` — the typing speed is `clipLength / characters`, and a
missing entry makes the first play fall back to a metadata guess.

## One content observation

Level 3 asks the child to tap the **heavier** item between a ball and a toy bus,
and the correct answer is the **ball** (`bookWeight` 5 vs `ballWeight` 1). The
balance tips the same way, so the level is internally consistent and it has
been ported exactly as authored — flagging it only in case the sprite pair was
swapped at some point.
