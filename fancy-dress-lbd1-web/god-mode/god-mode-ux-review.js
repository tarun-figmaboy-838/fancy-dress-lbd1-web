/* ============================================================================
 *  god-mode-ux-review.js — kid-focused UI/UX heuristics.
 *  Offending elements are highlighted on screen (uxIssue / uxWarning / uxGood)
 *  and explained in plain language. All sizes are judged in the 1920x1080
 *  design space, so the scale-to-fit transform can never fake a result.
 * ========================================================================== */
window.GodModeUXReview = function () {
  'use strict';

  var U = window.GodModeUtils;

  var MIN_TAP = 80;            // comfortable minimum for 5–7 year olds
  var MIN_TEXT = 24;
  var MAX_CHARS = 120;
  var MAX_KID_CHARS = 140;
  var META_WORDS = /\b(score|final score|round \d|combo|xp|points?|level \d)\b/i;

  var panel = null, out = null, marked = [], report = [];

  function begin(title) {
    report = ['=== ' + title + ' ==='];
    if (out) out.innerHTML = '<span class="head">' + U.esc(title) + '</span>\n';
  }
  function line(cls, msg) {
    report.push(msg);
    if (out) out.innerHTML += '<span class="' + cls + '">' + U.esc(msg) + '</span>\n';
  }
  var good = function (m) { line('ok', '✓ ' + m); };
  var issue = function (m) { line('bad', '✗ ' + m); };
  var maybe = function (m) { line('warn', '! ' + m); };
  var note = function (m) { line('dim', '   ' + m); };

  function mark(el, cls) {
    if (!el) return;
    el.classList.add(cls);
    marked.push([el, cls]);
  }
  function clear() {
    marked.forEach(function (p) { p[0].classList.remove(p[1]); });
    marked = [];
    if (panel) panel.classList.remove('godOpen');
  }

  function open() { if (panel) panel.classList.add('godOpen'); }

  // --------------------------------------------------------------- helpers --
  function visibleNodes() { return U.nodeList({ visibleOnly: true }); }

  function tappable(it) {
    var n = it.node;
    if (U.isFullBleed(n)) return false;
    if (n.button) return true;
    return !!(window.Controllers && Controllers.get('DraggableItem', it.id));
  }

  /* The real tap area is the raycastPadding inset when there is one. */
  function tapBox(n) {
    return U.refRectOf(n.hitEl || n.el);
  }

  // ---------------------------------------------------------------- checks --
  function tapTargets() {
    begin('Tap Targets'); open();
    var list = visibleNodes().filter(tappable);
    if (!list.length) { maybe('nothing tappable is on screen right now'); return; }
    var bad = 0;
    list.forEach(function (it) {
      var b = tapBox(it.node);
      if (b.w < MIN_TAP || b.h < MIN_TAP) {
        bad++;
        mark(it.node.hitEl || it.node.el, 'uxIssue');
        issue(it.name + ' is only ' + Math.round(b.w) + '×' + Math.round(b.h) +
          ' — small fingers need at least ' + MIN_TAP + '×' + MIN_TAP);
      } else {
        mark(it.node.hitEl || it.node.el, 'uxGood');
      }
    });
    if (!bad) good('all ' + list.length + ' tap targets are at least ' + MIN_TAP + '×' + MIN_TAP);
    note(list.length + ' tappable elements checked');
  }

  function textReadability() {
    begin('Text Readability'); open();
    var list = visibleNodes().filter(function (it) { return it.node.tmp && it.node.tmp.text; });
    if (!list.length) { maybe('no text visible on this screen'); return; }
    var bad = 0;
    list.forEach(function (it) {
      var t = it.node.tmp, el = it.node.textEl, name = it.name, mine = 0;
      if (t.fontSize < MIN_TEXT) {
        bad++; mine++; mark(it.node.el, 'uxIssue');
        issue(name + ' is set at ' + t.fontSize + 'px — under the ' + MIN_TEXT + 'px floor for young readers');
      }
      if (el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
        bad++; mine++; mark(it.node.el, 'uxIssue');
        issue(name + ' overflows its text area (' + el.scrollWidth + '×' + el.scrollHeight +
          ' inside ' + el.clientWidth + '×' + el.clientHeight + ')');
      }
      var lines = el ? Math.round(el.scrollHeight / Math.max(1, parseFloat(getComputedStyle(el).lineHeight))) : 1;
      if (lines > 1) {
        mark(it.node.el, 'uxWarning');
        maybe(name + ' wraps onto ' + lines + ' lines — instructions read best on one line');
      }
      if (String(t.text).length > MAX_CHARS) {
        mark(it.node.el, 'uxWarning');
        maybe(name + ' is ' + t.text.length + ' characters — long for this age group');
      }
      if (!mine) mark(it.node.el, 'uxGood');
    });
    if (!bad) good('every visible string is ≥ ' + MIN_TEXT + 'px and fits its box');
  }

  function visualHierarchy() {
    begin('Visual Hierarchy'); open();
    var items = visibleNodes().filter(function (it) {
      return window.Controllers && Controllers.get('DraggableItem', it.id);
    });
    if (items.length) {
      var areas = items.map(function (it) { var b = tapBox(it.node); return b.w * b.h; });
      var avg = areas.reduce(function (a, b) { return a + b; }, 0) / areas.length;
      if (avg < 40000) {
        maybe('the items average ' + Math.round(avg) + 'px² of artwork — they should be the ' +
          'clear focus of the screen');
        items.forEach(function (it) { mark(it.node.hitEl || it.node.el, 'uxWarning'); });
      } else good('the draggable items dominate the screen (avg ' + Math.round(avg) + 'px²)');
    } else note('no items visible to weigh up');

    visibleNodes().forEach(function (it) {
      if (!/message\s*bar/i.test(it.name)) return;
      var r = U.refRectOf(it.node.el);
      if (r.h > 300) {
        mark(it.node.el, 'uxWarning');
        maybe('the message bar is ' + Math.round(r.h) + 'px tall — it competes with the balance');
      } else good('the message bar stays out of the way (' + Math.round(r.h) + 'px tall)');
    });

    var buttons = visibleNodes().filter(function (it) { return it.node.button && !U.isFullBleed(it.node); });
    note(buttons.length + ' buttons visible: ' + buttons.map(function (b) { return b.name; }).join(', '));
  }

  function clutter() {
    begin('Clutter'); open();
    var screens = U.screens().filter(function (s) { return s.active; });
    if (screens.length > 1) {
      issue(screens.length + ' screens are showing at once (' +
        screens.map(function (s) { return s.name; }).join(' + ') + ')');
      screens.forEach(function (s) { mark(s.el, 'uxIssue'); });
    } else good('exactly one screen is showing' + (screens[0] ? ' (' + screens[0].name + ')' : ''));

    var interactive = visibleNodes().filter(tappable);
    if (interactive.length > 8) {
      maybe(interactive.length + ' interactive elements are live at once — that is a lot of choices');
    } else good(interactive.length + ' interactive elements on screen');

    var stray = visibleNodes().filter(function (it) {
      return /placeholder|test|temp|debug|copy \d/i.test(it.name);
    });
    if (stray.length) {
      stray.forEach(function (it) { mark(it.node.el, 'uxWarning'); });
      maybe('possible leftovers visible: ' + stray.map(function (s) { return s.name; }).join(', '));
    } else good('no leftover placeholder art on screen');
  }

  function kidFriendly() {
    begin('Kid-Friendly Check'); open();
    var list = visibleNodes().filter(function (it) { return it.node.tmp && it.node.tmp.text; });
    var bad = 0;
    list.forEach(function (it) {
      var text = String(it.node.tmp.text);
      if (META_WORDS.test(text)) {
        bad++; mark(it.node.el, 'uxIssue');
        issue(it.name + ' uses game-jargon a 5-year-old will not know: "' + text.slice(0, 60) + '"');
      }
      if (/\d/.test(text)) {
        bad++; mark(it.node.el, 'uxWarning');
        maybe(it.name + ' contains digits — this game teaches heavy vs light, not numbers: "' +
          text.slice(0, 60) + '"');
      }
      if (text.length > MAX_KID_CHARS) {
        bad++; mark(it.node.el, 'uxIssue');
        issue(it.name + ' is ' + text.length + ' characters — too much to listen through');
      }
    });
    if (!bad) good('all ' + list.length + ' visible strings read as child-friendly copy');

    // instruction copy for the whole scene, not just what is on screen now
    var scene = window.Game ? Game.currentScene() : '';
    var scripts = (window.SCENES[scene] || { scripts: {} }).scripts;
    var all = (scripts.WeightGameTutorialController || []).concat(scripts.TutorialManager || []);
    var longest = null;
    all.forEach(function (sc) {
      for (var k = 1; k <= 7; k++) {
        var m = sc.fields['instruction' + k];
        if (m && (!longest || m.length > longest.length)) longest = m;
      }
    });
    if (longest) note('longest instruction in this scene: ' + longest.length + ' chars — "' + longest + '"');
  }

  /* The reference frame is 1920x1080 but the canvas grows with the aspect
     ratio, so art placed outside the frame only shows up on some screens. */
  function designFrame() {
    begin('Design Frame'); open();
    var rf = U.ref();
    var offenders = [];
    visibleNodes().forEach(function (it) {
      if (U.isFullBleed(it.node)) return;
      var r = U.refRectOf(it.node.el);
      if (r.w < 2 || r.h < 2) return;
      if (r.x < -1 || r.y < -1 || r.x + r.w > rf[0] + 1 || r.y + r.h > rf[1] + 1) offenders.push([it, r]);
    });
    if (!offenders.length) {
      good('every visible element sits inside the ' + rf[0] + '×' + rf[1] + ' design frame');
      return;
    }
    offenders.forEach(function (p) {
      mark(p[0].node.el, 'uxWarning');
      maybe(p[0].name + ' reaches outside the design frame (' +
        Math.round(p[1].x) + ',' + Math.round(p[1].y) + ' ' +
        Math.round(p[1].w) + '×' + Math.round(p[1].h) + ') — it will be cropped on narrow screens');
    });
  }

  function runAll() {
    clear(); open();
    tapTargets();
    var keep = report.slice();
    textReadability(); keep = keep.concat(report);
    visualHierarchy(); keep = keep.concat(report);
    clutter(); keep = keep.concat(report);
    kidFriendly(); keep = keep.concat(report);
    designFrame(); keep = keep.concat(report);
    report = keep;
    // rebuild the full transcript in one pass so nothing is lost
    if (out) {
      out.innerHTML = keep.map(function (l) {
        var cls = l.indexOf('✗') === 0 ? 'bad' : l.indexOf('!') === 0 ? 'warn'
                : l.indexOf('✓') === 0 ? 'ok' : l.indexOf('===') === 0 ? 'head' : 'dim';
        return '<span class="' + cls + '">' + U.esc(l) + '</span>';
      }).join('\n');
      out.scrollTop = 0;
    }
  }

  function copyReport() {
    U.copyText('Fancy Dress UI/UX Review — ' + new Date().toString() + '\n\n' + report.join('\n'));
    U.toast('UX report copied');
  }

  function init() {
    panel = document.createElement('div');
    panel.className = 'godPanel';
    panel.id = 'godUxPanel';
    panel.innerHTML =
      '<div class="godHead"><b>UI/UX Review</b><span class="godSpacer"></span>' +
      '<button data-god-min title="Minimise">&minus;</button></div>' +
      '<div class="godBody">' +
      '<div class="godGrid">' +
      '<button id="uxAll">Start Review (V)</button><button id="uxTap">Tap Targets</button>' +
      '<button id="uxText">Text</button><button id="uxHier">Hierarchy</button>' +
      '<button id="uxClutter">Clutter</button><button id="uxKid">Kid-Friendly (K)</button>' +
      '<button id="uxFrame">Design Frame</button><button id="uxCopy">Copy Report</button>' +
      '</div>' +
      '<div class="godRow"><button id="uxClear" class="godWide godDanger">Clear Highlights (X)</button></div>' +
      '<pre class="godOut" id="uxOutput">Ready.</pre></div>';
    document.getElementById('godModeRoot').appendChild(panel);
    out = panel.querySelector('#uxOutput');
    var bind = { uxAll: runAll, uxTap: tapTargets, uxText: textReadability, uxHier: visualHierarchy,
      uxClutter: clutter, uxKid: kidFriendly, uxFrame: designFrame, uxCopy: copyReport, uxClear: clear };
    Object.keys(bind).forEach(function (id) {
      panel.querySelector('#' + id).addEventListener('click', function () {
        if (id !== 'uxClear' && id !== 'uxCopy' && id !== 'uxAll') clear();
        bind[id]();
      });
    });
  }

  return {
    init: init,
    panel: function () { return panel; },
    runAll: runAll, tapTargets: tapTargets, textReadability: textReadability,
    visualHierarchy: visualHierarchy, clutter: clutter, kidFriendly: kidFriendly,
    designFrame: designFrame, clear: clear, copyReport: copyReport
  };
};
