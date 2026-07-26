# God Mode — Fancy Dress Developer & Testing Suite

An isolated debug, QA and design-review layer for **The Fancy Dress Competition —
Heavy & Light**. Jump between scenes and levels, force any game state, live-edit
the layout of any element by dragging or by typing exact numbers, preview
animation ideas, and run automated QA and kid-focused UX checks — without
touching the learner build.

This is `GOD-MODE.md` implemented against *this* game. That document describes
the Bubble Days build (bubbles, gems, timers, 12 levels); the architecture,
activation model, editor, animation bar, QA and UX layers carry over, while the
game-specific controls are re-pointed at this game's real nodes. See
[Deviations from GOD-MODE.md](#deviations-from-god-modemd).

**Core design principle:** fully reversible, fully removable. Delete the seven
god-mode tags from `index.html` and the learner game is untouched. Toggling God
Mode off at runtime restores every element it edited, un-patches the animation
clock, removes every debug class and clears every overlay.

---

## Quick start

Already wired into `index.html`:

```html
<link rel="stylesheet" href="god-mode/god-mode.css">
<script src="god-mode/god-mode-utils.js"></script>
<script src="god-mode/god-mode-live-editor.js"></script>
<script src="god-mode/god-mode-animation-bar.js"></script>
<script src="god-mode/god-mode-qa.js"></script>
<script src="god-mode/god-mode-ux-review.js"></script>
<script src="god-mode/god-mode.js"></script>
```

Open the game and press **Shift + G**, or load `index.html?debug=1` to start
with God Mode already on. To ship the learner build, delete those seven tags —
nothing else changes.

---

## File structure

| File | Role |
|---|---|
| `god-mode.js` | Main controller. Activation, shortcuts, scene/screen navigation, game-flow jumps, animation clock, visual debug. Exposes `window.FancyDressGodMode` and the live instance as `window.godMode`. |
| `god-mode-utils.js` | Shared helpers (`window.GodModeUtils`). Loaded **first**; everything depends on it. |
| `god-mode-live-editor.js` | Live Layout Editor. `window.GodModeLiveEditor`. |
| `god-mode-animation-bar.js` | Animation Ideas panel. `window.GodModeAnimationBar`. Optional — the controller checks for it. |
| `god-mode-qa.js` | QA Test Mode. `window.GodModeQA`. |
| `god-mode-ux-review.js` | UI/UX Review. `window.GodModeUXReview`. |
| `god-mode.css` | Every God Mode style: badge, panels, selection box, overlays, UX highlights, the 27 `gmAnim-*` preview keyframes. |

All modules are IIFEs in strict mode, vanilla JS, no build step, and run from
`file://`. Each module builds its own panel, so there is no HTML template to
keep in sync.

---

## Keyboard shortcuts

**Shift + G** toggles God Mode. Everything else works only while it is on, and
is suppressed while typing in a panel field.

| Key | Action |
|---|---|
| `E` | Toggle Cursor Edit (click elements on screen to select and drag) |
| Arrows | Nudge the selection 1px (Unity y-up); **Shift** ×10 |
| `Z` | Collapse/expand all panels — frees the whole stage for picking |
| `N` / `P` / `R` | Next / previous / restart screen (level) |
| `A` | Drop both items into their baskets |
| `C` / `W` | Force the correct / wrong answer |
| `F` | Jump to the last level and show the game-over panel |
| `1`–`5` | Animation speed: pause, 0.5×, 1×, 1.5×, 2× |
| `B` / `S` / `H` / `T` | Bounds / 1920×1080 design frame / tap areas / text boxes |
| `Q` / `L` | QA smoke test / level data test |
| `V` / `K` / `X` | Full UX review / kid-friendly check / clear highlights |
| `D` | Download the layout JSON |
| `Ctrl/Cmd + C` | Copy the selected element's values |
| `Ctrl/Cmd + E` | Copy every edited element's values |
| `O` | `console.table` the visible-node inventory |

---

## The debug panel

### Scene / Screens
Chips for both scenes (`Tutorial`, `Lbd1`) and for every screen container in the
current one — `Intro` / `GamePlay`, or `Level 01` … `Level 7`. Jumping stops the
running coroutines and the voice-over first, so two screens can never talk over
each other. **Restart** reloads the scene and re-opens the same screen, because
the ported `Start()` only ever runs once per controller instance.

### Level testing
Prev / Restart / Next, plus:
- **Drop Both Items** — resolves the level's two `BasketDropZone` instances from
  `gameManager` and calls `forceDrop` on each item, so the balance tips exactly
  as it does in play.
- **Skip Voice-over**, **Unlock Drag**, **Unlock Tap** — clears the instruction
  gating (`isInstructionPlaying`, `selectionLocked`, `dragEnabled`) so a screen
  is testable immediately.

### Game flow
Correct / wrong answer (computed from `correctAnswerMode` and the two weights,
then dispatched as a real click on the right button), **Show Heavy/Light**
(places `label1` / `label2` on the same marker objects the game uses),
**Confetti Burst**, **Show Next Button**, **Show Try Again**, **Game Over
Panel**, **Log Inventory**.

**Reveal Hint Layers** shows the arrows, hint hands and ghost-drag art so they
can be aligned. It is off by default: a revealed ghost item sits on top of the
real item and would swallow cursor-edit picks.

### Animation speed
Pause / 0.5× / 1× / 1.5× / 2×. The engine runs one `requestAnimationFrame`
loop, so God Mode wraps `requestAnimationFrame` with a virtual clock and scales
the timestamp — every ported DOTween tween and every Animator curve slows
together. CSS animations are handled by `playbackRate` plus
`body.godPauseAnimations` at 0×. Toggling God Mode off restores the native
`requestAnimationFrame`.

### Visual debug
- **Show bounds** — outlines every node, interactive ones in pink.
- **Show 1920×1080 design frame** — the reference frame drawn inside the live
  canvas. The canvas is `screen / scaleFactor`, so it is usually *larger* than
  the design; this overlay shows exactly how much slack the current aspect ratio
  gives you.
- **Show tap areas** — the `Image.raycastPadding` inset that is the real pointer
  target on all 14 draggable items.
- **Show text boxes** — the TMP rect and, dashed, the margin-expanded text area.

---

## Live Layout Editor

Select any node and edit its live geometry, then copy or export the numbers.

**Everything is in the project's own units.** Position is `anchoredPos`
(Unity, **y-up**) and size is `sizeDelta` on the 1920×1080 reference grid —
exactly the fields `js/data.js` stores — so an exported value pastes straight
back into the scene data. The panel also shows the read-only design-frame and
stage positions for orientation.

- **Target** — a filter box plus a list of every node in the live scene, tagged
  `img` / `text` / `btn` / `off`. No hardcoded registry: the list is built from
  `Engine.nodes()`, so it always matches the scene.
- **Cursor Edit** — click any element to select it and drag in the same gesture.
  Pointer deltas are divided by the CanvasScaler factor and mapped through the
  parent's accumulated scale/rotation, so dragging tracks the cursor 1:1.
  Full-bleed background layers (`BG`, or anything covering ≥97% of the canvas)
  are never pickable or draggable. A capture-phase handler swallows the pick, so
  the click never reaches the game and no item ever starts a real drag.
- **8 resize handles** — corners and edges, 10px minimum. The edge opposite the
  handle stays pinned, with the matching `anchoredPos` correction for the node's
  pivot.
- **Snap 10** (or hold Shift) snaps position and size to a 10px grid.
- **Lock** protects the selection from accidental drags.
- **Transform fields** — X, Y, Width, Height, Scale, Rotation, Opacity, Font
  size. Type a value, or use ↑/↓ (Shift ×10) inside a field.
- **Arrange** — Bring to Front / Send to Back / Forward +1 / Backward −1,
  **Fit Content** (native sprite size, or measured text), **Duplicate Ghost**
  (offset clone, auto-removed after 8s), **Highlight**, **Reset Selected**.
- **Text** — edit the string of any TMP node and apply it live.

### Export

| Button | Output |
|---|---|
| **Copy Values** | Plain-text block for the selection: path, `anchoredPos`, `sizeDelta`, size, scale, rotation, pivot, anchors, design-frame rect, sprite, text, and the original values (`was`). |
| **Copy All Edited** | The same block for every element you touched. |
| **Copy Layout JSON** / **Download JSON** | `layout_<screen>_<timestamp>.json` — see below. |
| **Save Temp** / **Load Temp** | Persist the edit set to `localStorage` (`fancyDressGodLayout`), per scene. |
| **Re-apply saved layout on load** | Re-applies the saved set on every boot while God Mode is loaded. |
| **Clear Temp & Reset All** | Drops the saved set and restores every edited element. |

```json
{
  "scene": "Lbd1",
  "screen": "Level 01",
  "reference": [1920, 1080],
  "units": "x/y = anchoredPos (Unity y-up); sizeDelta/size in reference px",
  "assets": [
    { "id": "1831582194", "name": "Book",
      "path": "Canvas/Level 01/items /level 1/Item 2/Book",
      "x": 137.9, "y": 11.7, "sizeDelta": [709.9, 473.6], "size": [709.9, 473.6],
      "scale": 1, "rot": 0, "pivot": [0.5, 0.5],
      "refFrame": { "x": 109, "y": 612, "w": 710, "h": 474 },
      "sprite": "assets/img/Pencil_01.png",
      "was": { "x": 27, "y": 37, "sizeDelta": [634, 423], "scale": 1, "rot": 0 } }
  ]
}
```

`id` + `path` locate the node in `js/data.js`, and `was` gives the exact old
value to replace — so applying a layout back to source is a find-and-replace per
asset rather than a re-derivation.

Every selection also dispatches a `godEditorSelectionChanged` `CustomEvent` on
`document` with `{ element, id, name, node, path }`, so add-on tools can react
without coupling to the editor.

---

## Animation Ideas bar

Ideas are generated, not preset. The selected element is classified — `item`,
`basket`, `balance`, `button`, `hand`, `label`, `promptText`, `messageBar`,
`character`, `panel`, `background` or `default` — from its controller (a real
`DraggableItem` / `BasketDropZone` lookup) and its name, and each type gets a
sensible default condition (items → On Tap, baskets → On Drop, labels → On Level
Complete…).

Conditions: On Idle / Hover / Tap / Drag Start / Drop / Correct Answer / Wrong
Answer / Level Start / Level Complete / Game Over.

Each free-form idea label is resolved to a real keyframe class by an ordered
keyword regex (first match wins) over 27 base `gmAnim-*` classes, so new names
work automatically. Click a chip to preview live (class removed + reflow forced,
so it always replays), **Apply** to remember the choice on the element
(`data-gm-anim="condition:label"`), **Reset** to strip it.

**▸ Copy Animation Code** generates **standalone** CSS + JS from an internal
code bank — kebab-cased class (`.anim-happy-jelly-bounce`), camelCased keyframe,
and a `playHappyJellyBounce(el)` replay helper — so the export works in the real
game without `god-mode.css`. Copy buttons: CSS, JS, Full Code, Selector, Apply
Snippet.

---

## QA Test Mode

| Test | What it verifies |
|---|---|
| **Smoke** (`Q`) | `Engine` / `Controllers` / `Game` / `SCENES` / `ANIMS` / `FONT` present; the full Engine API; the scene's script instance counts (Lbd1: 14/14/7/7/7, Tutorial: 1/1); `#stage` exists, the CanvasScaler transform is actually applied, and the stage fits the viewport. |
| **Level Data** (`L`) | All 7 levels: weights differ by ≥0.1; `correctAnswerMode` valid, with the resulting correct answer printed; all 7 instructions non-empty; every VO path well-formed; every node reference (`instructionText`, buttons, labels, drop points, `measuringGame`) resolves; all four sprite states present per item; exactly one `isLastLevel`. |
| **Screen Flow** | Exactly one screen container active; which controllers have started; visible node count. |
| **Off-Stage / Layout** | Every visible node against the 1920×1080 reference frame and the viewport. Fails anything fully off-screen, warns on anything crossing the frame edge. This is the check that catches items disappearing on non-16:9 screens. |
| **Interaction** | Draggable state per item; the real tap area (raycast inset) is ≥80×80; both drop zones resolve their own padded area; whether anything is currently draggable. |
| **Assets** | Loads every sprite referenced by the scene and reports any that fail. |
| **Copy Report** | Timestamped report of the last run. |

---

## UI/UX Review

Kid-focused heuristics. Offenders are highlighted on screen (`uxIssue`,
`uxWarning`, `uxGood`) and explained in plain language. All sizes are judged in
the 1920×1080 design space, so the scale-to-fit transform can never fake a
result.

| Check | Heuristics |
|---|---|
| **Tap Targets** | Every button and draggable item ≥ **80×80**, measured on the raycast-padded area that is the actual tap target. |
| **Text Readability** | ≥ **24px**; no overflow of the text area; flags any string that wraps onto more than one line, and anything over 120 characters. |
| **Visual Hierarchy** | The items should dominate (avg ≥ 40,000px² of artwork); the message bar shouldn't exceed 300px tall; lists the visible buttons. |
| **Clutter** | Never more than one screen showing; ≤ 8 interactive elements; no placeholder/test/temp art visible. |
| **Kid-Friendly** (`K`) | No game jargon (score, round N, combo, points, level N); no digits; nothing over 140 characters; reports the scene's longest instruction. |
| **Design Frame** | Anything reaching outside the 1920×1080 frame — it will be cropped on narrow screens. |

---

## Stage, canvas and reference space

The project uses `ScreenMatchMode.MatchWidthOrHeight` with `match = 0.5`, so:

```
scaleFactor = exp(lerp(log(w/1920), log(h/1080), 0.5))
canvas      = [innerWidth / scaleFactor, innerHeight / scaleFactor]
```

The canvas therefore changes shape with the window and is usually **larger**
than 1920×1080. God Mode reports three coordinate spaces:

- **anchoredPos / sizeDelta** — the editable, resolution-independent values that
  live in `js/data.js`. This is what you copy.
- **design frame** — position inside the fixed 1920×1080 reference box, which
  sits centred in the canvas. Used by every size threshold and the layout tests.
- **stage** — position inside the live canvas, top-left origin, y down.

---

## Game API used

God Mode drives the game through its existing public surface only:
`Game.loadScene / currentScene / scenes / rootId`, `Engine.*` (nodes, setActive,
setAnchoredPos, setSizeDelta, setScale, setRotZ, setText, setSprite,
setNativeSize, setImageAlpha, setCanvasGroupAlpha, setAsFirst/LastSibling,
stagePos, setStagePos, confetti, animator, Audio, onActivated, canvas, ref,
scaleFactor, stage), `Controllers.get / isStarted / tickControllers`, and the
controller instances' own public fields (`runner`, `dragEnabled`,
`isLockedAfterDrop`, `selectionLocked`, `isInstructionPlaying`,
`isInteractionLocked`, `forceDrop`, `leftWeightOf`, `rightWeightOf`), plus
`window.SCENES` for the authored field values. No engine internals are patched
except `requestAnimationFrame`, which is restored on teardown.

---

## Deviations from GOD-MODE.md

Deliberate, and why:

1. **No `god-mode-panel.html`.** The doc fetches a panel template with an
   identical inline fallback for `file://`. Two copies of the same markup drift
   apart, so each module builds its own panel in JS instead — the learner
   `index.html` stays just as clean, and behaviour is identical on `file://` and
   over HTTP.
2. **No hardcoded element registry / group mode.** Bubble Days has a fixed cast
   ("all bubbles", "correct bubbles"). This scene tree is generated data with
   352 nodes, so the target list is built live from `Engine.nodes()` with a text
   filter, and editing is always single-target. Nothing to keep in sync when the
   scene changes.
3. **Editor units are `anchoredPos` / `sizeDelta`, not stage pixels.** The doc's
   stage space is a fixed 1920×1080 grid; here the canvas grows with the aspect
   ratio, and the numbers that belong in `data.js` are the Unity ones. Design-
   frame and stage positions are shown read-only alongside.
4. **Game-specific controls re-pointed.** There are no gems, timer, bubbles or
   owl dialogue in this game, so Rewards / Timer testing are replaced by the
   drop / answer / label / game-over flow, and level testing walks the seven
   `Level *` containers.
5. **Animation speed patches the rAF clock.** Bubble Days reads a CSS variable;
   this engine drives all motion from one rAF loop, so scaling the timestamp is
   what actually slows the ported tweens and Animator curves.
6. **Resize minimum is 10×10** (the `CreditManagement.md` §7 figure) rather than
   40×40, so small hint art can still be edited.
7. **Extra checks this game needs:** the Off-Stage / Layout QA test and the UX
   Design Frame check, both of which target the aspect-ratio cropping that hides
   the item trays, and a `Z` shortcut to roll every panel up out of the way.
