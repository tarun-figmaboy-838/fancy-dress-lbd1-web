/* ============================================================================
 *  god-mode-qa.js — automated checks against the game instance and the real
 *  DOM. Everything reads live state; nothing is mocked.
 * ========================================================================== */
window.GodModeQA = function () {
  'use strict';

  var U = window.GodModeUtils;
  var panel = null, out = null, report = [];

  var REQUIRED_ENGINE = ['boot', 'node', 'setActive', 'setSprite', 'setNativeSize', 'setText',
    'setAnchoredPos', 'setSizeDelta', 'setScale', 'setRotZ', 'setParent',
    'setAsLastSibling', 'setAsFirstSibling', 'animator', 'confetti',
    'pointerToStage', 'stageRectYUp', 'localPointInRect'];

  var EXPECTED_COUNTS = {
    Tutorial: { ButtonAnimator: 1, TutorialManager: 1 },
    Lbd1: { DraggableItem: 14, BasketDropZone: 14, WeightMeasuringGame: 7,
            WeightGameTutorialController: 7, UltraSimpleWeightGame: 7 }
  };

  // ------------------------------------------------------------- reporting --
  function begin(title) {
    report = ['=== ' + title + ' — ' + new Date().toLocaleTimeString() + ' ==='];
    if (out) out.innerHTML = '<span class="head">' + U.esc(title) + '</span>\n';
    console.group('[GodMode QA] ' + title);
  }
  function line(cls, prefix, msg) {
    var text = prefix + ' ' + msg;
    report.push(text);
    if (out) out.innerHTML += '<span class="' + cls + '">' + U.esc(text) + '</span>\n';
    (cls === 'bad' ? console.error : cls === 'warn' ? console.warn : console.log)(text);
  }
  var pass = function (m) { line('ok', 'PASS', m); };
  var fail = function (m) { line('bad', 'FAIL', m); };
  var warn = function (m) { line('warn', 'WARN', m); };
  var info = function (m) { line('dim', '    ', m); };
  function end() {
    var f = report.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    var w = report.filter(function (l) { return l.indexOf('WARN') === 0; }).length;
    line(f ? 'bad' : w ? 'warn' : 'ok', '——', f + ' failed, ' + w + ' warnings');
    console.groupEnd();
    if (out) out.scrollTop = 0;
  }
  function assert(cond, msg) { cond ? pass(msg) : fail(msg); return !!cond; }

  // ---------------------------------------------------------------- tests ---
  function smokeTest() {
    begin('Smoke Test');
    assert(!!window.Engine, 'Engine global present');
    assert(!!window.Controllers, 'Controllers global present');
    assert(!!window.Game, 'Game global present');
    assert(!!window.SCENES && Object.keys(window.SCENES).length === 2, 'SCENES holds 2 scenes');
    assert(!!window.ANIMS && Object.keys(window.ANIMS).length >= 6, 'ANIMS holds the extracted clips');
    assert(!!window.FONT && !!window.FONT.family, 'FONT metrics present');

    var missing = REQUIRED_ENGINE.filter(function (m) { return typeof Engine[m] !== 'function'; });
    assert(!missing.length, 'Engine API complete' + (missing.length ? ' — missing ' + missing.join(', ') : ''));

    var scene = Game.currentScene();
    info('current scene: ' + scene);
    var want = EXPECTED_COUNTS[scene] || {};
    Object.keys(want).forEach(function (name) {
      var got = (window.SCENES[scene].scripts[name] || []).length;
      assert(got === want[name], name + ': ' + got + ' instances (expected ' + want[name] + ')');
    });

    var st = U.stage();
    assert(!!st, '#stage exists');
    if (st) {
      var r = st.getBoundingClientRect(), k = U.scale(), c = U.canvas();
      var okScale = Math.abs(r.width - c[0] * k) < 2;
      assert(okScale, 'CanvasScaler transform applied (stage ' + Math.round(r.width) +
        'px = canvas ' + Math.round(c[0]) + ' x scale ' + k.toFixed(3) + ')');
      assert(r.width <= window.innerWidth + 2 && r.height <= window.innerHeight + 2,
        'stage fits the viewport (' + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
    }
    var screens = U.screens();
    assert(screens.length > 0, screens.length + ' screen containers found');
    end();
  }

  function levelDataTest() {
    begin('Level Data Test');
    var scene = Game.currentScene();
    var list = window.SCENES[scene].scripts.WeightGameTutorialController || [];
    if (!list.length) {
      warn('no WeightGameTutorialController in ' + scene + ' — run this in Lbd1');
      end(); return;
    }
    assert(list.length === 7, list.length + ' levels defined');
    var lastFlags = 0;
    list.forEach(function (sc, i) {
      var f = sc.fields, tag = 'L' + (i + 1);
      var diff = Math.abs(f.bookWeight - f.ballWeight);
      assert(diff >= 0.1, tag + ' weights differ (' + f.bookWeight + ' vs ' + f.ballWeight + ')');
      assert(f.correctAnswerMode === 0 || f.correctAnswerMode === 1,
        tag + ' correctAnswerMode valid (' + (f.correctAnswerMode === 0 ? 'Light' : 'Heavy') + ')');

      var bookIsCorrect = f.correctAnswerMode === 0 ? f.bookWeight < f.ballWeight : f.bookWeight > f.ballWeight;
      info(tag + ' asks for the ' + (f.correctAnswerMode === 0 ? 'lighter' : 'heavier') +
        ' item → correct answer is the ' + (bookIsCorrect ? 'left/book' : 'right/ball') + ' slot');

      for (var k = 1; k <= 7; k++) {
        var msg = f['instruction' + k];
        if (!msg || !String(msg).trim()) fail(tag + ' instruction' + k + ' is empty');
        var clip = f['instruction' + k + 'Audio'];
        if (!clip) warn(tag + ' instruction' + k + ' has no VO clip');
        else if (String(clip).indexOf('assets/audio/') !== 0) fail(tag + ' instruction' + k + 'Audio path looks wrong: ' + clip);
      }
      ['instructionText', 'bookButton', 'ballButton', 'label1', 'label2', 'nextButton',
       'tryAgainButton', 'leftDropPoint', 'rightDropPoint', 'measuringGame'
      ].forEach(function (key) {
        if (!f[key]) { fail(tag + ' field ' + key + ' unset'); return; }
        if (!Engine.node(f[key])) fail(tag + ' field ' + key + ' points at a missing node (' + f[key] + ')');
      });
      ['bookNormalSprite', 'ballNormalSprite', 'bookHighlightSprite', 'ballHighlightSprite',
       'bookCorrectSprite', 'ballCorrectSprite', 'bookWrongSprite', 'ballWrongSprite'
      ].forEach(function (key) {
        if (!f[key] || !f[key].path) warn(tag + ' ' + key + ' missing');
      });
      if (f.isLastLevel) lastFlags++;
    });
    assert(lastFlags === 1, 'exactly one level flagged isLastLevel (' + lastFlags + ')');
    end();
  }

  function screenFlowTest() {
    begin('Screen Flow Test');
    var screens = U.screens();
    var on = screens.filter(function (s) { return s.active; });
    assert(on.length === 1, on.length + ' screen container active (' +
      on.map(function (s) { return s.name; }).join(', ') + ')');
    screens.forEach(function (s) {
      info((s.active ? '● ' : '○ ') + s.name + '  id ' + s.id);
    });
    var scene = Game.currentScene();
    (window.SCENES[scene].scripts.WeightGameTutorialController || []).forEach(function (sc, i) {
      var started = Controllers.isStarted(sc.node, 'WeightGameTutorialController');
      info('L' + (i + 1) + ' controller ' + (started ? 'started' : 'dormant'));
    });
    var live = 0;
    U.qsa('#stage .un').forEach(function (el) { if (U.isVisible(el)) live++; });
    info(live + ' visible nodes on screen');
    end();
  }

  /* The canvas is screen/scaleFactor, so it is usually LARGER than the 1920x1080
     reference frame. Anything drawn outside the reference frame is only visible
     on some aspect ratios — that is exactly the class of bug that hides the
     item trays on a 16:10 laptop. */
  function offStageTest() {
    begin('Off-Stage / Layout Test');
    var rf = U.ref(), c = U.canvas();
    info('reference ' + rf[0] + 'x' + rf[1] + ' · canvas ' +
      Math.round(c[0]) + 'x' + Math.round(c[1]) + ' · scale ' + U.scale().toFixed(3));
    var outside = [], clipped = [];
    U.nodeList({ visibleOnly: true }).forEach(function (it) {
      if (U.isFullBleed(it.node)) return;
      var r = U.refRectOf(it.node.el);
      if (r.w < 2 || r.h < 2) return;
      if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > rf[0] || r.y > rf[1]) outside.push(it);
      else if (r.x < -1 || r.y < -1 || r.x + r.w > rf[0] + 1 || r.y + r.h > rf[1] + 1) clipped.push(it);
      var cr = it.node.el.getBoundingClientRect();
      if (cr.right < 0 || cr.bottom < 0 || cr.left > window.innerWidth || cr.top > window.innerHeight) {
        fail(it.name + ' is completely off-screen (' + Math.round(cr.left) + ',' + Math.round(cr.top) + ')');
      }
    });
    assert(!outside.length, outside.length + ' nodes fully outside the reference frame');
    outside.slice(0, 8).forEach(function (it) {
      var r = U.refRectOf(it.node.el);
      info('  ' + it.name + ' @ ' + Math.round(r.x) + ',' + Math.round(r.y));
    });
    if (clipped.length) {
      warn(clipped.length + ' nodes cross the reference frame edge (fine if intentional bleed)');
      clipped.slice(0, 8).forEach(function (it) {
        var r = U.refRectOf(it.node.el);
        info('  ' + it.name + ' ' + Math.round(r.x) + ',' + Math.round(r.y) +
          ' ' + Math.round(r.w) + 'x' + Math.round(r.h));
      });
    } else pass('no nodes clipped by the reference frame');
    end();
  }

  function interactionTest() {
    begin('Interaction Test');
    var items = U.nodeList({ visibleOnly: true }).filter(function (it) {
      return window.Controllers && Controllers.get('DraggableItem', it.id);
    });
    assert(items.length >= 1, items.length + ' draggable items on the active screen');
    items.forEach(function (it) {
      var d = Controllers.get('DraggableItem', it.id);
      info(it.name + ': dragEnabled=' + d.dragEnabled + ' locked=' + d.isLockedAfterDrop +
        ' weight=' + (d.itemData ? d.itemData.weight : '?'));
      var hit = it.node.hitEl;
      var box = hit ? U.stageRectOf(hit) : U.stageRectOf(it.node.el);
      if (box.w < 80 || box.h < 80) {
        fail(it.name + ' tap area is only ' + Math.round(box.w) + 'x' + Math.round(box.h) + ' (min 80x80)');
      } else pass(it.name + ' tap area ' + Math.round(box.w) + 'x' + Math.round(box.h));
    });

    var zones = [];
    U.nodeList({ visibleOnly: false }).forEach(function (it) {
      var z = window.Controllers && Controllers.get('BasketDropZone', it.id);
      if (z && Engine.activeInHierarchy(it.id)) zones.push({ it: it, z: z });
    });
    assert(zones.length >= 2, zones.length + ' drop zones live on the active screen');
    zones.forEach(function (e) {
      var centre = Engine.stagePos(e.z.node);
      var reachable = e.z.isNearDropZone(centre);
      (reachable ? pass : fail)((e.z.isLeftBasket ? 'left' : 'right') +
        ' basket drop area resolves at its own centre');
      info('  occupied: ' + (e.z.currentItemInBasket ? 'yes' : 'no'));
    });

    var anyDraggable = items.some(function (it) {
      var d = Controllers.get('DraggableItem', it.id);
      return d.dragEnabled && !d.isLockedAfterDrop;
    });
    (anyDraggable ? pass : warn)(anyDraggable
      ? 'at least one item is currently draggable'
      : 'nothing is draggable right now (instruction VO may still be playing)');
    end();
  }

  function assetTest() {
    begin('Asset Test');
    var paths = {};
    U.nodeList({ visibleOnly: false }).forEach(function (it) {
      var p = U.spriteOf(it.node);
      if (p) paths[p] = true;
    });
    var list = Object.keys(paths);
    info('checking ' + list.length + ' sprites referenced by this scene…');
    var done = 0, bad = 0;
    list.forEach(function (p) {
      var img = new Image();
      img.onload = function () { step(); };
      img.onerror = function () { bad++; fail('sprite failed to load: ' + p); step(); };
      img.src = p;
    });
    function step() {
      if (++done < list.length) return;
      (bad ? fail : pass)(bad ? bad + ' sprites missing' : 'all ' + list.length + ' sprites load');
      end();
    }
    if (!list.length) { warn('no sprites found'); end(); }
  }

  function runAll() {
    smokeTest(); levelDataTest(); screenFlowTest(); offStageTest(); interactionTest();
  }

  function copyReport() {
    U.copyText('Fancy Dress QA Report — ' + new Date().toString() + '\n' +
      'scene: ' + (window.Game ? Game.currentScene() : '?') + '\n\n' + report.join('\n'));
    U.toast('QA report copied');
  }

  // ---------------------------------------------------------------- panel ---
  function init() {
    panel = document.createElement('div');
    panel.className = 'godPanel';
    panel.id = 'godQaPanel';
    panel.innerHTML =
      '<div class="godHead"><b>QA Test Mode</b><span class="godSpacer"></span>' +
      '<button data-god-min title="Minimise">&minus;</button></div>' +
      '<div class="godBody">' +
      '<div class="godGrid">' +
      '<button id="qaSmoke">Smoke (Q)</button><button id="qaLevel">Level Data (L)</button>' +
      '<button id="qaFlow">Screen Flow</button><button id="qaOff">Off-Stage / Layout</button>' +
      '<button id="qaInter">Interaction</button><button id="qaAsset">Assets</button>' +
      '<button id="qaAll">Run All</button><button id="qaCopy">Copy Report</button>' +
      '</div><pre class="godOut" id="qaOutput">Ready.</pre></div>';
    document.getElementById('godModeRoot').appendChild(panel);
    out = panel.querySelector('#qaOutput');
    var bind = { qaSmoke: smokeTest, qaLevel: levelDataTest, qaFlow: screenFlowTest,
      qaOff: offStageTest, qaInter: interactionTest, qaAsset: assetTest,
      qaAll: runAll, qaCopy: copyReport };
    Object.keys(bind).forEach(function (id) {
      panel.querySelector('#' + id).addEventListener('click', bind[id]);
    });
  }

  return {
    init: init,
    panel: function () { return panel; },
    smokeTest: smokeTest, levelDataTest: levelDataTest, screenFlowTest: screenFlowTest,
    offStageTest: offStageTest, interactionTest: interactionTest, assetTest: assetTest,
    runAll: runAll, copyReport: copyReport
  };
};
