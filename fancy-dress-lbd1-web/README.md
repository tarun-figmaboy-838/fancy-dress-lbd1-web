# The Fancy Dress Competition — Heavy & Light (static web build)

A dependency-free HTML/CSS/JS rebuild of the Unity project **Fancy Dress Lbd1**.
No Unity, no WebGL build, no frameworks, no build step. Deploy the folder as-is.

```
index.html
css/style.css
js/data.js          extracted scene tree + configs + animation curves (generated)
js/engine.js        uGUI-compatible runtime (layout, CanvasScaler, Animator, audio, tweens)
js/controllers.js   the six MonoBehaviours, ported one function each
js/main.js          scene bootstrap + SceneManager equivalent
assets/img          107 sprites
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
`screenSize / scale` on every resize, so edge-anchored elements move with the
aspect ratio exactly as they do in Unity. Verified exact at 1920×1080, 1280×720,
1280×900 and 900×1400 (portrait).

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

**Sprite-swap clips are preloaded.** `tap_anim` is 69 separate 1200×1200 frames;
without preloading, the browser fetched each frame the first time it was
displayed, so the first loop of the hint hand stuttered through half-loaded
frames. `boot()` now warms every `pptr` frame in `ANIMS`.

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

## One content observation

Level 3 asks the child to tap the **heavier** item between a ball and a bus,
and the correct answer is the **ball** (`bookWeight` 5 vs `ballWeight` 1). The
balance tips the same way, so the level is internally consistent and it has
been ported exactly as authored — flagging it only in case the sprite pair was
swapped at some point.
