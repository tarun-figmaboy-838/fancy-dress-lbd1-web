/* ============================================================================
 *  god-mode.js — main God Mode controller for The Fancy Dress Competition.
 *
 *  Owns activation (Shift+G), the debug panel, screen/level navigation, game
 *  flow jumps, the animation clock, visual debug overlays, and wires up the
 *  Live Editor / Animation Ideas / QA / UX Review modules.
 *
 *  Everything is additive and fully reversible: delete the god-mode <link> and
 *  <script> tags from index.html and the learner build is byte-for-byte the
 *  original. Toggling God Mode off tears every affordance back down.
 * ========================================================================== */
window.FancyDressGodMode = function () {
  'use strict';

  var U = window.GodModeUtils;
  var on = false;
  var editor = null, animBar = null, qa = null, ux = null;
  var root = null, panel = null, safeArea = null;
  var speed = 1, realRaf = null, vClock = 0, lastReal = 0;

  var DEBUG_CLASSES = ['godShowBounds', 'godShowSafeArea', 'godShowHits',
    'godShowTextBoxes', 'godPauseAnimations'];

  // ================================================================ panel ===
  var PANEL_HTML =
    '<div class="godHead"><b>God Mode Debug</b><span class="godSpacer"></span>' +
    '<button data-god-min title="Minimise">&minus;</button></div>' +
    '<div class="godBody">' +

    '<div class="godSection"><h4>Scene</h4>' +
    '<div class="godChips" id="gmScenes"></div>' +
    '<div class="godRow" style="margin-top:6px"><button id="gmReload" class="godWide">Reload Current Scene</button></div>' +
    '</div>' +

    '<div class="godSection"><h4>Screens</h4>' +
    '<div class="godChips" id="gmScreens"></div>' +
    '<p class="godNote" id="gmScreenInfo">—</p></div>' +

    '<div class="godSection"><h4>Level Testing</h4>' +
    '<div class="godGrid3">' +
    '<button id="gmPrev" title="P">◀ Prev</button>' +
    '<button id="gmRestart" title="R">Restart</button>' +
    '<button id="gmNext" title="N">Next ▶</button>' +
    '</div>' +
    '<div class="godGrid">' +
    '<button id="gmDropBoth" title="A">Drop Both Items</button><button id="gmSkipVo">Skip Voice-over</button>' +
    '<button id="gmUnlockDrag">Unlock Drag</button><button id="gmUnlockTap">Unlock Tap</button>' +
    '</div></div>' +

    '<div class="godSection"><h4>Game Flow</h4>' +
    '<div class="godGrid">' +
    '<button id="gmCorrect" title="C">Correct Answer</button><button id="gmWrong" title="W">Wrong Answer</button>' +
    '<button id="gmLabels">Show Heavy/Light</button><button id="gmConfetti">Confetti Burst</button>' +
    '<button id="gmNextBtn">Show Next Button</button><button id="gmTryAgain">Show Try Again</button>' +
    '<button id="gmGameOver" title="F">Game Over Panel</button><button id="gmInventory" title="O">Log Inventory</button>' +
    '</div>' +
    '<div class="godRow"><button id="gmReveal" class="godWide">Reveal Hint Layers</button></div>' +
    '<p class="godNote">Reveal shows the arrows, hint hands and ghost-drag art so they can be ' +
    'aligned. They sit on top of the items, so switch it off before picking anything underneath.</p>' +
    '</div>' +

    '<div class="godSection"><h4>Animation Speed</h4>' +
    '<div class="godChips" id="gmSpeeds">' +
    '<button data-speed="0">Pause</button><button data-speed="0.5">0.5×</button>' +
    '<button data-speed="1" class="godCur">1×</button><button data-speed="1.5">1.5×</button>' +
    '<button data-speed="2">2×</button></div>' +
    '<p class="godNote">Scales the engine clock, so ported tweens, the Animator and CSS all slow together.</p></div>' +

    '<div class="godSection"><h4>Visual Debug</h4>' +
    '<label class="godCheck"><input type="checkbox" data-body="godShowBounds"> Show bounds <b>(B)</b></label>' +
    '<label class="godCheck"><input type="checkbox" data-body="godShowSafeArea"> Show 1920×1080 design frame <b>(S)</b></label>' +
    '<label class="godCheck"><input type="checkbox" data-body="godShowHits"> Show tap areas (raycastPadding) <b>(H)</b></label>' +
    '<label class="godCheck"><input type="checkbox" data-body="godShowTextBoxes"> Show text boxes <b>(T)</b></label>' +
    '</div>' +

    '<div class="godSection"><h4>Panels</h4>' +
    '<div class="godGrid">' +
    '<button data-toggle="godEditPanel" class="godOn">Layout Editor</button>' +
    '<button data-toggle="godAnimPanel">Animation Ideas</button>' +
    '<button data-toggle="godQaPanel">QA Tests</button>' +
    '<button data-toggle="godUxPanel">UI/UX Review</button>' +
    '</div></div>' +

    '<div class="godSection"><h4>Shortcuts</h4><p class="godNote">' +
    '<b>Shift+G</b> toggle · <b>E</b> cursor edit · <b>arrows</b> nudge 1px (Shift ×10)<br>' +
    '<b>N/P/R</b> next/prev/restart level · <b>A</b> drop both · <b>C/W</b> correct/wrong · <b>F</b> game over<br>' +
    '<b>1–5</b> speed · <b>B/S/H/T</b> overlays · <b>Q/L</b> QA · <b>V/K/X</b> UX<br>' +
    '<b>D</b> download layout JSON · <b>Ctrl+C</b> copy values · <b>Ctrl+E</b> copy all edited<br>' +
    '<b>Z</b> collapse/expand all panels (frees the stage for cursor editing) · <b>O</b> log inventory' +
    '</p></div>' +

    '</div>';

  function buildShell() {
    root = document.createElement('div');
    root.id = 'godModeRoot';
    document.body.appendChild(root);

    var badge = document.createElement('div');
    badge.id = 'godBadge';
    badge.textContent = '⚡ God Mode';
    root.appendChild(badge);

    var toast = document.createElement('div');
    toast.id = 'godToast';
    root.appendChild(toast);

    panel = document.createElement('div');
    panel.className = 'godPanel godOpen';
    panel.id = 'godPanel';
    panel.innerHTML = PANEL_HTML;
    root.appendChild(panel);
  }

  // ====================================================== scene / screens ===
  function scenes() { return (window.Game && Game.scenes) || []; }

  function refreshNav() {
    var sc = U.qa('#gmScenes');
    if (!sc) return;
    sc.innerHTML = scenes().map(function (n) {
      return '<button data-scene="' + n + '"' +
        (Game.currentScene() === n ? ' class="godCur"' : '') + '>' + n + '</button>';
    }).join('');
    U.qsa('button', sc).forEach(function (b) {
      b.addEventListener('click', function () { gotoScene(b.dataset.scene); });
    });

    var box = U.qa('#gmScreens');
    var list = U.screens();
    box.innerHTML = list.map(function (s) {
      return '<button data-screen="' + s.id + '"' + (s.active ? ' class="godCur"' : '') + '>' +
        U.esc(s.name) + '</button>';
    }).join('');
    U.qsa('button', box).forEach(function (b) {
      b.addEventListener('click', function () { gotoScreen(b.dataset.screen); });
    });

    var cur = U.activeScreen();
    var c = U.canvas();
    U.qa('#gmScreenInfo').innerHTML = 'active: <b>' + (cur ? U.esc(cur.name) : 'none') + '</b> · ' +
      'canvas ' + Math.round(c[0]) + '×' + Math.round(c[1]) + ' @ ' + U.scale().toFixed(3) + '×';
  }

  function gotoScene(name) {
    if (!name || name === Game.currentScene()) { Game.loadScene(name || Game.currentScene()); }
    else Game.loadScene(name);
    afterSceneLoad();
  }

  function afterSceneLoad() {
    if (editor) { editor.select(null); editor.rebuildTargets(); editor.applySaved(true); }
    ensureSafeArea();
    refreshNav();
    var rb = U.qa('#gmReveal');
    if (rb) rb.classList.remove('godOn');    // a fresh scene starts un-revealed
  }

  /* Stop the ported coroutines and the VO before jumping, so two screens can
     never end up talking over each other. */
  function killActivity() {
    var scene = Game.currentScene(), s = window.SCENES[scene].scripts;
    ['WeightGameTutorialController', 'TutorialManager'].forEach(function (name) {
      (s[name] || []).forEach(function (sc) {
        var inst = Controllers.get(name, sc.node);
        if (inst && inst.runner) inst.runner.stopAll();
        var src = sc.fields.instructionAudioSource || sc.fields.audioSource;
        if (src) Engine.Audio.source(src).stop();
      });
    });
  }

  function gotoScreen(id) {
    killActivity();
    U.screens().forEach(function (s) { Engine.setActive(s.id, String(s.id) === String(id)); });
    Controllers.tickControllers();
    refreshNav();
    if (editor) editor.rebuildTargets();
    var n = Engine.node(id);
    U.toast('Screen: ' + (n ? n.name : id));
  }

  function stepScreen(dir) {
    var list = U.screens(), i = -1;
    list.forEach(function (s, k) { if (s.active) i = k; });
    var j = i + dir;
    if (j < 0 || j >= list.length) { U.toast(dir > 0 ? 'Last screen' : 'First screen'); return; }
    gotoScreen(list[j].id);
  }

  /* A real restart needs the controllers to run Start() again, and Start only
     fires once per instance — so reload the scene and re-open the same screen. */
  function restartScreen() {
    var cur = U.activeScreen();
    var name = cur ? cur.name : null;
    Game.loadScene(Game.currentScene());
    afterSceneLoad();
    if (!name) return;
    var match = U.screens().filter(function (s) { return s.name === name; })[0];
    if (match) gotoScreen(match.id);
    U.toast('Restarted ' + name);
  }

  // ====================================================== active controller ==
  function activeCtl() {
    var scene = Game.currentScene(), s = window.SCENES[scene].scripts, found = null;
    ['WeightGameTutorialController', 'TutorialManager'].forEach(function (name) {
      (s[name] || []).forEach(function (sc) {
        if (found || !Engine.activeInHierarchy(sc.node)) return;
        var inst = Controllers.get(name, sc.node);
        if (inst) found = { name: name, inst: inst, f: sc.fields, node: sc.node };
      });
    });
    return found;
  }

  function needCtl() {
    var c = activeCtl();
    if (!c) U.toast('No live level controller on this screen');
    return c;
  }

  function clickNode(id) {
    var n = Engine.node(id);
    if (!n) return false;
    Engine.setInteractable(id, true);
    n.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  function correctButton(c) {
    if (c.name === 'TutorialManager') return c.f.ballButton;      // ball is the heavier one
    var bookIsCorrect = c.f.correctAnswerMode === 0
      ? c.f.bookWeight < c.f.ballWeight
      : c.f.bookWeight > c.f.ballWeight;
    return bookIsCorrect ? c.f.bookButton : c.f.ballButton;
  }

  function answer(correct) {
    var c = needCtl();
    if (!c) return;
    var right = correctButton(c);
    var target = correct ? right : (right === c.f.bookButton ? c.f.ballButton : c.f.bookButton);
    /* Stop whatever instruction is still typing, otherwise two coroutines
       fight over the message bar and the forced answer looks broken. */
    if (c.inst.runner) c.inst.runner.stopAll();
    skipVo();
    if (c.inst.isInstructionPlaying) c.inst.isInstructionPlaying = false;
    if (c.inst.selectionLocked) c.inst.selectionLocked = false;
    if (c.inst.isInteractionLocked) c.inst.isInteractionLocked = false;
    clickNode(target);
    U.toast((correct ? 'Correct' : 'Wrong') + ' answer fired');
  }

  function dropBoth() {
    var c = needCtl();
    if (!c || c.name !== 'WeightGameTutorialController') { U.toast('Lbd1 levels only'); return; }
    var scene = Game.currentScene();
    var zones = (window.SCENES[scene].scripts.BasketDropZone || []).filter(function (sc) {
      return String(sc.fields.gameManager) === String(c.f.measuringGame);
    });
    var left = zones.filter(function (z) { return z.fields.isLeftBasket; })[0];
    var right = zones.filter(function (z) { return !z.fields.isLeftBasket; })[0];
    [[c.f.bookDraggable, left], [c.f.ballDraggable, right]].forEach(function (pair) {
      var item = Controllers.get('DraggableItem', pair[0]);
      var zone = pair[1] && Controllers.get('BasketDropZone', pair[1].node);
      if (!item || !zone) return;
      item.dragEnabled = true;
      item.isLockedAfterDrop = false;
      zone.forceDrop(item);
    });
    U.toast('Both items dropped');
  }

  function unlockDrag() {
    var c = needCtl();
    if (!c) return;
    [c.f.bookDraggable, c.f.ballDraggable].forEach(function (id) {
      var d = id && Controllers.get('DraggableItem', id);
      if (d) { d.dragEnabled = true; d.isLockedAfterDrop = false; }
    });
    U.toast('Dragging unlocked');
  }

  function unlockTap() {
    var c = needCtl();
    if (!c) return;
    c.inst.isInstructionPlaying = false;
    c.inst.selectionLocked = false;
    c.inst.isInteractionLocked = false;
    [c.f.bookButton, c.f.ballButton].forEach(function (id) { if (id) Engine.setInteractable(id, true); });
    U.toast('Tapping unlocked');
  }

  function skipVo() {
    var c = needCtl();
    if (!c) return;
    var src = c.f.instructionAudioSource || c.f.audioSource;
    if (src) Engine.Audio.source(src).stop();
    U.toast('Voice-over stopped');
  }

  function showLabels() {
    var c = needCtl();
    if (!c || !c.f.label1) { U.toast('This screen has no heavy/light labels'); return; }
    var mg = Controllers.get('WeightMeasuringGame', c.f.measuringGame);
    var l = mg ? mg.leftWeightOf() : 0, r = mg ? mg.rightWeightOf() : 0;
    var a, b;
    if (l > r) { a = c.f.leftHeavyPoint; b = c.f.rightLightPoint; }
    else if (r > l) { a = c.f.rightHeavyPoint; b = c.f.leftLightPoint; }
    else { a = c.f.leftLightPoint; b = c.f.rightLightPoint; }
    [[c.f.label1, a], [c.f.label2, b]].forEach(function (p) {
      if (!p[0] || !p[1]) return;
      Engine.setActive(p[0], true);
      Engine.setScale(p[0], 1);
      var pos = Engine.stagePos(p[1]);
      Engine.setStagePos(p[0], pos[0], pos[1]);
    });
    U.toast('Labels placed (weights ' + l + ' vs ' + r + ')');
  }

  function showButton(which) {
    var c = needCtl();
    if (!c) return;
    var id = which === 'next' ? c.f.nextButton : c.f.tryAgainButton;
    if (!id) { U.toast('Not on this screen'); return; }
    Engine.setActive(id, true);
    Engine.setInteractable(id, true);
    U.toast((which === 'next' ? 'Next' : 'Try Again') + ' button shown');
  }

  function gameOver() {
    var scene = Game.currentScene();
    var last = (window.SCENES[scene].scripts.WeightGameTutorialController || []).filter(function (sc) {
      return sc.fields.isLastLevel;
    })[0];
    if (!last) { U.toast('No final level in this scene'); return; }
    var screen = U.screens().filter(function (s) { return String(s.id) === String(last.fields.measuringGame); })[0];
    if (screen && !screen.active) gotoScreen(screen.id);
    if (last.fields.gameOverPanel) {
      Engine.setActive(last.fields.gameOverPanel, true);
      U.toast('Game over panel shown');
    } else U.toast('Final level has no gameOverPanel');
  }

  function confetti() {
    var c = activeCtl();
    var id = c && (c.f.ballCorrectParticle || c.f.bookCorrectParticle);
    if (!id) { U.toast('No particle anchor here'); return; }
    Engine.confetti(id);
  }

  function logInventory() {
    var rows = U.nodeList({ visibleOnly: true }).map(function (it) {
      var r = U.refRectOf(it.node.el);
      return {
        name: it.name, id: it.id,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.w), h: Math.round(r.h),
        anchoredX: U.r1(it.node.anchoredPos[0]), anchoredY: U.r1(it.node.anchoredPos[1]),
        kind: it.node.tmp ? 'text' : it.node.image ? 'image' : 'group',
        path: it.path
      };
    });
    console.table(rows);
    U.toast(rows.length + ' visible nodes logged to console');
  }

  /* Hidden guidance layers are the fiddliest things to align, so they can be
     surfaced for editing — off by default, because a revealed ghost item sits
     over the real item and would swallow cursor-edit picks. */
  function toggleReveal() {
    if (U.qsa('#stage .un[data-god-revealed]').length) {
      hideRevealed();
      U.qa('#gmReveal').classList.remove('godOn');
      U.toast('Hint layers hidden');
      return;
    }
    revealForEditing();
    var n = U.qsa('#stage .un[data-god-revealed]').length;
    U.qa('#gmReveal').classList.toggle('godOn', n > 0);
    U.toast(n ? n + ' hint layers revealed' : 'Nothing hidden to reveal here');
  }

  function revealForEditing() {
    var c = activeCtl();
    if (!c) return;
    ['leftArrow', 'rightArrow', 'hintHand', 'itemHintHand', 'ghostHand', 'ghostItem',
     'arrowUp', 'arrowDown', 'newHintHand'].forEach(function (key) {
      var id = c.f[key];
      if (!id || !Engine.node(id)) return;
      if (!Engine.activeSelf(id)) {
        Engine.setActive(id, true);
        Engine.node(id).el.dataset.godRevealed = '1';
      }
    });
  }

  function hideRevealed() {
    U.qsa('#stage .un[data-god-revealed]').forEach(function (el) {
      Engine.setActive(el.dataset.id, false);
      delete el.dataset.godRevealed;
    });
  }

  // ==================================================== the animation clock ==
  /* Scaling the timestamp handed to the engine's single rAF loop slows every
     ported tween and Animator curve at once; CSS is handled by playbackRate. */
  function patchClock() {
    if (realRaf) return;
    realRaf = window.requestAnimationFrame.bind(window);
    vClock = 0; lastReal = 0;
    window.requestAnimationFrame = function (cb) {
      return realRaf(function (now) {
        if (!lastReal) lastReal = now;
        if (now !== lastReal) { vClock += (now - lastReal) * speed; lastReal = now; }
        cb(vClock);
      });
    };
  }
  function unpatchClock() {
    if (!realRaf) return;
    window.requestAnimationFrame = realRaf;
    realRaf = null;
  }

  function setSpeed(v) {
    speed = v;
    if (v !== 1) patchClock();
    document.documentElement.style.setProperty('--god-animation-speed', String(v));
    document.body.classList.toggle('godPauseAnimations', v === 0);
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) {
        try { a.playbackRate = v || 0.0001; } catch (e) {}
      });
    }
    U.qsa('#gmSpeeds button').forEach(function (b) {
      b.classList.toggle('godCur', parseFloat(b.dataset.speed) === v);
    });
  }

  // ======================================================== design overlay ===
  function ensureSafeArea() {
    var st = U.stage();
    if (!st) return;
    safeArea = document.getElementById('godSafeArea');
    if (!safeArea || safeArea.parentNode !== st) {
      safeArea = document.createElement('div');
      safeArea.id = 'godSafeArea';
      st.appendChild(safeArea);
    }
    layoutSafeArea();
  }

  function layoutSafeArea() {
    if (!safeArea) return;
    var c = U.canvas(), rf = U.ref();
    safeArea.style.left = (c[0] - rf[0]) / 2 + 'px';
    safeArea.style.top = (c[1] - rf[1]) / 2 + 'px';
    safeArea.style.width = rf[0] + 'px';
    safeArea.style.height = rf[1] + 'px';
    safeArea.dataset.label = rf[0] + ' × ' + rf[1] + ' design frame  ·  canvas ' +
      Math.round(c[0]) + ' × ' + Math.round(c[1]);
  }

  // ============================================================== toggling ===
  function setOn(next) {
    on = !!next;
    document.body.classList.toggle('godMode', on);
    if (on) {
      ensureSafeArea();
      refreshNav();
      if (editor) editor.rebuildTargets();
      U.toast('God Mode ON — Shift+G to exit');
    } else {
      teardown();
    }
    U.qsa('.godPanel').forEach(function (p) {
      if (!on) return;
      if (p.id === 'godPanel' || p.id === 'godEditPanel') p.classList.add('godOpen');
    });
  }

  function teardown() {
    DEBUG_CLASSES.forEach(function (c) { document.body.classList.remove(c); });
    U.qsa('#godPanel input[type=checkbox]').forEach(function (cb) { cb.checked = false; });
    setSpeed(1);
    unpatchClock();
    if (editor) editor.resetAll();
    if (ux) ux.clear();
    if (animBar) animBar.clearAll();
    hideRevealed();
    U.qsa('.godPanel').forEach(function (p) { p.classList.remove('godOpen'); });
    U.qsa('#godPanel [data-toggle]').forEach(function (b) {
      b.classList.toggle('godOn', b.dataset.toggle === 'godEditPanel');
    });
  }

  // ========================================================= panel dragging ==
  function makeDraggable(p) {
    var head = p.querySelector('.godHead');
    if (!head) return;
    head.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      var r = p.getBoundingClientRect();
      var offX = ev.clientX - r.left, offY = ev.clientY - r.top;
      p.style.left = r.left + 'px';
      p.style.top = r.top + 'px';
      p.style.right = 'auto';
      p.style.bottom = 'auto';
      var move = function (e) {
        var x = Math.max(4, Math.min(window.innerWidth - 60, e.clientX - offX));
        var y = Math.max(4, Math.min(window.innerHeight - 34, e.clientY - offY));
        p.style.left = x + 'px';
        p.style.top = y + 'px';
      };
      var up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      ev.preventDefault();
    });
  }

  // ================================================================= wiring ==
  function wire() {
    var bind = {
      gmReload: function () { gotoScene(Game.currentScene()); },
      gmPrev: function () { stepScreen(-1); },
      gmNext: function () { stepScreen(1); },
      gmRestart: restartScreen,
      gmDropBoth: dropBoth,
      gmSkipVo: skipVo,
      gmUnlockDrag: unlockDrag,
      gmUnlockTap: unlockTap,
      gmCorrect: function () { answer(true); },
      gmWrong: function () { answer(false); },
      gmLabels: showLabels,
      gmConfetti: confetti,
      gmNextBtn: function () { showButton('next'); },
      gmTryAgain: function () { showButton('tryagain'); },
      gmGameOver: gameOver,
      gmInventory: logInventory,
      gmReveal: toggleReveal
    };
    Object.keys(bind).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', bind[id]);
    });

    U.qsa('#gmSpeeds button').forEach(function (b) {
      b.addEventListener('click', function () { setSpeed(parseFloat(b.dataset.speed)); });
    });

    U.qsa('#godPanel input[data-body]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        document.body.classList.toggle(cb.dataset.body, cb.checked);
        if (cb.dataset.body === 'godShowSafeArea' && cb.checked) { ensureSafeArea(); }
      });
    });

    U.qsa('#godPanel [data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = document.getElementById(b.dataset.toggle);
        if (!p) return;
        var open = !p.classList.contains('godOpen');
        p.classList.toggle('godOpen', open);
        b.classList.toggle('godOn', open);
      });
    });

    document.addEventListener('click', function (ev) {
      var m = ev.target.closest && ev.target.closest('[data-god-min]');
      if (!m) return;
      m.closest('.godPanel').classList.toggle('godMin');
    });

    window.addEventListener('resize', function () { layoutSafeArea(); refreshNav(); });
    Engine.onActivated(function () { if (on && editor) editor.rebuildTargets(); });
  }

  // ============================================================= shortcuts ==
  function keys(ev) {
    if (ev.key === 'G' && ev.shiftKey) { ev.preventDefault(); setOn(!on); return; }
    if (!on || U.isTypingInField(ev)) return;

    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C')) {
      if (editor && editor.selected()) { ev.preventDefault(); editor.copySelected(); }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'e' || ev.key === 'E')) {
      ev.preventDefault(); if (editor) editor.copyAllEdited(); return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    if (ev.key.indexOf('Arrow') === 0) {
      if (!editor || !editor.selected()) return;
      ev.preventDefault();
      var step = ev.shiftKey ? 10 : 1;
      var dx = ev.key === 'ArrowRight' ? step : ev.key === 'ArrowLeft' ? -step : 0;
      var dy = ev.key === 'ArrowUp' ? step : ev.key === 'ArrowDown' ? -step : 0;  // Unity y-up
      editor.nudge(dx, dy);
      return;
    }

    var checks = { b: 'godShowBounds', s: 'godShowSafeArea', h: 'godShowHits', t: 'godShowTextBoxes' };
    var k = ev.key.toLowerCase();
    if (checks[k]) {
      var cb = U.qa('#godPanel input[data-body="' + checks[k] + '"]');
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
      return;
    }
    if ('12345'.indexOf(ev.key) >= 0) { setSpeed([0, 0.5, 1, 1.5, 2][+ev.key - 1]); return; }

    switch (k) {
      case 'n': stepScreen(1); break;
      case 'p': stepScreen(-1); break;
      case 'r': restartScreen(); break;
      case 'e': if (editor) editor.setCursorEdit(!editor.cursorEdit()); break;
      case 'a': dropBoth(); break;
      case 'c': answer(true); break;
      case 'w': answer(false); break;
      case 'f': gameOver(); break;
      case 'd': if (editor) editor.downloadJson(); break;
      case 'o': logInventory(); break;
      case 'q': if (qa) { openPanel('godQaPanel'); qa.smokeTest(); } break;
      case 'l': if (qa) { openPanel('godQaPanel'); qa.levelDataTest(); } break;
      case 'v': if (ux) { openPanel('godUxPanel'); ux.runAll(); } break;
      case 'k': if (ux) { openPanel('godUxPanel'); ux.clear(); ux.kidFriendly(); } break;
      case 'x': if (ux) ux.clear(); break;
      case 'z': collapseAll(); break;
      default: break;
    }
  }

  /* Floating panels necessarily sit over the stage; Z rolls them all up to
     their headers so the whole scene is clickable for cursor editing. */
  function collapseAll() {
    var open = U.qsa('.godPanel.godOpen');
    var anyExpanded = open.some(function (p) { return !p.classList.contains('godMin'); });
    open.forEach(function (p) { p.classList.toggle('godMin', anyExpanded); });
    U.toast(anyExpanded ? 'Panels collapsed (Z)' : 'Panels expanded (Z)');
  }

  function openPanel(id) {
    var p = document.getElementById(id);
    if (p) p.classList.add('godOpen');
    var b = U.qa('#godPanel [data-toggle="' + id + '"]');
    if (b) b.classList.add('godOn');
  }

  // ================================================================== init ==
  function init() {
    buildShell();

    editor = window.GodModeLiveEditor ? window.GodModeLiveEditor() : null;
    animBar = window.GodModeAnimationBar ? window.GodModeAnimationBar() : null;
    qa = window.GodModeQA ? window.GodModeQA() : null;
    ux = window.GodModeUXReview ? window.GodModeUXReview() : null;
    [editor, animBar, qa, ux].forEach(function (m) { if (m) m.init(); });

    wire();
    U.qsa('.godPanel').forEach(makeDraggable);
    window.addEventListener('keydown', keys);
    ensureSafeArea();
    refreshNav();

    if (/[?&](debug|god)=1/.test(location.search)) setOn(true);
    console.log('%c⚡ God Mode ready — press Shift+G', 'color:#3DF5C4;font-weight:700');
  }

  return {
    init: init,
    toggle: function (v) { setOn(v === undefined ? !on : v); },
    isOn: function () { return on; },
    editor: function () { return editor; },
    animationBar: function () { return animBar; },
    qa: function () { return qa; },
    ux: function () { return ux; },
    gotoScene: gotoScene, gotoScreen: gotoScreen, setSpeed: setSpeed,
    refreshNav: refreshNav
  };
};

/* ------------------------------------------------------------- bootstrap --- */
(function () {
  'use strict';
  function boot() {
    if (!window.Engine || !window.Game || !window.GodModeUtils) {
      console.warn('[God Mode] Engine/Game not found — God Mode not started.');
      return;
    }
    window.godMode = window.FancyDressGodMode();
    window.godMode.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
